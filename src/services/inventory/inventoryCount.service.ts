/**
 * Physical Inventory Count (Stocktake) Service
 * 
 * Manages physical stock audits and reconciliation in retail branches & warehouses.
 * Features:
 * - Expected quantity snapshot at count initiation
 * - Fast barcode scanning & manual entry
 * - Variance & financial discrepancy calculations
 * - Atomic posting of inventory count adjustments
 * - Zero double-posting guarantee via idempotency
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
} from 'firebase/firestore';
import type {
  InventoryCountSession,
  InventoryCountItem,
  InventoryCountStatus,
  StockBalance,
} from '@/types/retail.types';
import { applyStockMovement, fetchStockBalancesFromDb } from './retailInventory.service';
import { findProductOrVariantByBarcode } from '../products/products.repository';
import { getNextAtomicSequence } from '../sales/invoiceNumber.service';

export interface StartCountSessionInput {
  tenantId: string;
  locationId: string;
  startedBy: string;
  notes?: string;
  categoryFilterId?: string;
}

/**
 * Starts a new physical inventory count session.
 * Freezes an expected quantity snapshot of stock balances in the location.
 */
export async function startInventoryCountSession(
  input: StartCountSessionInput
): Promise<{ success: boolean; session?: InventoryCountSession; error?: string }> {
  const { tenantId, locationId, startedBy, notes } = input;

  if (!tenantId || !locationId) {
    return { success: false, error: 'بيانات المؤسسة والموقع مطلوبة' };
  }

  try {
    // 1. Fetch current stock balance snapshot for this location
    const balanceResult = await fetchStockBalancesFromDb(tenantId, {
      locationId,
      pageSize: 500,
    });

    const now = new Date().toISOString();

    const { sequenceNumber } = await getNextAtomicSequence(
      tenantId,
      locationId,
      locationId.slice(0, 5),
      'stocktake'
    );
    const sessionNumber = sequenceNumber || `ST-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    // Build count items from snapshot
    const items: InventoryCountItem[] = balanceResult.balances.map((b) => {
      const exp = b.onHandQuantity ?? b.quantity ?? 0;
      const cost = b.averageCost ?? b.unitCost ?? 0;
      return {
        productId: b.productId,
        variantId: b.variantId || null,
        expectedQuantity: exp,
        countedQuantity: 0,
        difference: -exp,
        unitCostSnapshot: cost,
        financialVariance: Math.round(-exp * cost * 100) / 100,
        status: exp === 0 ? 'matched' : 'shortage',
      };
    });

    const sessionRef = doc(collection(db, 'inventory_counts'));
    const session: InventoryCountSession = {
      id: sessionRef.id,
      tenantId,
      branchId: locationId,
      locationId,
      sessionNumber,
      status: 'in_progress',
      items,
      startedBy,
      startedAt: now,
      totalDifferenceValue: items.reduce((acc, i) => acc + (i.financialVariance || 0), 0),
      notes,
      createdAt: now,
      updatedAt: now,
    };

    // Save locally
    try {
      const raw = localStorage.getItem('pos_inventory_counts');
      const list = raw ? JSON.parse(raw) : [];
      localStorage.setItem('pos_inventory_counts', JSON.stringify([session, ...list.filter((s: any) => s.id !== session.id)]));
    } catch {}

    await setDoc(sessionRef, session);
    return { success: true, session };
  } catch (err: any) {
    console.error('Failed to start count session:', err);
    return { success: false, error: err?.message || 'فشل في بدء جلسة الجرد' };
  }
}

/**
 * Scans a barcode or SKU and increments the counted quantity for the item.
 * Strictly verifies barcode existence in product catalog.
 */
export async function recordBarcodeScanInCount(
  tenantId: string,
  sessionId: string,
  barcode: string,
  incrementQty: number = 1
): Promise<{ success: boolean; item?: InventoryCountItem; error?: string }> {
  if (!barcode || barcode.trim() === '') {
    return { success: false, error: 'الباركود مطلوب' };
  }

  // 1. Verify existence in product catalog
  const found = await findProductOrVariantByBarcode(tenantId, barcode);
  if (!found) {
    return {
      success: false,
      error: `الباركود "${barcode}" غير مسجل في فهرس المنتجات. يرجى إضافته إلى الفهرس أولاً.`,
    };
  }

  const sessionRef = doc(db, 'inventory_counts', sessionId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) return { success: false, error: 'جلسة الجرد غير موجودة' };

  const session = snap.data() as InventoryCountSession;
  if (session.status !== 'in_progress') {
    return { success: false, error: `لا يمكن تسجيل قراءات لجلسة بحالة "${session.status}"` };
  }

  const pId = found.product.id;
  const vId = found.variant?.id || null;

  const items = [...session.items];
  let targetItem = items.find(
    (i) => i.productId === pId && (i.variantId || null) === vId
  );

  if (!targetItem) {
    // Product exists in catalog but had 0 stock snapshot in this location
    const cost = found.variant?.cost || found.product.purchasePrice || 0;
    targetItem = {
      productId: pId,
      variantId: vId,
      productNameSnapshot: found.variant ? `${found.product.name} (${found.variant.name})` : found.product.name,
      skuSnapshot: found.variant?.sku || found.product.sku,
      barcodeSnapshot: barcode,
      expectedQuantity: 0,
      countedQuantity: incrementQty,
      difference: incrementQty,
      unitCostSnapshot: cost,
      financialVariance: Math.round(incrementQty * cost * 100) / 100,
      status: 'overage',
    };
    items.push(targetItem);
  } else {
    targetItem.countedQuantity = Math.round((targetItem.countedQuantity + incrementQty) * 1000) / 1000;
    targetItem.difference = Math.round((targetItem.countedQuantity - targetItem.expectedQuantity) * 1000) / 1000;
    targetItem.financialVariance = Math.round(targetItem.difference * targetItem.unitCostSnapshot * 100) / 100;
    targetItem.status =
      targetItem.difference === 0 ? 'matched' : targetItem.difference > 0 ? 'overage' : 'shortage';
  }

  const totalVariance = items.reduce((acc, i) => acc + (i.financialVariance || 0), 0);
  const now = new Date().toISOString();

  await updateDoc(sessionRef, {
    items,
    totalDifferenceValue: Math.round(totalVariance * 100) / 100,
    updatedAt: now,
  });

  return { success: true, item: targetItem };
}

/**
 * Manually updates the counted quantity for a specific item in a session.
 */
export async function updateCountItemQuantity(
  sessionId: string,
  productId: string,
  variantId: string | null | undefined,
  newCountedQty: number,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  const sessionRef = doc(db, 'inventory_counts', sessionId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) return { success: false, error: 'جلسة الجرد غير موجودة' };

  const session = snap.data() as InventoryCountSession;
  if (session.status !== 'in_progress') {
    return { success: false, error: `لا يمكن تعديل جلسة بحالة "${session.status}"` };
  }

  const items = [...session.items];
  const targetItem = items.find(
    (i) => i.productId === productId && (i.variantId || null) === (variantId || null)
  );

  if (!targetItem) {
    return { success: false, error: 'الصنف غير موجود في جلسة الجرد' };
  }

  targetItem.countedQuantity = Math.max(0, newCountedQty);
  targetItem.difference = Math.round((targetItem.countedQuantity - targetItem.expectedQuantity) * 1000) / 1000;
  targetItem.financialVariance = Math.round(targetItem.difference * targetItem.unitCostSnapshot * 100) / 100;
  targetItem.status =
    targetItem.difference === 0 ? 'matched' : targetItem.difference > 0 ? 'overage' : 'shortage';
  if (notes) targetItem.notes = notes;

  const totalVariance = items.reduce((acc, i) => acc + (i.financialVariance || 0), 0);
  const now = new Date().toISOString();

  await updateDoc(sessionRef, {
    items,
    totalDifferenceValue: Math.round(totalVariance * 100) / 100,
    updatedAt: now,
  });

  return { success: true };
}

/**
 * Posts an inventory count session.
 * For each discrepancy between expected and actual count, applies an atomic stock movement.
 * Idempotent: cannot post the same session twice.
 */
export async function postInventoryCountSession(
  tenantId: string,
  sessionId: string,
  postedBy: string
): Promise<{ success: boolean; appliedMovementsCount?: number; error?: string }> {
  const sessionRef = doc(db, 'inventory_counts', sessionId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) return { success: false, error: 'جلسة الجرد غير موجودة' };

  const session = snap.data() as InventoryCountSession;
  if (session.tenantId !== tenantId) return { success: false, error: 'غير مصرح بالوصول' };

  if (session.status === 'posted' || session.status === 'completed' || session.status === 'reconciled') {
    return { success: false, error: 'هذه الجلسة تم ترحيلها مسبقاً ولا يمكن ترحيلها مرتين' };
  }
  if (session.status === 'cancelled') {
    return { success: false, error: 'لا يمكن ترحيل جلسة جرد ملغاة' };
  }

  const locId = session.locationId || session.branchId;
  let appliedCount = 0;

  for (const item of session.items) {
    if (item.difference === 0) continue; // No difference, balance is matched

    const direction = item.difference > 0 ? 'in' : 'out';
    const movementType = direction === 'in' ? 'stock_adjustment_in' : 'stock_adjustment_out';
    const idempKey = `count_post:${sessionId}:${item.productId}:${item.variantId || 'base'}`;

    const moveRes = await applyStockMovement({
      tenantId,
      locationId: locId,
      productId: item.productId,
      variantId: item.variantId,
      movementType,
      direction,
      quantity: Math.abs(item.difference),
      unitCost: item.unitCostSnapshot,
      allowNegativeStock: false,
      referenceType: 'inventory_count',
      referenceId: sessionId,
      idempotencyKey: idempKey,
      employeeId: postedBy,
      reason: `تسوية جرد فعلي (جلسة ${session.sessionNumber}) - فرق: ${item.difference}`,
      notes: item.notes,
    });

    if (!moveRes.success) {
      return {
        success: false,
        error: `فشل ترحيل فرق الصنف "${item.productId}": ${moveRes.error}`,
      };
    }

    appliedCount++;
  }

  const now = new Date().toISOString();
  await updateDoc(sessionRef, {
    status: 'posted',
    postedBy,
    postedAt: now,
    reconciledBy: postedBy,
    reconciledAt: now,
    updatedAt: now,
  });

  return { success: true, appliedMovementsCount: appliedCount };
}

/**
 * Fetches count sessions for a tenant with in-memory filtering and dual-sync.
 */
export async function fetchCountSessionsFromDb(
  tenantId: string,
  locationId?: string
): Promise<InventoryCountSession[]> {
  const effTenant = tenantId || localStorage.getItem('current_tenant_id') || 'default-tenant';
  let firestoreSessions: InventoryCountSession[] = [];

  try {
    const q = query(
      collection(db, 'inventory_counts'),
      where('tenantId', '==', effTenant),
      fsLimit(100)
    );
    const snap = await getDocs(q);
    firestoreSessions = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as InventoryCountSession[];

    if (firestoreSessions.length === 0) {
      try {
        const snapAll = await getDocs(query(collection(db, 'inventory_counts'), fsLimit(100)));
        firestoreSessions = snapAll.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as InventoryCountSession[];
      } catch {}
    }
  } catch (err) {
    console.warn('Firestore fetchCountSessionsFromDb failed, falling back to local cache:', err);
  }

  // Merge with local storage
  let localSessions: InventoryCountSession[] = [];
  try {
    const raw = localStorage.getItem('pos_inventory_counts');
    if (raw) localSessions = JSON.parse(raw);
  } catch {}

  const map = new Map<string, InventoryCountSession>();
  firestoreSessions.forEach((s) => map.set(s.id, s));
  localSessions.forEach((s) => {
    if (!map.has(s.id)) map.set(s.id, s);
  });

  let sessions = Array.from(map.values());

  if (locationId && locationId !== 'all') {
    sessions = sessions.filter(
      (s) => s.branchId === locationId || s.locationId === locationId || s.branchId === 'main'
    );
  }

  sessions.sort(
    (a, b) =>
      new Date(b.createdAt || b.startedAt || 0).getTime() -
      new Date(a.createdAt || a.startedAt || 0).getTime()
  );

  return sessions;
}
