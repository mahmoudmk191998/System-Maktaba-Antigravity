/**
 * Retail Inventory & Stock Movement Subsystem
 * 
 * Serves as the Single Source of Truth for all inventory mutations in the bookstore.
 * Features:
 * - Immutable Stock Movement Ledger
 * - Deterministic Stock Balance document keys
 * - Atomic Multi-Branch & Central Warehouse mutations
 * - Weighted Average Cost (WAC) calculations with currency precision
 * - Strict Negative Stock prevention inside Firestore Transactions
 * - Cryptographic/UUID Idempotency key protection against double-click/replay
 * - Packaging unit conversions into standardized Base Units
 * - Variant-level stock isolation (zero parent/variant double-counting)
 * - Reservation management for future POS & Online orders
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  limit as fsLimit,
  startAfter,
  runTransaction,
  DocumentSnapshot,
} from 'firebase/firestore';
import { removeUndefinedFields } from '@/lib/utils';
import type {
  BranchStockRecord,
  StockBalance,
  StockMovement,
  StockMovementType,
  InventoryLocation,
} from '@/types/retail.types';

export interface ApplyStockMovementInput {
  tenantId: string;
  locationId: string; // or branchId
  productId: string;
  variantId?: string | null;
  movementType: StockMovementType;
  quantity: number; // In input packaging unit or base unit
  inputUnitId?: string;
  conversionFactor?: number; // e.g. 50 (if 1 Box = 50 Pieces)
  unitCost?: number;
  direction?: 'in' | 'out'; // Optional, automatically deduced if omitted
  allowNegativeStock?: boolean;
  allowFraction?: boolean; // Enforce integer discrete units (e.g. pens)
  referenceType?: 'sale' | 'purchase' | 'transfer' | 'inventory_count' | 'damage_loss' | 'opening_balance' | 'manual';
  referenceId?: string;
  idempotencyKey?: string;
  employeeId?: string;
  reason?: string;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface StockMovementResult {
  success: boolean;
  movementId?: string;
  beforeQuantity: number;
  afterQuantity: number;
  averageCost: number;
  isIdempotentReplay?: boolean;
  error?: string;
}

export interface FetchStockBalancesOptions {
  locationId?: string;
  productId?: string;
  categoryId?: string;
  brandId?: string;
  onlyLowStock?: boolean;
  onlyOutOfStock?: boolean;
  hasStock?: boolean;
  searchTerm?: string;
  pageSize?: number;
  lastVisible?: DocumentSnapshot;
}

export interface FetchStockMovementsOptions {
  locationId?: string;
  productId?: string;
  variantId?: string;
  movementType?: StockMovementType;
  referenceType?: string;
  referenceId?: string;
  employeeId?: string;
  startDate?: string;
  endDate?: string;
  pageSize?: number;
  lastVisible?: DocumentSnapshot;
}

/**
 * Deterministic document key for a stock balance record.
 * e.g. "tenant1_loc1_prod1" or "tenant1_loc1_prod1_var1"
 */
export function getBranchStockDocId(
  tenantId: string,
  locationId: string,
  productId: string,
  variantId?: string | null
): string {
  const v = variantId && variantId.trim() !== '' && variantId !== 'base' ? variantId.trim() : null;
  if (v) {
    return `${tenantId}_${locationId}_${productId}_${v}`;
  }
  return `${tenantId}_${locationId}_${productId}`;
}

/**
 * Deterministic document key for transaction idempotency locks.
 */
export function getStockIdempotencyDocId(tenantId: string, idempotencyKey: string): string {
  return `${tenantId}___${idempotencyKey.trim()}`;
}

/**
 * Calculates updated Weighted Average Cost (WAC) upon stock intake.
 * Formula: ((Existing Qty * Existing Cost) + (Incoming Qty * Incoming Cost)) / (Existing Qty + Incoming Qty)
 * Rounded to 2 decimal places for financial accuracy.
 */
export function calculateWeightedAverageCost(
  existingQuantity: number,
  existingAverageCost: number,
  newQuantity: number,
  newUnitCost: number
): number {
  if (existingQuantity <= 0) {
    return Math.round(Math.max(0, newUnitCost) * 100) / 100;
  }
  if (newQuantity <= 0) {
    return Math.round(Math.max(0, existingAverageCost) * 100) / 100;
  }

  const existingTotalVal = existingQuantity * existingAverageCost;
  const newTotalVal = newQuantity * newUnitCost;
  const totalQuantity = existingQuantity + newQuantity;

  return Math.round(((existingTotalVal + newTotalVal) / totalQuantity) * 100) / 100;
}

/**
 * Deduces movement direction ('in' or 'out') based on standardized movement type.
 */
export function deduceMovementDirection(movementType: StockMovementType): 'in' | 'out' {
  switch (movementType) {
    case 'opening_balance':
    case 'purchase_receive':
    case 'purchase':
    case 'sale_return':
    case 'transfer_in':
    case 'stock_adjustment_in':
    case 'recovery':
      return 'in';

    case 'sale':
    case 'purchase_return':
    case 'transfer_out':
    case 'stock_adjustment_out':
    case 'damage':
    case 'loss':
      return 'out';

    default:
      return 'in';
  }
}

/**
 * Normalizes a StockBalance record guaranteeing the invariant:
 * quantity === onHandQuantity and unitCost === averageCost
 */
export function normalizeStockBalance(
  data: Partial<StockBalance> & { id: string; tenantId: string; branchId: string; productId: string }
): StockBalance {
  const onHand = Number(data.onHandQuantity ?? data.quantity ?? 0);
  const reserved = Number(data.reservedQuantity ?? 0);
  const cost = Number(data.averageCost ?? data.unitCost ?? 0);
  const available = data.availableQuantity !== undefined ? Number(data.availableQuantity) : Math.max(0, onHand - reserved);

  return {
    ...data,
    id: data.id,
    tenantId: data.tenantId,
    branchId: data.branchId || data.locationId || '',
    locationId: data.locationId || data.branchId || '',
    productId: data.productId,
    variantId: data.variantId && data.variantId.trim() !== '' ? data.variantId.trim() : null,
    onHandQuantity: onHand,
    quantity: onHand, // Strictly synchronized compatibility alias
    reservedQuantity: reserved,
    availableQuantity: available,
    unitCost: cost,
    averageCost: cost, // Strictly synchronized compatibility alias
    updatedAt: data.updatedAt || new Date().toISOString(),
  } as StockBalance;
}

/**
 * Executes an atomic stock movement inside a Firestore Transaction.
 * Single Official Gateway for all stock changes in the system.
 */
export async function applyStockMovement(
  input: ApplyStockMovementInput
): Promise<StockMovementResult> {
  const {
    tenantId,
    locationId,
    productId,
    variantId = null,
    movementType,
    quantity,
    inputUnitId,
    conversionFactor = 1,
    unitCost,
    direction: explicitDirection,
    allowNegativeStock = false,
    allowFraction = false,
    referenceType,
    referenceId,
    idempotencyKey,
    employeeId,
    reason,
    notes,
    metadata,
  } = input;

  if (!tenantId || !locationId || !productId) {
    return {
      success: false,
      beforeQuantity: 0,
      afterQuantity: 0,
      averageCost: 0,
      error: 'البيانات الأساسية للمؤسسة أو الموقع أو المنتج مفقودة',
    };
  }

  if (quantity === 0) {
    return {
      success: false,
      beforeQuantity: 0,
      afterQuantity: 0,
      averageCost: 0,
      error: 'لا يمكن تطبيق حركة مخزنية بكمية صفرية',
    };
  }

  // 1. Calculate Base Quantity
  const factor = Number(conversionFactor) > 0 ? Number(conversionFactor) : 1;
  const absQty = Math.abs(quantity);
  const baseQuantity = Math.round(absQty * factor * 1000) / 1000;

  // Decimal check
  if (!allowFraction && baseQuantity % 1 !== 0) {
    return {
      success: false,
      beforeQuantity: 0,
      afterQuantity: 0,
      averageCost: 0,
      error: 'هذه الوحدة لا تقبل الكميات الكسرية أو العشرية (أعداد صحيحة فقط)',
    };
  }

  // Direction & Delta
  const direction = explicitDirection || deduceMovementDirection(movementType);
  const delta = direction === 'in' ? baseQuantity : -baseQuantity;

  const stockDocId = getBranchStockDocId(tenantId, locationId, productId, variantId);
  const stockRef = doc(db, 'branch_stock', stockDocId);
  const movementRef = doc(collection(db, 'stock_movements'));
  const now = new Date().toISOString();

  try {
    const txResult = await runTransaction(db, async (transaction) => {
      // 2. Idempotency Check
      if (idempotencyKey && idempotencyKey.trim() !== '') {
        const idempRef = doc(db, 'stock_idempotency', getStockIdempotencyDocId(tenantId, idempotencyKey));
        const idempSnap = await transaction.get(idempRef);
        if (idempSnap.exists()) {
          const idempData = idempSnap.data();
          return {
            isIdempotentReplay: true,
            movementId: idempData.movementId,
            beforeQuantity: idempData.beforeQuantity || 0,
            afterQuantity: idempData.afterQuantity || 0,
            averageCost: idempData.averageCost || 0,
          };
        }
      }

      // 3. Read Current Stock Balance
      const stockSnap = await transaction.get(stockRef);
      let beforeOnHand = 0;
      let reservedQty = 0;
      let currentCost = unitCost !== undefined ? Number(unitCost) : 0;

      if (stockSnap.exists()) {
        const data = stockSnap.data() as BranchStockRecord;
        beforeOnHand = data.onHandQuantity ?? data.quantity ?? 0;
        reservedQty = data.reservedQuantity ?? 0;
        currentCost = data.averageCost ?? data.unitCost ?? currentCost;
      }

      const afterOnHand = Math.round((beforeOnHand + delta) * 1000) / 1000;
      const afterAvailable = Math.round((afterOnHand - reservedQty) * 1000) / 1000;

      // 4. Negative Stock Enforcement
      if (afterAvailable < 0 && !allowNegativeStock) {
        const availableBefore = Math.max(0, beforeOnHand - reservedQty);
        throw new Error(
          `الكمية المتاحة غير كافية في هذا الموقع. المتاح حالياً: ${availableBefore}، المطلوب صرفه: ${baseQuantity}`
        );
      }

      // 5. Weighted Average Cost Recalculation
      let finalCost = currentCost;
      if (
        direction === 'in' &&
        unitCost !== undefined &&
        (movementType === 'purchase_receive' ||
          movementType === 'purchase' ||
          movementType === 'opening_balance' ||
          movementType === 'recovery' ||
          movementType === 'transfer_in' ||
          movementType === 'sale_return')
      ) {
        finalCost = calculateWeightedAverageCost(beforeOnHand, currentCost, baseQuantity, Number(unitCost));
      }

      // 6. Update Stock Balance Document using unified normalization
      const updatedBalance = normalizeStockBalance({
        id: stockDocId,
        tenantId,
        branchId: locationId,
        locationId,
        productId,
        variantId: variantId && variantId.trim() !== '' ? variantId.trim() : null,
        onHandQuantity: afterOnHand,
        reservedQuantity: reservedQty,
        availableQuantity: afterAvailable,
        averageCost: finalCost,
        lastMovementAt: now,
        updatedAt: now,
      });
      transaction.set(stockRef, removeUndefinedFields(updatedBalance), { merge: true });

      // 7. Write Immutable Stock Movement Record
      const movementRecord: StockMovement = {
        id: movementRef.id,
        tenantId,
        branchId: locationId,
        locationId,
        productId,
        variantId: variantId && variantId.trim() !== '' ? variantId.trim() : null,
        movementType,
        direction,
        quantity: delta,
        inputQuantity: quantity,
        inputUnitId: inputUnitId || null,
        conversionFactor: factor,
        baseQuantity,
        beforeQuantity: beforeOnHand,
        afterQuantity: afterOnHand,
        unitCost: finalCost,
        totalCost: Math.round(finalCost * baseQuantity * 100) / 100,
        referenceType: referenceType || null,
        referenceId: referenceId || null,
        idempotencyKey: idempotencyKey || null,
        employeeId: employeeId || null,
        reason: reason || null,
        notes: notes || null,
        createdAt: now,
        createdBy: employeeId || 'system',
        metadata: metadata || null,
      };
      transaction.set(movementRef, removeUndefinedFields(movementRecord));

      // 8. Register Idempotency Key
      if (idempotencyKey && idempotencyKey.trim() !== '') {
        const idempRef = doc(db, 'stock_idempotency', getStockIdempotencyDocId(tenantId, idempotencyKey));
        transaction.set(idempRef, removeUndefinedFields({
          tenantId,
          idempotencyKey,
          movementId: movementRef.id,
          beforeQuantity: beforeOnHand,
          afterQuantity: afterOnHand,
          averageCost: finalCost,
          createdAt: now,
        }));
      }

      return {
        isIdempotentReplay: false,
        movementId: movementRef.id,
        beforeQuantity: beforeOnHand,
        afterQuantity: afterOnHand,
        averageCost: finalCost,
      };
    });

    return { success: true, ...txResult };
  } catch (err: any) {
    console.error('applyStockMovement failed:', err);
    return {
      success: false,
      beforeQuantity: 0,
      afterQuantity: 0,
      averageCost: 0,
      error: err?.message || 'فشلت عملية تطبيق حركة المخزون',
    };
  }
}

/**
 * Creates an initial Opening Balance for a product/variant in a specific location.
 * Protected against duplicate creation with idempotency.
 */
export async function createOpeningBalance(
  tenantId: string,
  locationId: string,
  productId: string,
  variantId: string | null | undefined,
  quantity: number,
  unitCost: number,
  options: {
    unitId?: string;
    conversionFactor?: number;
    employeeId?: string;
    notes?: string;
    idempotencyKey?: string;
  } = {}
): Promise<StockMovementResult> {
  const autoIdemp =
    options.idempotencyKey ||
    `op_bal:${tenantId}:${locationId}:${productId}:${variantId || 'base'}:${new Date().toISOString().slice(0, 10)}`;

  return applyStockMovement({
    tenantId,
    locationId,
    productId,
    variantId,
    movementType: 'opening_balance',
    quantity,
    inputUnitId: options.unitId,
    conversionFactor: options.conversionFactor || 1,
    unitCost,
    direction: 'in',
    employeeId: options.employeeId,
    notes: options.notes || 'رصيد افتتاحي أولي',
    idempotencyKey: autoIdemp,
  });
}

/**
 * Manages Stock Reservations (e.g. held orders, online orders).
 */
export async function reserveStock(
  tenantId: string,
  locationId: string,
  productId: string,
  variantId: string | null | undefined,
  quantityToReserve: number
): Promise<{ success: boolean; error?: string }> {
  if (quantityToReserve <= 0) return { success: true };

  const stockDocId = getBranchStockDocId(tenantId, locationId, productId, variantId);
  const stockRef = doc(db, 'branch_stock', stockDocId);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(stockRef);
      if (!snap.exists()) {
        throw new Error('لا يوجد رصيد مخزني لهذا المنتج في هذا الموقع');
      }

      const data = snap.data() as BranchStockRecord;
      const onHand = data.onHandQuantity ?? data.quantity ?? 0;
      const currentReserved = data.reservedQuantity ?? 0;
      const available = onHand - currentReserved;

      if (available < quantityToReserve) {
        throw new Error(`الكمية المتاحة (${available}) غير كافية لحجز (${quantityToReserve})`);
      }

      const newReserved = currentReserved + quantityToReserve;
      transaction.update(stockRef, {
        reservedQuantity: newReserved,
        availableQuantity: onHand - newReserved,
        updatedAt: new Date().toISOString(),
      });
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'فشل في حجز الكمية' };
  }
}

/**
 * Releases a previous Stock Reservation.
 */
export async function releaseReservedStock(
  tenantId: string,
  locationId: string,
  productId: string,
  variantId: string | null | undefined,
  quantityToRelease: number
): Promise<{ success: boolean; error?: string }> {
  if (quantityToRelease <= 0) return { success: true };

  const stockDocId = getBranchStockDocId(tenantId, locationId, productId, variantId);
  const stockRef = doc(db, 'branch_stock', stockDocId);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(stockRef);
      if (!snap.exists()) return;

      const data = snap.data() as BranchStockRecord;
      const onHand = data.onHandQuantity ?? data.quantity ?? 0;
      const currentReserved = data.reservedQuantity ?? 0;
      const newReserved = Math.max(0, currentReserved - quantityToRelease);

      transaction.update(stockRef, {
        reservedQuantity: newReserved,
        availableQuantity: onHand - newReserved,
        updatedAt: new Date().toISOString(),
      });
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'فشل في تحرير الحجز' };
  }
}

/**
 * Fetches Stock Balances for a given tenant with multi-criteria filtering.
 */
export async function fetchStockBalancesFromDb(
  tenantId: string,
  options: FetchStockBalancesOptions = {}
): Promise<{ balances: StockBalance[]; hasMore: boolean; lastVisible?: DocumentSnapshot }> {
  if (!tenantId) return { balances: [], hasMore: false };

  const { locationId, productId, pageSize = 50, lastVisible } = options;
  const constraints: any[] = [where('tenantId', '==', tenantId)];

  if (locationId) {
    constraints.push(where('branchId', '==', locationId));
  }
  if (productId) {
    constraints.push(where('productId', '==', productId));
  }

  constraints.push(fsLimit(pageSize + 1));

  if (lastVisible) {
    constraints.push(startAfter(lastVisible));
  }

  const q = query(collection(db, 'branch_stock'), ...constraints);
  const snap = await getDocs(q);

  let docs = snap.docs;
  const hasMore = docs.length > pageSize;
  if (hasMore) {
    docs = docs.slice(0, pageSize);
  }

  const balances = docs.map((d) =>
    normalizeStockBalance({
      id: d.id,
      ...d.data(),
    } as any)
  );

  balances.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());

  return {
    balances,
    hasMore,
    lastVisible: docs.length > 0 ? docs[docs.length - 1] : undefined,
  };
}

/**
 * Fetches Stock Movement Audit Ledger with cursor-based pagination.
 */
export async function fetchStockMovementsFromDb(
  tenantId: string,
  options: FetchStockMovementsOptions = {}
): Promise<{ movements: StockMovement[]; hasMore: boolean; lastVisible?: DocumentSnapshot }> {
  if (!tenantId) return { movements: [], hasMore: false };

  const { locationId, productId, movementType, pageSize = 50, lastVisible } = options;
  const constraints: any[] = [where('tenantId', '==', tenantId)];

  if (locationId) {
    constraints.push(where('branchId', '==', locationId));
  }
  if (productId) {
    constraints.push(where('productId', '==', productId));
  }
  if (movementType) {
    constraints.push(where('movementType', '==', movementType));
  }

  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(fsLimit(pageSize + 1));

  if (lastVisible) {
    constraints.push(startAfter(lastVisible));
  }

  const q = query(collection(db, 'stock_movements'), ...constraints);
  const snap = await getDocs(q);

  let docs = snap.docs;
  const hasMore = docs.length > pageSize;
  if (hasMore) {
    docs = docs.slice(0, pageSize);
  }

  const movements = docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as StockMovement[];

  return {
    movements,
    hasMore,
    lastVisible: docs.length > 0 ? docs[docs.length - 1] : undefined,
  };
}

/**
 * Backward compatibility wrapper for legacy callers of executeStockAdjustment.
 */
export async function executeStockAdjustment(input: any) {
  const direction: 'in' | 'out' = input.quantityChange >= 0 ? 'in' : 'out';
  return applyStockMovement({
    tenantId: input.tenantId,
    locationId: input.branchId,
    productId: input.productId,
    variantId: input.variantId,
    movementType: input.movementType || (direction === 'in' ? 'stock_adjustment_in' : 'stock_adjustment_out'),
    quantity: Math.abs(input.quantityChange),
    unitCost: input.unitCost,
    direction,
    allowNegativeStock: input.allowNegativeStock,
    referenceType: input.referenceType,
    referenceId: input.referenceId,
    employeeId: input.employeeId,
    notes: input.notes,
  });
}
