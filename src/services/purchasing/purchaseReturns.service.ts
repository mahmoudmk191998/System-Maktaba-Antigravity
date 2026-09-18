/**
 * Retail Purchase Returns Service
 * Atomic, Concurrency-Safe Purchase Returns Engine to Suppliers.
 * Ensures cannot return more than received, protects against negative stock,
 * uses original effective cost snapshot for supplier credit, reduces stock with
 * immutable stock movements, and updates the supplier ledger.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as fsLimit,
  startAfter,
  runTransaction,
  type DocumentSnapshot,
} from 'firebase/firestore';
import type {
  PurchaseReturn,
  PurchaseReturnItem,
  GoodsReceipt,
  Supplier,
  SupplierLedgerEntry,
  StockBalance,
  StockMovement,
} from '@/types/retail.types';
import {
  getBranchStockDocId,
  normalizeStockBalance,
} from '../inventory/retailInventory.service';
import { formatSequenceNumber } from '../sales/invoiceNumber.service';

export interface PurchaseReturnLineInput {
  goodsReceiptItemId: string;   // Corresponds to item in GoodsReceipt
  productId: string;
  variantId?: string | null;
  returnQuantity: number;       // In input unit
  reason: string;
}

export interface ProcessPurchaseReturnParams {
  tenantId: string;
  branchId: string;
  sourceLocationId?: string;
  branchCode?: string;
  goodsReceiptId: string;
  items: PurchaseReturnLineInput[];
  reason: string;
  notes?: string;
  processedBy: string;
  clientReturnId: string;
}

export interface ProcessPurchaseReturnResult {
  success: boolean;
  isIdempotentReplay: boolean;
  purchaseReturn?: PurchaseReturn;
  error?: string;
}

/**
 * Deterministic document ID for Purchase Return idempotency lock
 */
export function getPurchaseReturnIdempotencyDocId(tenantId: string, idempotencyKey: string): string {
  const sanitized = idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${tenantId}___${sanitized}`;
}

/**
 * Generates an atomic sequential Purchase Return Number (e.g. PR-HQ-2026-000001)
 */
export async function generatePurchaseReturnNumber(
  tenantId: string,
  branchCode = 'HQ'
): Promise<string> {
  const year = new Date().getFullYear();
  const counterRef = doc(db, 'sequence_counters', `${tenantId}_${branchCode}_pr_${year}`);
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number(snap.data().lastSequence || 0) : 0;
    const next = current + 1;
    tx.set(counterRef, { lastSequence: next, updatedAt: new Date().toISOString() }, { merge: true });
    return next;
  });
  return `PR-${branchCode}-${year}-${formatSequenceNumber(seq, 6)}`;
}

/**
 * Atomically processes a complete Purchase Return to supplier.
 * 1. Checks idempotency.
 * 2. Reads original Goods Receipt and Supplier.
 * 3. Reads all existing returns against this receipt to check cumulative return quantities.
 * 4. Validates that current on-hand stock is sufficient (strictly prevents negative stock).
 * 5. Uses original effective receipt cost for supplier credit.
 * 6. Deducts inventory stock (movement direction: out, type: purchase_return).
 * 7. Updates supplier ledger (type: purchase_return, debit reduces payable).
 * 8. Decrements supplier cached currentBalance.
 * 9. Sets idempotency lock.
 */
export async function completePurchaseReturnTransaction(
  params: ProcessPurchaseReturnParams
): Promise<ProcessPurchaseReturnResult> {
  const {
    tenantId,
    branchId,
    sourceLocationId = branchId,
    branchCode = 'HQ',
    goodsReceiptId,
    items: requestedItems,
    reason,
    notes = '',
    processedBy,
    clientReturnId,
  } = params;

  if (!tenantId || !branchId || !goodsReceiptId || !requestedItems || requestedItems.length === 0) {
    return { success: false, isIdempotentReplay: false, error: 'بيانات إرجاع المشتريات غير مكتملة' };
  }

  const idempotencyKey = `purchase_return:${tenantId}:${clientReturnId}`;
  const idempDocId = getPurchaseReturnIdempotencyDocId(tenantId, idempotencyKey);
  const idempRef = doc(db, 'purchase_idempotency', idempDocId);

  const year = new Date().getFullYear();
  const counterRef = doc(db, 'sequence_counters', `${tenantId}_${branchCode}_pr_${year}`);

  try {
    const txResult = await runTransaction(db, async (transaction) => {
      // 1. Idempotency Check
      const idempSnap = await transaction.get(idempRef);
      if (idempSnap.exists()) {
        return {
          isIdempotentReplay: true,
          purchaseReturn: idempSnap.data().returnSnapshot as PurchaseReturn,
        };
      }

      // 2. Read Original Goods Receipt
      const grnRef = doc(db, 'goods_receipts', goodsReceiptId);
      const grnSnap = await transaction.get(grnRef);
      if (!grnSnap.exists()) {
        throw new Error('إذن استلام البضاعة الأصلي غير موجود');
      }

      const grnData = grnSnap.data() as GoodsReceipt;
      if (grnData.tenantId !== tenantId) {
        throw new Error('غير مصرح بالوصول إلى بيانات إذن الاستلام هذا');
      }
      if (grnData.status === 'cancelled') {
        throw new Error('لا يمكن عمل مرتجع لإذن استلام ملغي');
      }

      // 3. Read Supplier
      const supplierRef = doc(db, 'suppliers', grnData.supplierId);
      const supplierSnap = await transaction.get(supplierRef);
      if (!supplierSnap.exists()) throw new Error('سجل المورد غير موجود');
      const supplierData = supplierSnap.data() as Supplier;

      // 4. Query Previous Purchase Returns for this Goods Receipt
      const prevReturnsQuery = query(
        collection(db, 'purchase_returns'),
        where('tenantId', '==', tenantId),
        where('goodsReceiptId', '==', goodsReceiptId)
      );
      const prevReturnsSnap = await getDocs(prevReturnsQuery);
      const alreadyReturnedMap = new Map<string, number>();

      prevReturnsSnap.docs.forEach((d) => {
        const ret = d.data() as PurchaseReturn;
        if (ret.status !== 'cancelled') {
          ret.items?.forEach((ri) => {
            const key = ri.productId + (ri.variantId ? `_${ri.variantId}` : '');
            const prev = alreadyReturnedMap.get(key) || 0;
            alreadyReturnedMap.set(key, prev + (ri.returnBaseQuantity || 0));
          });
        }
      });

      // 5. Validate Each Item, Check Returnable Qty & Check Current On-Hand Stock
      const stockBalanceReads = new Map<string, any>();
      for (const reqItem of requestedItems) {
        const variantId = reqItem.variantId && reqItem.variantId.trim() !== '' ? reqItem.variantId.trim() : null;
        const stockDocId = getBranchStockDocId(tenantId, sourceLocationId, reqItem.productId, variantId);
        const stockRef = doc(db, 'branch_stock', stockDocId);

        if (!stockBalanceReads.has(stockDocId)) {
          const stockSnap = await transaction.get(stockRef);
          stockBalanceReads.set(stockDocId, { ref: stockRef, snap: stockSnap, productId: reqItem.productId, variantId });
        }
      }

      // Generate PR Number
      const counterSnap = await transaction.get(counterRef);
      const currentSeq = counterSnap.exists() ? Number(counterSnap.data().lastSequence || 0) : 0;
      const nextSeq = currentSeq + 1;
      transaction.set(counterRef, { lastSequence: nextSeq, updatedAt: new Date().toISOString() }, { merge: true });
      const returnNumber = `PR-${branchCode}-${year}-${formatSequenceNumber(nextSeq, 6)}`;

      const prRef = doc(collection(db, 'purchase_returns'));
      const returnItemsToRecord: PurchaseReturnItem[] = [];
      const stockUpdatesToCommit: Array<{
        stockRef: any;
        updatedBalance: StockBalance;
        movementRecord: StockMovement;
      }> = [];

      let calculatedReturnSubtotal = 0;
      const now = new Date().toISOString();

      for (const reqItem of requestedItems) {
        if (reqItem.returnQuantity <= 0) {
          throw new Error('الكمية المرتجعة يجب أن تكون أكبر من الصفر');
        }

        const grnItem = grnData.items.find(
          (i) => i.productId === reqItem.productId && (i.variantId || null) === (reqItem.variantId || null)
        );
        if (!grnItem) {
          throw new Error(`الصنف ذو المعرف "${reqItem.productId}" غير موجود في إذن الاستلام الأصلي`);
        }

        const conv = Math.max(1, grnItem.conversionFactor || 1);
        const reqBaseQty = reqItem.returnQuantity * conv;
        const itemKey = grnItem.productId + (grnItem.variantId ? `_${grnItem.variantId}` : '');
        const alreadyReturnedBase = alreadyReturnedMap.get(itemKey) || 0;
        const remainingReturnableBase = (grnItem.acceptedBaseQuantity || grnItem.receivedBaseQuantity) - alreadyReturnedBase;

        // Verify cannot return more than received
        if (reqBaseQty > remainingReturnableBase) {
          const maxAllowed = remainingReturnableBase / conv;
          throw new Error(
            `الكمية المطلوب إرجاعها للمورد (${reqItem.returnQuantity}) تتجاوز الكمية المستلمة المتبقية (${maxAllowed}) للصنف "${grnItem.productNameSnapshot}"`
          );
        }

        // Verify sufficient current on-hand stock (PREVENTS NEGATIVE STOCK!)
        const variantId = grnItem.variantId && grnItem.variantId.trim() !== '' ? grnItem.variantId.trim() : null;
        const stockDocId = getBranchStockDocId(tenantId, sourceLocationId, grnItem.productId, variantId);
        const stockDataRead = stockBalanceReads.get(stockDocId)!;

        if (!stockDataRead.snap.exists()) {
          throw new Error(`لا يوجد مخزون مسجل للصنف "${grnItem.productNameSnapshot}" في هذا الموقع لإرجاعه`);
        }

        const currentStock = stockDataRead.snap.data() as StockBalance;
        const currentOnHand = Number(currentStock.onHandQuantity ?? currentStock.quantity ?? 0);
        if (currentOnHand < reqBaseQty) {
          const availableUnits = currentOnHand / conv;
          throw new Error(
            `الرصيد الفعلي المتاح حالياً في المخزن (${availableUnits}) غير كافٍ لإرجاع (${reqItem.returnQuantity}) للصنف "${grnItem.productNameSnapshot}". تم بيع أو استهلاك جزء من الشحنة.`
          );
        }

        // Cost value uses original effective receipt cost
        const originalEffectiveCost = grnItem.effectiveUnitCost || grnItem.unitPurchaseCost / conv;
        const lineCreditValue = Math.round(originalEffectiveCost * reqBaseQty * 100) / 100;
        calculatedReturnSubtotal += lineCreditValue;

        const afterStock = currentOnHand - reqBaseQty;
        const currentWac = Number(currentStock.averageCost ?? currentStock.unitCost ?? originalEffectiveCost);

        // Outbound movement preserves remaining WAC
        const updatedBalance: StockBalance = normalizeStockBalance({
          id: stockDocId,
          tenantId,
          branchId: sourceLocationId,
          productId: grnItem.productId,
          variantId,
          onHandQuantity: afterStock,
          availableQuantity: afterStock,
          reservedQuantity: 0,
          averageCost: currentWac,
          lastCost: currentStock.lastCost || originalEffectiveCost,
          unitCost: currentWac,
          quantity: afterStock,
          updatedAt: now,
        });

        const movementRef = doc(collection(db, 'stock_movements'));
        const movementRecord: StockMovement = {
          id: movementRef.id,
          tenantId,
          branchId: sourceLocationId,
          productId: grnItem.productId,
          variantId,
          direction: 'out',
          movementType: 'purchase_return',
          quantity: reqBaseQty,
          unitCost: originalEffectiveCost,
          totalCost: lineCreditValue,
          balanceBefore: currentOnHand,
          balanceAfter: afterStock,
          referenceType: 'purchase_return',
          referenceId: prRef.id,
          idempotencyKey: `purchase_return:${prRef.id}:${grnItem.productId}`,
          reason: `مرتجع مشتريات للمورد - إذن مرتجع ${returnNumber}: ${reqItem.reason || reason}`,
          notes: notes || '',
          performedBy: processedBy,
          timestamp: now,
          createdAt: now,
        };

        stockUpdatesToCommit.push({
          stockRef: stockDataRead.ref,
          updatedBalance,
          movementRecord,
        });

        returnItemsToRecord.push({
          purchaseReceiptItemId: grnItem.purchaseOrderItemId,
          productId: grnItem.productId,
          variantId,
          productNameSnapshot: grnItem.productNameSnapshot,
          skuSnapshot: grnItem.skuSnapshot,
          returnQuantity: reqItem.returnQuantity,
          returnBaseQuantity: reqBaseQty,
          inputUnitId: grnItem.inputUnitId,
          conversionFactor: conv,
          originalEffectiveUnitCost: originalEffectiveCost,
          costValue: lineCreditValue,
          reason: reqItem.reason || reason,
          stockMovementId: movementRef.id,
        });
      }

      // 6. Commit Stock Deductions
      for (const update of stockUpdatesToCommit) {
        transaction.set(update.stockRef, update.updatedBalance, { merge: true });
        const mRef = doc(db, 'stock_movements', update.movementRecord.id);
        transaction.set(mRef, update.movementRecord);
      }

      // 7. Write Purchase Return Document
      const purchaseReturnRecord: PurchaseReturn = {
        id: prRef.id,
        tenantId,
        branchId,
        sourceLocationId,
        returnNumber,
        supplierId: supplierData.id,
        supplierNameSnapshot: supplierData.name,
        purchaseOrderId: grnData.purchaseOrderId,
        goodsReceiptId: grnData.id,
        goodsReceiptNumberSnapshot: grnData.receiptNumber,
        status: 'completed',
        items: returnItemsToRecord,
        subtotal: calculatedReturnSubtotal,
        taxReversed: 0,
        total: calculatedReturnSubtotal,
        totalAmount: calculatedReturnSubtotal, // legacy alias
        reason,
        notes: notes.trim(),
        processedBy,
        idempotencyKey,
        createdAt: now,
        completedAt: now,
      };
      transaction.set(prRef, purchaseReturnRecord);

      // 8. Update Supplier Ledger (Debit = Reduces amount we owe supplier)
      const currentSupplierBal = Number(supplierData.currentBalance || 0);
      const newSupplierBal = Math.round((currentSupplierBal - calculatedReturnSubtotal) * 100) / 100;

      const ledgerRef = doc(collection(db, 'supplier_ledger'));
      const ledgerEntry: SupplierLedgerEntry = {
        id: ledgerRef.id,
        tenantId,
        supplierId: supplierData.id,
        type: 'purchase_return',
        referenceType: 'purchase_return',
        referenceId: prRef.id,
        referenceNumber: returnNumber,
        debit: calculatedReturnSubtotal, // Debit reduces payable
        credit: 0,
        balanceAfter: newSupplierBal,
        currency: 'EGP',
        notes: `مرتجع مشتريات رقم ${returnNumber} من إذن الاستلام ${grnData.receiptNumber}`,
        createdAt: now,
        createdBy: processedBy,
      };
      transaction.set(ledgerRef, ledgerEntry);

      transaction.update(supplierRef, {
        currentBalance: newSupplierBal,
        updatedAt: now,
      });

      // 9. Register Idempotency Lock
      transaction.set(idempRef, {
        tenantId,
        idempotencyKey,
        returnId: prRef.id,
        returnNumber,
        totalCredit: calculatedReturnSubtotal,
        returnSnapshot: purchaseReturnRecord,
        createdAt: now,
      });

      return {
        isIdempotentReplay: false,
        purchaseReturn: purchaseReturnRecord,
      };
    });

    return {
      success: true,
      isIdempotentReplay: txResult.isIdempotentReplay,
      purchaseReturn: txResult.purchaseReturn,
    };
  } catch (err: any) {
    console.error('Purchase return error:', err);
    return {
      success: false,
      isIdempotentReplay: false,
      error: err.message || 'فشلت عملية مرتجع المشتريات للمورد',
    };
  }
}

/**
 * Fetches Purchase Returns with cursor pagination
 */
export interface FetchPurchaseReturnsOptions {
  goodsReceiptId?: string;
  supplierId?: string;
  pageSize?: number;
  lastVisible?: DocumentSnapshot;
}

export async function fetchPurchaseReturnsFromDb(
  tenantId: string,
  options: FetchPurchaseReturnsOptions = {}
): Promise<{ returns: PurchaseReturn[]; hasMore: boolean; lastVisible?: DocumentSnapshot }> {
  if (!tenantId) return { returns: [], hasMore: false };

  const { goodsReceiptId, supplierId, pageSize = 30, lastVisible } = options;
  const constraints: any[] = [where('tenantId', '==', tenantId)];

  if (goodsReceiptId) constraints.push(where('goodsReceiptId', '==', goodsReceiptId));
  if (supplierId) constraints.push(where('supplierId', '==', supplierId));

  constraints.push(orderBy('createdAt', 'desc'));
  constraints.push(fsLimit(pageSize + 1));

  if (lastVisible) {
    constraints.push(startAfter(lastVisible));
  }

  const q = query(collection(db, 'purchase_returns'), ...constraints);
  const snap = await getDocs(q);

  let docs = snap.docs;
  const hasMore = docs.length > pageSize;
  if (hasMore) {
    docs = docs.slice(0, pageSize);
  }

  const returns = docs.map((d) => ({ id: d.id, ...d.data() } as PurchaseReturn));

  return {
    returns,
    hasMore,
    lastVisible: docs.length > 0 ? docs[docs.length - 1] : undefined,
  };
}
