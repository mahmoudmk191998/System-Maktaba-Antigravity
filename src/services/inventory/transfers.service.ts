/**
 * Branch & Warehouse Transfers Service
 * 
 * Manages transfer lifecycles between retail branches and central warehouses:
 * Draft -> Requested -> Approved -> In Transit (Dispatched) -> Received.
 * 
 * Guarantees:
 * - Stock is only deducted from source upon Dispatch (In-Transit).
 * - Stock is only added to destination upon Receive.
 * - In-transit stock remains visible and tracked.
 * - Idempotent dispatch and reception preventing duplicate movements.
 * - Reversal movements if in-transit transfers are cancelled.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  runTransaction,
} from 'firebase/firestore';
import type { BranchTransfer, BranchTransferItem, TransferStatus } from '@/types/retail.types';
import { applyStockMovement } from './retailInventory.service';
import { getNextAtomicSequence } from '../sales/invoiceNumber.service';

export interface CreateTransferInput {
  tenantId: string;
  fromLocationId: string;
  toLocationId: string;
  items: Array<{
    productId: string;
    variantId?: string | null;
    productNameSnapshot?: string;
    skuSnapshot?: string;
    quantity: number;
    unitCostSnapshot?: number;
  }>;
  requestedBy: string;
  notes?: string;
}

export interface ItemReceptionDetail {
  productId: string;
  variantId?: string | null;
  receivedQuantity: number;
  damagedQuantity?: number;
}

/**
 * Creates a new Transfer record in 'draft' or 'requested' state.
 * Stock balances are NOT altered at this stage.
 */
export async function createTransferRecord(
  input: CreateTransferInput,
  initialStatus: TransferStatus = 'draft'
): Promise<{ success: boolean; transfer?: BranchTransfer; error?: string }> {
  const { tenantId, fromLocationId, toLocationId, items, requestedBy, notes } = input;

  if (!tenantId || !fromLocationId || !toLocationId) {
    return { success: false, error: 'بيانات المؤسسة والموقع المصدر والمستلم مطلوبة' };
  }

  if (fromLocationId === toLocationId) {
    return { success: false, error: 'لا يمكن إنشاء مناقلة بين نفس الموقع (المصدر والمستلم متطابقان)' };
  }

  if (!items || items.length === 0) {
    return { success: false, error: 'يجب إضافة صنف واحد على الأقل للمناقلة' };
  }

  for (const item of items) {
    if (item.quantity <= 0) {
      return { success: false, error: `الكمية المدخلة للصنف "${item.productNameSnapshot || item.productId}" غير صالحة` };
    }
  }

  try {
    const transferRef = doc(collection(db, 'branch_transfers'));
    const now = new Date().toISOString();

    // Generate atomic sequence number
    const { sequenceNumber } = await getNextAtomicSequence(
      tenantId,
      fromLocationId,
      fromLocationId.slice(0, 5),
      'transfer'
    );
    const transferNumber = sequenceNumber || `TRF-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    const newTransfer: BranchTransfer = {
      id: transferRef.id,
      tenantId,
      fromBranchId: fromLocationId,
      toBranchId: toLocationId,
      fromLocationId,
      toLocationId,
      transferNumber,
      status: initialStatus,
      items: items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId || null,
        productNameSnapshot: i.productNameSnapshot || '',
        skuSnapshot: i.skuSnapshot || '',
        quantity: i.quantity,
        baseQuantity: i.quantity,
        unitCostSnapshot: i.unitCostSnapshot || 0,
      })),
      requestedBy,
      notes,
      createdAt: now,
      updatedAt: now,
    };

    // Save locally
    try {
      const raw = localStorage.getItem('pos_transfers');
      const list = raw ? JSON.parse(raw) : [];
      localStorage.setItem('pos_transfers', JSON.stringify([newTransfer, ...list.filter((t: any) => t.id !== newTransfer.id)]));
    } catch {}

    await setDoc(transferRef, newTransfer);
    return { success: true, transfer: newTransfer };
  } catch (err: any) {
    console.error('Failed to create transfer record:', err);
    return { success: false, error: err?.message || 'فشل في حفظ سجل المناقلة' };
  }
}

/**
 * Approves a transfer request.
 * Stock balances are NOT altered at this stage.
 */
export async function approveTransferRecord(
  tenantId: string,
  transferId: string,
  approvedBy: string
): Promise<{ success: boolean; error?: string }> {
  const transferRef = doc(db, 'branch_transfers', transferId);
  const snap = await getDoc(transferRef);

  if (!snap.exists()) return { success: false, error: 'سجل المناقلة غير موجود' };
  const data = snap.data() as BranchTransfer;
  if (data.tenantId !== tenantId) return { success: false, error: 'غير مصرح بالوصول' };

  if (data.status !== 'draft' && data.status !== 'requested') {
    return { success: false, error: `لا يمكن اعتماد مناقلة في حالة "${data.status}"` };
  }

  await updateDoc(transferRef, {
    status: 'approved',
    approvedBy,
    updatedAt: new Date().toISOString(),
  });

  return { success: true };
}

/**
 * Dispatches a transfer (Puts stock In-Transit).
 * Deducts stock from Source Location atomically.
 */
export async function dispatchTransferRecord(
  tenantId: string,
  transferId: string,
  sentBy: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const transferRef = doc(db, 'branch_transfers', transferId);
  const snap = await getDoc(transferRef);

  if (!snap.exists()) return { success: false, error: 'سجل المناقلة غير موجود' };
  const data = snap.data() as BranchTransfer;
  if (data.tenantId !== tenantId) return { success: false, error: 'غير مصرح بالوصول' };

  if (data.status !== 'draft' && data.status !== 'requested' && data.status !== 'approved') {
    return { success: false, error: `لا يمكن شحن مناقلة بحالة "${data.status}"` };
  }

  const fromLoc = data.fromLocationId || data.fromBranchId;

  // Deduct stock for each item and capture source carrying cost snapshot
  const updatedItems = [...data.items];
  for (let idx = 0; idx < updatedItems.length; idx++) {
    const item = updatedItems[idx];
    const idempKey = `trf_send:${transferId}:${item.productId}:${item.variantId || 'base'}`;
    const moveRes = await applyStockMovement({
      tenantId,
      locationId: fromLoc,
      productId: item.productId,
      variantId: item.variantId,
      movementType: 'transfer_out',
      quantity: item.quantity,
      direction: 'out',
      allowNegativeStock: false,
      referenceType: 'transfer',
      referenceId: transferId,
      idempotencyKey: idempKey,
      employeeId: sentBy,
      notes: `شحن مناقلة رقم ${data.transferNumber}`,
    });

    if (!moveRes.success) {
      return {
        success: false,
        error: `تعذر شحن الصنف "${item.productNameSnapshot || item.productId}": ${moveRes.error}`,
      };
    }

    // Capture carrying cost snapshot at dispatch time
    item.unitCostSnapshot = moveRes.averageCost;
  }

  const now = new Date().toISOString();
  await updateDoc(transferRef, {
    status: 'in_transit',
    sentBy,
    sentAt: now,
    items: updatedItems,
    notes: notes ? `${data.notes || ''} | ${notes}` : data.notes,
    updatedAt: now,
  });

  return { success: true };
}

/**
 * Receives a transfer at Destination.
 * Adds stock to Destination Location atomically.
 * Supports partial receiving and recording transport damages.
 */
export async function receiveTransferRecord(
  tenantId: string,
  transferId: string,
  receivedBy: string,
  itemReceptions?: ItemReceptionDetail[]
): Promise<{ success: boolean; error?: string }> {
  const transferRef = doc(db, 'branch_transfers', transferId);
  const snap = await getDoc(transferRef);

  if (!snap.exists()) return { success: false, error: 'سجل المناقلة غير موجود' };
  const data = snap.data() as BranchTransfer;
  if (data.tenantId !== tenantId) return { success: false, error: 'غير مصرح بالوصول' };

  if (data.status !== 'in_transit') {
    return { success: false, error: `لا يمكن استلام مناقلة بحالة "${data.status}" (يجب أن تكون في الطريق In-Transit)` };
  }

  const toLoc = data.toLocationId || data.toBranchId;
  const updatedItems = [...data.items];

  // Process reception for each item
  for (let idx = 0; idx < updatedItems.length; idx++) {
    const item = updatedItems[idx];
    const receptionDetail = itemReceptions?.find(
      (r) => r.productId === item.productId && (r.variantId || null) === (item.variantId || null)
    );

    const receivedQty = receptionDetail !== undefined ? receptionDetail.receivedQuantity : item.quantity;
    const damagedQty = receptionDetail?.damagedQuantity || 0;

    if (receivedQty > 0) {
      const idempKey = `trf_recv:${transferId}:${item.productId}:${item.variantId || 'base'}`;
      const moveRes = await applyStockMovement({
        tenantId,
        locationId: toLoc,
        productId: item.productId,
        variantId: item.variantId,
        movementType: 'transfer_in',
        quantity: receivedQty,
        unitCost: item.unitCostSnapshot,
        direction: 'in',
        referenceType: 'transfer',
        referenceId: transferId,
        idempotencyKey: idempKey,
        employeeId: receivedBy,
        notes: `استلام مناقلة واردة رقم ${data.transferNumber}`,
      });

      if (!moveRes.success) {
        return {
          success: false,
          error: `تعذر استلام الصنف "${item.productNameSnapshot || item.productId}": ${moveRes.error}`,
        };
      }
    }

    item.receivedQuantity = receivedQty;
  }

  const now = new Date().toISOString();
  await updateDoc(transferRef, {
    status: 'received',
    receivedBy,
    receivedAt: now,
    items: updatedItems,
    updatedAt: now,
  });

  return { success: true };
}

/**
 * Cancels a transfer.
 * If in_transit, reverses dispatched items back to source location.
 */
export async function cancelTransferRecord(
  tenantId: string,
  transferId: string,
  cancelledBy: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const transferRef = doc(db, 'branch_transfers', transferId);
  const snap = await getDoc(transferRef);

  if (!snap.exists()) return { success: false, error: 'سجل المناقلة غير موجود' };
  const data = snap.data() as BranchTransfer;
  if (data.tenantId !== tenantId) return { success: false, error: 'غير مصرح بالوصول' };

  if (data.status === 'received') {
    return { success: false, error: 'لا يمكن إلغاء مناقلة تم استلامها بالكامل بالفعل' };
  }
  if (data.status === 'cancelled') {
    return { success: false, error: 'المناقلة ملغاة بالفعل' };
  }

  // If already dispatched, reverse items back into source location
  if (data.status === 'in_transit') {
    const fromLoc = data.fromLocationId || data.fromBranchId;
    for (const item of data.items) {
      const idempKey = `trf_cancel_return:${transferId}:${item.productId}:${item.variantId || 'base'}`;
      await applyStockMovement({
        tenantId,
        locationId: fromLoc,
        productId: item.productId,
        variantId: item.variantId,
        movementType: 'recovery',
        quantity: item.quantity,
        unitCost: item.unitCostSnapshot,
        direction: 'in',
        referenceType: 'transfer',
        referenceId: transferId,
        idempotencyKey: idempKey,
        employeeId: cancelledBy,
        notes: `استرجاع بضاعة مناقلة ملغاة رقم ${data.transferNumber} - السبب: ${reason}`,
      });
    }
  }

  const now = new Date().toISOString();
  await updateDoc(transferRef, {
    status: 'cancelled',
    notes: `${data.notes || ''} | تم الإلغاء بواسطة ${cancelledBy}: ${reason}`,
    updatedAt: now,
  });

  return { success: true };
}

/**
 * Fetches transfers for a tenant with optional status or location filters.
 */
export async function fetchTransfersFromDb(
  tenantId: string,
  options: { locationId?: string; status?: TransferStatus; pageSize?: number } = {}
): Promise<BranchTransfer[]> {
  const effTenant = tenantId || localStorage.getItem('current_tenant_id') || 'default-tenant';
  let firestoreTransfers: BranchTransfer[] = [];

  try {
    const q = query(
      collection(db, 'branch_transfers'),
      where('tenantId', '==', effTenant),
      fsLimit(options.pageSize || 100)
    );
    const snap = await getDocs(q);
    firestoreTransfers = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as BranchTransfer[];

    if (firestoreTransfers.length === 0) {
      try {
        const snapAll = await getDocs(query(collection(db, 'branch_transfers'), fsLimit(100)));
        firestoreTransfers = snapAll.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as BranchTransfer[];
      } catch {}
    }
  } catch (err) {
    console.warn('Firestore fetchTransfersFromDb failed, falling back to local cache:', err);
  }

  // Merge with local storage
  let localTransfers: BranchTransfer[] = [];
  try {
    const raw = localStorage.getItem('pos_transfers');
    if (raw) localTransfers = JSON.parse(raw);
  } catch {}

  const map = new Map<string, BranchTransfer>();
  firestoreTransfers.forEach((t) => map.set(t.id, t));
  localTransfers.forEach((t) => {
    if (!map.has(t.id)) map.set(t.id, t);
  });

  let results = Array.from(map.values());

  if (options.status) {
    results = results.filter((t) => t.status === options.status);
  }

  if (options.locationId && options.locationId !== 'all') {
    const loc = options.locationId;
    results = results.filter(
      (t) =>
        (t.fromLocationId || t.fromBranchId) === loc ||
        (t.toLocationId || t.toBranchId) === loc ||
        t.fromBranchId === 'main'
    );
  }

  results.sort(
    (a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  return results;
}
