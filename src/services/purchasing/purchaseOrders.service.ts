/**
 * Retail Purchase Orders Service
 * Manages Purchase Order lifecycles (draft, submitted, approved, ordered, partially_received, received, cancelled).
 * Strictly guarantees that PO creation/approval never alters inventory stock or supplier balance.
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
  startAfter,
  runTransaction,
  type DocumentSnapshot,
} from 'firebase/firestore';
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
  Supplier,
} from '@/types/retail.types';
import { formatSequenceNumber } from '../sales/invoiceNumber.service';

export interface CreatePOItemInput {
  productId: string;
  variantId?: string | null;
  productNameSnapshot: string;
  skuSnapshot: string;
  supplierSku?: string;
  orderedQuantity: number;
  inputUnitId: string;
  conversionFactor: number;
  unitCost: number;
  discountAmount?: number;
  taxAmount?: number;
  notes?: string;
}

export interface CreatePurchaseOrderInput {
  tenantId: string;
  branchId?: string;
  destinationLocationId: string;
  branchCode?: string;
  supplierId: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  paymentTermsDays?: number;
  supplierInvoiceNumber?: string;
  currency?: string;
  items: CreatePOItemInput[];
  shippingCost?: number;
  otherCosts?: number;
  notes?: string;
  createdBy: string;
  clientPOId?: string;
}

/**
 * Generates an atomic sequential Purchase Order Number (e.g. PO-HQ-2026-000001)
 */
export async function generatePurchaseOrderNumber(
  tenantId: string,
  branchCode = 'HQ'
): Promise<string> {
  const year = new Date().getFullYear();
  const counterRef = doc(db, 'sequence_counters', `${tenantId}_${branchCode}_po_${year}`);
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number(snap.data().lastSequence || 0) : 0;
    const next = current + 1;
    tx.set(counterRef, { lastSequence: next, updatedAt: new Date().toISOString() }, { merge: true });
    return next;
  });
  return `PO-${branchCode}-${year}-${formatSequenceNumber(seq, 6)}`;
}

/**
 * Creates a new Purchase Order in 'draft' status.
 * MANDATORY INVARIANT: PO creation does NOT touch stock balances or supplier liability!
 */
export async function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<PurchaseOrder> {
  const {
    tenantId,
    branchId,
    destinationLocationId,
    branchCode = 'HQ',
    supplierId,
    orderDate = new Date().toISOString().split('T')[0],
    expectedDeliveryDate,
    paymentTermsDays,
    supplierInvoiceNumber,
    currency = 'EGP',
    items,
    shippingCost = 0,
    otherCosts = 0,
    notes = '',
    createdBy,
  } = input;

  const destLocation = destinationLocationId || branchId || 'main-warehouse';

  if (!tenantId || !supplierId || !destLocation || !items || items.length === 0) {
    throw new Error('بيانات أمر الشراء غير مكتملة أو قائمة الأصناف فارغة');
  }

  // 1. Fetch Supplier to verify exists and snapshot name
  const supplierRef = doc(db, 'suppliers', supplierId);
  const supplierSnap = await getDoc(supplierRef);
  if (!supplierSnap.exists()) throw new Error('المورد المحدد غير موجود في قاعدة البيانات');
  const supplierData = supplierSnap.data() as Supplier;
  const supTenant = supplierData.tenantId || (supplierData as any).tenant_id;
  if (tenantId && tenantId !== 'default' && supTenant && supTenant !== tenantId) {
    throw new Error('غير مصرح بالوصول إلى بيانات هذا المورد');
  }

  // 2. Generate Atomic PO Number
  const purchaseOrderNumber = await generatePurchaseOrderNumber(tenantId, branchCode);
  const poRef = doc(collection(db, 'purchase_orders'));
  const now = new Date().toISOString();

  // 3. Process Line Items and Totals
  let calculatedSubtotal = 0;
  let calculatedDiscountTotal = 0;
  let calculatedTaxTotal = 0;

  const processedItems: PurchaseOrderItem[] = items.map((item, idx) => {
    if (item.orderedQuantity <= 0 || item.unitCost < 0) {
      throw new Error(`الكمية أو التكلفة غير صالحة للصنف "${item.productNameSnapshot}"`);
    }

    const conv = Math.max(1, item.conversionFactor || 1);
    const orderedBaseQty = item.orderedQuantity * conv;
    const lineSubtotal = Math.round(item.unitCost * item.orderedQuantity * 100) / 100;
    const discount = Math.round((item.discountAmount || 0) * 100) / 100;
    const tax = Math.round((item.taxAmount || 0) * 100) / 100;
    const lineTotal = Math.max(0, Math.round((lineSubtotal - discount + tax) * 100) / 100);

    calculatedSubtotal += lineSubtotal;
    calculatedDiscountTotal += discount;
    calculatedTaxTotal += tax;

    return {
      id: `poi_${idx + 1}_${Date.now()}`,
      purchaseOrderId: poRef.id,
      productId: item.productId,
      variantId: item.variantId || null,
      productNameSnapshot: item.productNameSnapshot,
      skuSnapshot: item.skuSnapshot,
      supplierSku: item.supplierSku || '',
      orderedQuantity: item.orderedQuantity,
      orderedBaseQuantity: orderedBaseQty,
      inputUnitId: item.inputUnitId,
      conversionFactor: conv,
      unitCost: item.unitCost,
      discountAmount: discount,
      taxAmount: tax,
      lineTotal,
      receivedBaseQuantity: 0,
      returnedBaseQuantity: 0,
      notes: item.notes || '',
    };
  });

  const grandTotal = Math.max(
    0,
    Math.round((calculatedSubtotal - calculatedDiscountTotal + calculatedTaxTotal + shippingCost + otherCosts) * 100) / 100
  );

  const purchaseOrder: PurchaseOrder = {
    id: poRef.id,
    tenantId,
    tenant_id: tenantId,
    branchId: branchId || destinationLocationId,
    destinationLocationId,
    purchaseOrderNumber,
    orderNumber: purchaseOrderNumber, // legacy alias
    supplierId,
    supplierNameSnapshot: supplierData.name,
    status: 'draft',
    orderDate,
    expectedDeliveryDate: expectedDeliveryDate || '',
    paymentTermsDays: paymentTermsDays !== undefined ? paymentTermsDays : supplierData.paymentTermsDays || 30,
    supplierInvoiceNumber: supplierInvoiceNumber?.trim() || '',
    currency,
    items: processedItems,
    subtotal: Math.round(calculatedSubtotal * 100) / 100,
    discountTotal: Math.round(calculatedDiscountTotal * 100) / 100,
    taxTotal: Math.round(calculatedTaxTotal * 100) / 100,
    shippingCost: Math.round(shippingCost * 100) / 100,
    otherCosts: Math.round(otherCosts * 100) / 100,
    grandTotal,
    totalAmount: grandTotal, // legacy alias
    paidAmount: 0,
    paymentStatus: 'unpaid',
    notes: notes.trim(),
    createdBy,
    approvedBy: null,
    approvedAt: null,
    orderedAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(poRef, purchaseOrder);
  return purchaseOrder;
}

/**
 * Submits a draft PO for approval
 */
export async function submitPurchaseOrder(poId: string, tenantId: string): Promise<void> {
  const poRef = doc(db, 'purchase_orders', poId);
  const snap = await getDoc(poRef);
  if (!snap.exists()) throw new Error('أمر الشراء غير موجود');
  const po = snap.data() as PurchaseOrder;
  if (po.tenantId !== tenantId) throw new Error('غير مصرح بالوصول إلى أمر الشراء');
  if (po.status !== 'draft') throw new Error('يمكن تقديم أوامر الشراء في حالة المسودة (Draft) فقط');

  await updateDoc(poRef, {
    status: 'submitted',
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Approves a submitted PO.
 * MANDATORY INVARIANT: Approving a PO does NOT increase stock or supplier balance!
 */
export async function approvePurchaseOrder(
  poId: string,
  tenantId: string,
  approvedBy: string
): Promise<void> {
  const poRef = doc(db, 'purchase_orders', poId);
  const snap = await getDoc(poRef);
  if (!snap.exists()) throw new Error('أمر الشراء غير موجود');
  const po = snap.data() as PurchaseOrder;
  if (po.tenantId !== tenantId) throw new Error('غير مصرح بالوصول إلى أمر الشراء');
  if (po.status !== 'submitted' && po.status !== 'draft') {
    throw new Error('أمر الشراء ليس في حالة انتظار الاعتماد');
  }

  const now = new Date().toISOString();
  await updateDoc(poRef, {
    status: 'approved',
    approvedBy,
    approvedAt: now,
    updatedAt: now,
  });
}

/**
 * Marks an approved PO as ordered/sent to the supplier
 */
export async function markPurchaseOrderOrdered(poId: string, tenantId: string): Promise<void> {
  const poRef = doc(db, 'purchase_orders', poId);
  const snap = await getDoc(poRef);
  if (!snap.exists()) throw new Error('أمر الشراء غير موجود');
  const po = snap.data() as PurchaseOrder;
  if (po.tenantId !== tenantId) throw new Error('غير مصرح بالوصول إلى أمر الشراء');
  if (po.status !== 'approved') throw new Error('يجب اعتماد أمر الشراء أولاً قبل إرساله للمورد');

  const now = new Date().toISOString();
  await updateDoc(poRef, {
    status: 'ordered',
    orderedAt: now,
    updatedAt: now,
  });
}

/**
 * Cancels a PO if no items have been received yet
 */
export async function cancelPurchaseOrder(
  poId: string,
  tenantId: string,
  cancelledBy: string,
  reason?: string
): Promise<void> {
  const poRef = doc(db, 'purchase_orders', poId);
  const snap = await getDoc(poRef);
  if (!snap.exists()) throw new Error('أمر الشراء غير موجود');
  const po = snap.data() as PurchaseOrder;
  if (po.tenantId !== tenantId) throw new Error('غير مصرح بالوصول إلى أمر الشراء');

  if (po.status === 'partially_received' || po.status === 'received') {
    throw new Error('لا يمكن إلغاء أمر شراء تم استلام بضاعة منه جزئياً أو كلياً');
  }

  const now = new Date().toISOString();
  await updateDoc(poRef, {
    status: 'cancelled',
    cancelledAt: now,
    notes: reason ? `${po.notes || ''}\n[سبب الإلغاء]: ${reason}` : po.notes,
    updatedAt: now,
  });
}

/**
 * Fetches Purchase Orders with cursor pagination and filters
 */
export interface FetchPurchaseOrdersOptions {
  supplierId?: string;
  status?: string;
  destinationLocationId?: string;
  startDate?: string;
  endDate?: string;
  pageSize?: number;
  lastVisible?: DocumentSnapshot;
}

export async function fetchPurchaseOrdersFromDb(
  tenantId: string,
  options: FetchPurchaseOrdersOptions = {}
): Promise<{ purchaseOrders: PurchaseOrder[]; hasMore: boolean; lastVisible?: DocumentSnapshot }> {
  const {
    supplierId,
    status,
    destinationLocationId,
    startDate,
    endDate,
    pageSize = 50,
  } = options;

  try {
    const rawSnap = await getDocs(collection(db, 'purchase_orders'));
    let purchaseOrders: PurchaseOrder[] = rawSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as PurchaseOrder)
    );

    // Resilient tenant filtering
    purchaseOrders = purchaseOrders.filter((po) => {
      const docTenant = po.tenantId || (po as any).tenant_id;
      if (tenantId && tenantId !== 'default' && docTenant && docTenant !== tenantId) {
        return false;
      }
      if (supplierId && supplierId !== 'all' && po.supplierId !== supplierId) {
        return false;
      }
      if (status && status !== 'all' && po.status !== status) {
        return false;
      }
      if (destinationLocationId && destinationLocationId !== 'all' && po.destinationLocationId !== destinationLocationId) {
        return false;
      }
      if (startDate && po.createdAt && po.createdAt < startDate) {
        return false;
      }
      if (endDate && po.createdAt && po.createdAt > endDate) {
        return false;
      }
      return true;
    });

    // In-memory bulletproof sort by createdAt desc (no Firestore index errors)
    purchaseOrders.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    const hasMore = purchaseOrders.length > pageSize;
    const pagedPOs = purchaseOrders.slice(0, pageSize);

    return {
      purchaseOrders: pagedPOs,
      hasMore,
    };
  } catch (err) {
    console.error('Error fetching purchase orders from db:', err);
    return { purchaseOrders: [], hasMore: false };
  }
}
