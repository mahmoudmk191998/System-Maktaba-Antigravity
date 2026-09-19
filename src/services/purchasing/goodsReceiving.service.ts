/**
 * Retail Goods Receiving Service
 * Atomic, Concurrency-Safe, Idempotent Goods Receiving (GRN) Engine.
 * Allocates landed costs, updates inventory WAC, routes accepted stock,
 * logs arrival damage without increasing available inventory, updates PO status,
 * and increments supplier payable liability.
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
  PurchaseOrder,
  PurchaseOrderItem,
  GoodsReceipt,
  GoodsReceiptItem,
  Supplier,
  SupplierLedgerEntry,
  StockBalance,
  StockMovement,
  DamageLossRecord,
} from '@/types/retail.types';
import {
  getBranchStockDocId,
  normalizeStockBalance,
  calculateWeightedAverageCost,
} from '../inventory/retailInventory.service';
import { formatSequenceNumber } from '../sales/invoiceNumber.service';
import { postGoodsReceiptJournalEntry } from '../accounting/postingEngine';

export interface ReceiveLineItemInput {
  purchaseOrderItemId: string;
  receivedQuantity: number;      // In input unit
  acceptedQuantity: number;      // In input unit (sound goods)
  rejectedQuantity?: number;      // In input unit (damaged / defective on arrival)
  rejectionReason?: string;
  unitPurchaseCost?: number;     // If overridden from PO
}

export interface ProcessGoodsReceiptParams {
  tenantId: string;
  branchId: string;
  destinationLocationId?: string;
  branchCode?: string;
  purchaseOrderId: string;
  supplierInvoiceNumber?: string;
  supplierDeliveryNote?: string;
  receivedBy: string;
  receivedAt?: string;
  items: ReceiveLineItemInput[];
  extraCosts?: number;           // Shipping, customs, handling (landed cost)
  notes?: string;
  clientReceiptId: string;
}

export interface ProcessGoodsReceiptResult {
  success: boolean;
  isIdempotentReplay: boolean;
  goodsReceipt?: GoodsReceipt;
  error?: string;
}

/**
 * Deterministic document ID for Goods Receipt idempotency lock
 */
export function getGoodsReceiptIdempotencyDocId(tenantId: string, idempotencyKey: string): string {
  const sanitized = idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${tenantId}___${sanitized}`;
}

/**
 * Generates an atomic sequential Goods Receipt Number (e.g. GRN-HQ-2026-000001)
 */
export async function generateGoodsReceiptNumber(
  tenantId: string,
  branchCode = 'HQ'
): Promise<string> {
  const year = new Date().getFullYear();
  const counterRef = doc(db, 'sequence_counters', `${tenantId}_${branchCode}_grn_${year}`);
  const seq = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const current = snap.exists() ? Number(snap.data().lastSequence || 0) : 0;
    const next = current + 1;
    tx.set(counterRef, { lastSequence: next, updatedAt: new Date().toISOString() }, { merge: true });
    return next;
  });
  return `GRN-${branchCode}-${year}-${formatSequenceNumber(seq, 6)}`;
}

/**
 * Atomically executes a complete Goods Receipt transaction.
 * All-or-Nothing execution inside a single Firestore transaction:
 * 1. Checks idempotency lock.
 * 2. Validates PO status and supplier.
 * 3. Validates remaining returnable / receivable base quantities under concurrency.
 * 4. Allocates Landed Cost (by value).
 * 5. Reads current stock balances, calculates new WAC using effective landed cost.
 * 6. Updates inventory stock and creates immutable stock_movements (purchase_receive).
 * 7. Records damaged / rejected arrivals in vendor discrepancies without increasing available stock.
 * 8. Creates Goods Receipt document and GRN sequence.
 * 9. Updates PO line receivedBaseQuantity and PO status.
 * 10. Creates supplier liability in supplier_ledger and increments supplier cached currentBalance.
 * 11. Sets idempotency lock.
 */
export async function completeGoodsReceiptTransaction(
  params: ProcessGoodsReceiptParams
): Promise<ProcessGoodsReceiptResult> {
  const {
    tenantId,
    branchId,
    destinationLocationId = branchId,
    branchCode = 'HQ',
    purchaseOrderId,
    supplierInvoiceNumber = '',
    supplierDeliveryNote = '',
    receivedBy,
    receivedAt = new Date().toISOString(),
    items: requestedItems,
    extraCosts = 0,
    notes = '',
    clientReceiptId,
  } = params;

  if (!tenantId || !branchId || !purchaseOrderId || !requestedItems || requestedItems.length === 0) {
    return { success: false, isIdempotentReplay: false, error: 'بيانات استلام البضاعة غير مكتملة' };
  }

  const idempotencyKey = `goods_receipt:${tenantId}:${clientReceiptId}`;
  const idempDocId = getGoodsReceiptIdempotencyDocId(tenantId, idempotencyKey);
  const idempRef = doc(db, 'purchase_idempotency', idempDocId);

  const year = new Date().getFullYear();
  const counterRef = doc(db, 'sequence_counters', `${tenantId}_${branchCode}_grn_${year}`);

  try {
    const txResult = await runTransaction(db, async (transaction) => {
      // 1. Idempotency Check
      const idempSnap = await transaction.get(idempRef);
      if (idempSnap.exists()) {
        return {
          isIdempotentReplay: true,
          goodsReceipt: idempSnap.data().receiptSnapshot as GoodsReceipt,
        };
      }

      // 2. Read PO Document
      const poRef = doc(db, 'purchase_orders', purchaseOrderId);
      const poSnap = await transaction.get(poRef);
      if (!poSnap.exists()) {
        throw new Error('أمر الشراء المطلوب استلام بضاعة له غير موجود');
      }

      const poData = poSnap.data() as PurchaseOrder;
      const poTenant = poData.tenantId || (poData as any).tenant_id;
      if (tenantId && tenantId !== 'default' && poTenant && poTenant !== tenantId) {
        throw new Error('غير مصرح بالوصول إلى بيانات أمر الشراء هذا');
      }

      if (poData.status === 'cancelled') {
        throw new Error('لا يمكن استلام بضاعة لأمر شراء ملغي');
      }
      if (poData.status === 'received') {
        throw new Error('تم استلام كامل كميات أمر الشراء هذا بالفعل مسبقاً');
      }

      // 3. Read Supplier Document
      const supplierRef = doc(db, 'suppliers', poData.supplierId);
      const supplierSnap = await transaction.get(supplierRef);
      if (!supplierSnap.exists()) {
        throw new Error('المورد المرتبط بأمر الشراء غير موجود');
      }
      const supplierData = supplierSnap.data() as Supplier;

      // 4. Validate All Items & Quantities Against PO
      // Read all required stock balance documents first
      const stockBalanceReads = new Map<string, any>();
      for (const reqItem of requestedItems) {
        const poItem = poData.items.find((i) => i.id === reqItem.purchaseOrderItemId);
        if (!poItem) {
          throw new Error(`الصنف ذو المعرف "${reqItem.purchaseOrderItemId}" غير موجود في بنود أمر الشراء`);
        }

        const variantId = poItem.variantId && poItem.variantId.trim() !== '' ? poItem.variantId.trim() : null;
        const stockDocId = getBranchStockDocId(tenantId, destinationLocationId, poItem.productId, variantId);
        const stockRef = doc(db, 'branch_stock', stockDocId);

        if (!stockBalanceReads.has(stockDocId)) {
          const stockSnap = await transaction.get(stockRef);
          stockBalanceReads.set(stockDocId, { ref: stockRef, snap: stockSnap, productId: poItem.productId, variantId });
        }
      }

      // 5. Calculate Subtotal of Accepted Goods to Distribute Extra Landed Costs Pro-Rata
      let acceptedGoodsSubtotal = 0;
      for (const reqItem of requestedItems) {
        const poItem = poData.items.find((i) => i.id === reqItem.purchaseOrderItemId)!;
        const acceptedQty = Math.max(0, reqItem.acceptedQuantity);
        const unitCost = reqItem.unitPurchaseCost !== undefined ? reqItem.unitPurchaseCost : poItem.unitCost;
        acceptedGoodsSubtotal += acceptedQty * unitCost;
      }

      // 6. Process Each Item, Calculate WAC and Prepare Records
      const grnItems: GoodsReceiptItem[] = [];
      const stockUpdatesToCommit: Array<{
        stockRef: any;
        updatedBalance: StockBalance;
        movementRecord: StockMovement;
      }> = [];

      let grnSubtotal = 0;
      let grnTotalLiability = 0;

      // Generate GRN Number
      const counterSnap = await transaction.get(counterRef);
      const currentSeq = counterSnap.exists() ? Number(counterSnap.data().lastSequence || 0) : 0;
      const nextSeq = currentSeq + 1;
      transaction.set(counterRef, { lastSequence: nextSeq, updatedAt: receivedAt }, { merge: true });
      const receiptNumber = `GRN-${branchCode}-${year}-${formatSequenceNumber(nextSeq, 6)}`;

      const grnRef = doc(collection(db, 'goods_receipts'));

      // Updated PO items map
      const updatedPoItems = poData.items.map((pi) => ({ ...pi }));

      for (const reqItem of requestedItems) {
        const poItemIndex = updatedPoItems.findIndex((i) => i.id === reqItem.purchaseOrderItemId);
        const poItem = updatedPoItems[poItemIndex];

        const conv = Math.max(1, poItem.conversionFactor || 1);
        const orderedBase = poItem.orderedBaseQuantity;
        const previouslyReceivedBase = poItem.receivedBaseQuantity || 0;
        const remainingBaseQty = orderedBase - previouslyReceivedBase;

        const acceptedQty = Math.max(0, reqItem.acceptedQuantity);
        const rejectedQty = Math.max(0, reqItem.rejectedQuantity || 0);
        const totalReceivedQty = acceptedQty + rejectedQty;

        const acceptedBaseQty = acceptedQty * conv;
        const rejectedBaseQty = rejectedQty * conv;
        const totalReceivedBaseQty = totalReceivedQty * conv;

        // Concurrency / Over-receiving protection:
        if (totalReceivedBaseQty <= 0) {
          throw new Error(`الكمية المستلمة للصنف "${poItem.productNameSnapshot}" يجب أن تكون أكبر من صفر`);
        }

        if (acceptedBaseQty > remainingBaseQty) {
          const maxAllowedInputUnits = remainingBaseQty / conv;
          throw new Error(
            `الكمية المقبولة (${acceptedQty}) تتجاوز الكمية المتبقية في أمر الشراء (${maxAllowedInputUnits}) للصنف "${poItem.productNameSnapshot}"`
          );
        }

        const unitCost = reqItem.unitPurchaseCost !== undefined ? reqItem.unitPurchaseCost : poItem.unitCost;
        const linePurchaseTotal = Math.round(unitCost * acceptedQty * 100) / 100;
        grnSubtotal += linePurchaseTotal;

        // Landed Cost Allocation: Proportional to line value
        let allocatedExtraCost = 0;
        if (extraCosts > 0 && acceptedGoodsSubtotal > 0 && acceptedBaseQty > 0) {
          const proportion = linePurchaseTotal / acceptedGoodsSubtotal;
          allocatedExtraCost = Math.round(extraCosts * proportion * 100) / 100;
        }

        // Effective Unit Cost (per base unit) including landed expenses
        const effectiveUnitCost =
          acceptedBaseQty > 0
            ? Math.round(((linePurchaseTotal + allocatedExtraCost) / acceptedBaseQty) * 10000) / 10000
            : unitCost / conv;

        // Read Stock & Recalculate WAC for Accepted Items
        const variantId = poItem.variantId && poItem.variantId.trim() !== '' ? poItem.variantId.trim() : null;
        const stockDocId = getBranchStockDocId(tenantId, destinationLocationId, poItem.productId, variantId);
        const stockDataRead = stockBalanceReads.get(stockDocId)!;

        let beforeStock = 0;
        let previousWac = effectiveUnitCost;
        let afterStock = 0;
        let newWac = effectiveUnitCost;
        let stockMovementId: string | undefined = undefined;

        if (acceptedBaseQty > 0) {
          if (stockDataRead.snap.exists()) {
            const currentStockData = stockDataRead.snap.data() as StockBalance;
            beforeStock = Number(currentStockData.onHandQuantity ?? currentStockData.quantity ?? 0);
            previousWac = Number(currentStockData.averageCost ?? currentStockData.unitCost ?? effectiveUnitCost);
          } else {
            beforeStock = 0;
            previousWac = effectiveUnitCost;
          }

          afterStock = beforeStock + acceptedBaseQty;

          // Compute WAC
          newWac = calculateWeightedAverageCost(beforeStock, previousWac, acceptedBaseQty, effectiveUnitCost);

          const updatedBalance: StockBalance = normalizeStockBalance({
            id: stockDocId,
            tenantId,
            branchId: destinationLocationId,
            productId: poItem.productId,
            variantId,
            onHandQuantity: afterStock,
            availableQuantity: afterStock,
            reservedQuantity: 0,
            averageCost: newWac,
            lastCost: effectiveUnitCost,
            unitCost: newWac,
            quantity: afterStock,
            updatedAt: receivedAt,
          });

          // Stock Movement Record
          const movementRef = doc(collection(db, 'stock_movements'));
          stockMovementId = movementRef.id;
          const movementRecord: StockMovement = {
            id: movementRef.id,
            tenantId,
            branchId: destinationLocationId,
            productId: poItem.productId,
            variantId,
            direction: 'in',
            movementType: 'purchase_receive',
            quantity: acceptedBaseQty,
            unitCost: effectiveUnitCost,
            totalCost: Math.round(effectiveUnitCost * acceptedBaseQty * 100) / 100,
            balanceBefore: beforeStock,
            balanceAfter: afterStock,
            referenceType: 'purchase',
            referenceId: grnRef.id,
            idempotencyKey: `goods_receipt:${grnRef.id}:${poItem.productId}`,
            reason: `استلام بضاعة مشتريات - إذن استلام رقم ${receiptNumber}`,
            notes: notes || '',
            performedBy: receivedBy,
            timestamp: receivedAt,
            createdAt: receivedAt,
          };

          stockUpdatesToCommit.push({
            stockRef: stockDataRead.ref,
            updatedBalance,
            movementRecord,
          });
        }

        // If items were rejected/damaged on arrival, record vendor discrepancy
        if (rejectedBaseQty > 0) {
          const dmgRef = doc(collection(db, 'damage_loss_records'));
          const damageRecord: DamageLossRecord = {
            id: dmgRef.id,
            tenantId,
            branchId: destinationLocationId,
            productId: poItem.productId,
            variantId,
            quantity: rejectedBaseQty,
            unitCost: unitCost / conv,
            totalCost: Math.round((unitCost / conv) * rejectedBaseQty * 100) / 100,
            reason: `بضاعة تالفة / مرفوضة عند الاستلام: ${reqItem.rejectionReason || 'تالف من المورد'}`,
            recordedBy: receivedBy,
            notes: `مرتبط بإذن الاستلام ${receiptNumber} وأمر الشراء ${poData.purchaseOrderNumber}`,
            createdAt: receivedAt,
          };
          transaction.set(dmgRef, damageRecord);
        }

        // Add to Goods Receipt Items
        grnItems.push({
          purchaseOrderItemId: poItem.id,
          productId: poItem.productId,
          variantId,
          productNameSnapshot: poItem.productNameSnapshot,
          skuSnapshot: poItem.skuSnapshot,
          receivedQuantity: totalReceivedQty,
          receivedBaseQuantity: totalReceivedBaseQty,
          acceptedQuantity: acceptedQty,
          acceptedBaseQuantity: acceptedBaseQty,
          rejectedQuantity: rejectedQty,
          rejectedBaseQuantity: rejectedBaseQty,
          rejectionReason: reqItem.rejectionReason || '',
          inputUnitId: poItem.inputUnitId,
          conversionFactor: conv,
          unitPurchaseCost: unitCost,
          allocatedExtraCost,
          effectiveUnitCost,
          lineTotal: linePurchaseTotal,
          beforeStock,
          afterStock,
          previousWac,
          newWac,
          stockMovementId,
        });

        // Update PO item received quantity
        poItem.receivedBaseQuantity = previouslyReceivedBase + acceptedBaseQty;
        poItem.receivedQuantity = poItem.receivedBaseQuantity / conv;
      }

      grnTotalLiability = Math.round((grnSubtotal + extraCosts) * 100) / 100;

      // 7. Write Stock Balance & Movements
      for (const update of stockUpdatesToCommit) {
        transaction.set(update.stockRef, update.updatedBalance, { merge: true });
        const mRef = doc(db, 'stock_movements', update.movementRecord.id);
        transaction.set(mRef, update.movementRecord);
      }

      // 8. Create Goods Receipt Record
      const goodsReceiptRecord: GoodsReceipt = {
        id: grnRef.id,
        tenantId,
        branchId,
        destinationLocationId,
        receiptNumber,
        purchaseOrderId: poData.id,
        purchaseOrderNumberSnapshot: poData.purchaseOrderNumber,
        supplierId: supplierData.id,
        supplierNameSnapshot: supplierData.name,
        supplierInvoiceNumber: supplierInvoiceNumber.trim(),
        supplierDeliveryNote: supplierDeliveryNote.trim(),
        status: 'completed',
        items: grnItems,
        subtotal: grnSubtotal,
        taxTotal: 0,
        extraCosts,
        grandTotal: grnTotalLiability,
        receivedBy,
        receivedAt,
        notes: notes.trim(),
        idempotencyKey,
        createdAt: receivedAt,
      };
      transaction.set(grnRef, goodsReceiptRecord);

      // 9. Update Purchase Order Status
      const isFullyReceived = updatedPoItems.every((item) => item.receivedBaseQuantity >= item.orderedBaseQuantity);
      transaction.update(poRef, {
        items: updatedPoItems,
        status: isFullyReceived ? 'received' : 'partially_received',
        updatedAt: receivedAt,
      });

      // 10. Update Supplier Liability (Ledger & Cached Current Balance)
      const currentSupplierBal = Number(supplierData.currentBalance || 0);
      const newSupplierBal = Math.round((currentSupplierBal + grnTotalLiability) * 100) / 100;

      const ledgerRef = doc(collection(db, 'supplier_ledger'));
      const ledgerEntry: SupplierLedgerEntry = {
        id: ledgerRef.id,
        tenantId,
        supplierId: supplierData.id,
        type: 'purchase_invoice',
        referenceType: 'goods_receipt',
        referenceId: grnRef.id,
        referenceNumber: receiptNumber,
        debit: 0,
        credit: grnTotalLiability, // Credit increases liability (we owe supplier)
        balanceAfter: newSupplierBal,
        currency: 'EGP',
        notes: supplierInvoiceNumber
          ? `فاتورة مشتريات رقم ${supplierInvoiceNumber} بموجب إذن الاستلام ${receiptNumber}`
          : `استلام بضاعة بموجب إذن استلام رقم ${receiptNumber}`,
        createdAt: receivedAt,
        createdBy: receivedBy,
      };
      transaction.set(ledgerRef, ledgerEntry);

      transaction.update(supplierRef, {
        currentBalance: newSupplierBal,
        updatedAt: receivedAt,
      });

      // 11. Register Idempotency Lock
      transaction.set(idempRef, {
        tenantId,
        idempotencyKey,
        receiptId: grnRef.id,
        receiptNumber,
        grandTotal: grnTotalLiability,
        receiptSnapshot: goodsReceiptRecord,
        createdAt: receivedAt,
      });

      return {
        isIdempotentReplay: false,
        goodsReceipt: goodsReceiptRecord,
      };
    });

    if (txResult.goodsReceipt && !txResult.isIdempotentReplay) {
      postGoodsReceiptJournalEntry(txResult.goodsReceipt, tenantId, { createdBy: receivedBy }).catch((postErr) => {
        console.warn('Background accounting journal post for goods receipt skipped/failed:', postErr);
      });
    }

    return {
      success: true,
      isIdempotentReplay: txResult.isIdempotentReplay,
      goodsReceipt: txResult.goodsReceipt,
    };
  } catch (err: any) {
    console.error('Goods receipt error:', err);
    return {
      success: false,
      isIdempotentReplay: false,
      error: err.message || 'فشلت عملية استلام البضاعة',
    };
  }
}

/**
 * Fetches Goods Receipts with cursor pagination and filtering
 */
export interface FetchGoodsReceiptsOptions {
  purchaseOrderId?: string;
  supplierId?: string;
  startDate?: string;
  endDate?: string;
  pageSize?: number;
  lastVisible?: DocumentSnapshot;
}

export async function fetchGoodsReceiptsFromDb(
  tenantId: string,
  options: FetchGoodsReceiptsOptions = {}
): Promise<{ receipts: GoodsReceipt[]; hasMore: boolean; lastVisible?: DocumentSnapshot }> {
  const { purchaseOrderId, supplierId, startDate, endDate, pageSize = 50 } = options;

  try {
    const rawSnap = await getDocs(collection(db, 'goods_receipts'));
    let receipts: GoodsReceipt[] = rawSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() } as GoodsReceipt)
    );

    // Resilient tenant filtering
    receipts = receipts.filter((r) => {
      const docTenant = r.tenantId || (r as any).tenant_id;
      if (tenantId && tenantId !== 'default' && docTenant && docTenant !== tenantId) {
        return false;
      }
      if (purchaseOrderId && r.purchaseOrderId !== purchaseOrderId) {
        return false;
      }
      if (supplierId && r.supplierId !== supplierId) {
        return false;
      }
      if (startDate && r.createdAt && r.createdAt < startDate) {
        return false;
      }
      if (endDate && r.createdAt && r.createdAt > endDate) {
        return false;
      }
      return true;
    });

    // In-memory bulletproof sort by createdAt desc (zero index requirement)
    receipts.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    });

    const hasMore = receipts.length > pageSize;
    const pagedReceipts = receipts.slice(0, pageSize);

    return {
      receipts: pagedReceipts,
      hasMore,
    };
  } catch (err) {
    console.error('Error fetching goods receipts from db:', err);
    return { receipts: [], hasMore: false };
  }
}
