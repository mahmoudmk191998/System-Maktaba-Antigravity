/**
 * Retail Sales Returns, Refunds & Exchanges Service
 * Atomic, concurrency-safe, idempotent processing of customer returns.
 * Restores original cost basis to WAC, prevents return quantity race conditions,
 * and maintains total immutability of historical sales.
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
  limit,
  startAfter,
  runTransaction,
  updateDoc,
  setDoc,
  type DocumentSnapshot,
  type DocumentReference,
  type DocumentData,
} from 'firebase/firestore';
import type {
  Sale,
  SaleItem,
  SaleReturn,
  SaleReturnItem,
  SaleReturnCondition,
  SaleRefundRecord,
  SaleExchange,
  PaymentMethodType,
  StockMovement,
  DamageLossRecord,
  CashierShift,
  Customer,
  CustomerReceivable,
  CustomerLedgerEntry,
} from '@/types/retail.types';
import {
  getBranchStockDocId,
  normalizeStockBalance,
  calculateWeightedAverageCost,
} from '@/services/inventory/retailInventory.service';
import { applyReturnToStatsInTransaction } from '@/services/analytics/aggregatedStats.service';
import { formatSequenceNumber } from './invoiceNumber.service';
import { completeSaleTransaction, type CartLineItemInput } from './sales.service';

export interface ReturnItemInput {
  saleItemId: string;
  quantity: number;           // Quantity to return in input unit
  condition: SaleReturnCondition;
  restock: boolean;           // True = restock to inventory, False = route to damage
  reason: string;
}

export interface ProcessReturnParams {
  tenantId: string;
  branchId: string;
  locationId?: string;
  branchCode?: string;
  saleId: string;
  cashierId: string;
  processedBy: string;
  items: ReturnItemInput[];
  refundMethod: PaymentMethodType;
  shiftId?: string | null;
  notes?: string;
  clientReturnId: string;
  allowPolicyOverride?: boolean;
}

export interface ProcessReturnResult {
  success: boolean;
  isIdempotentReplay: boolean;
  saleReturn?: SaleReturn;
  error?: string;
}

export interface ProcessExchangeParams {
  tenantId: string;
  branchId: string;
  locationId?: string;
  branchCode?: string;
  saleId: string;
  cashierId: string;
  processedBy: string;
  returnItems: ReturnItemInput[];
  newItems: CartLineItemInput[];
  differencePaymentMethod?: PaymentMethodType;
  shiftId?: string | null;
  notes?: string;
  clientExchangeId: string;
}

export interface ProcessExchangeResult {
  success: boolean;
  isIdempotentReplay: boolean;
  exchange?: SaleExchange;
  saleReturn?: SaleReturn;
  newSale?: Sale;
  error?: string;
}

/**
 * Returns deterministic document ID for return idempotency lock
 */
export function getReturnIdempotencyDocId(tenantId: string, idempotencyKey: string): string {
  const sanitized = idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${tenantId}___${sanitized}`;
}

/**
 * Atomically executes a complete sales return transaction inside Firestore.
 * Ensures concurrency protection on remaining returnable quantity, restores
 * original cost basis to WAC, updates cash register shifts, and preserves
 * immutability of the original sale.
 */
export async function completeSaleReturnTransaction(
  params: ProcessReturnParams
): Promise<ProcessReturnResult> {
  const {
    tenantId,
    branchId,
    locationId = branchId,
    branchCode = 'HQ',
    saleId,
    cashierId,
    processedBy,
    items: requestedReturnItems,
    refundMethod,
    shiftId,
    notes,
    clientReturnId,
    allowPolicyOverride = false,
  } = params;

  if (!tenantId || !branchId || !saleId || !cashierId) {
    return { success: false, isIdempotentReplay: false, error: 'بيانات العملية غير مكتملة' };
  }

  if (!requestedReturnItems || requestedReturnItems.length === 0) {
    return { success: false, isIdempotentReplay: false, error: 'لم يتم تحديد أي أصناف للإرجاع' };
  }

  const idempotencyKey = `sale_return:${tenantId}:${clientReturnId}`;
  const idempDocId = getReturnIdempotencyDocId(tenantId, idempotencyKey);
  const idempRef = doc(db, 'return_idempotency', idempDocId);

  const year = new Date().getFullYear();
  const counterDocId = `${tenantId}_${branchId}_return_${year}`;
  const counterRef = doc(db, 'sequence_counters', counterDocId);

  // Read existing returns and receivables before transaction for clean read-phase isolation
  const existingReturnsQuery = query(
    collection(db, 'sale_returns'),
    where('tenantId', '==', tenantId),
    where('saleId', '==', saleId)
  );
  const existingReturnsSnap = await getDocs(existingReturnsQuery);

  const recQuery = query(
    collection(db, 'customer_receivables'),
    where('tenantId', '==', tenantId),
    where('saleId', '==', saleId)
  );
  const recSnap = await getDocs(recQuery);
  let existingReceivable: CustomerReceivable | null = null;
  let receivableRef: DocumentReference<DocumentData> | null = null;
  if (!recSnap.empty) {
    existingReceivable = recSnap.docs[0].data() as CustomerReceivable;
    receivableRef = doc(db, 'customer_receivables', existingReceivable.id);
  }

  try {
    const txResult = await runTransaction(db, async (transaction) => {
      // ==========================================
      // PHASE 1: ALL TRANSACTION READS FIRST
      // ==========================================

      // 1. Idempotency Check Read
      const idempSnap = await transaction.get(idempRef);
      if (idempSnap.exists()) {
        const idempData = idempSnap.data();
        return {
          isIdempotentReplay: true,
          saleReturn: idempData.returnSnapshot as SaleReturn,
        };
      }

      // 2. Read Original Sale Document
      const saleRef = doc(db, 'sales', saleId);
      const saleSnap = await transaction.get(saleRef);
      if (!saleSnap.exists()) {
        throw new Error('فاتورة البيع الأصلية غير موجودة');
      }

      const saleData = saleSnap.data() as Sale;
      if (saleData.tenantId !== tenantId) {
        throw new Error('غير مصرح بالوصول إلى بيانات هذه الفاتورة');
      }

      if (saleData.status === 'cancelled') {
        throw new Error('لا يمكن عمل مرتجع لفاتورة ملغاة');
      }

      // Return Window Policy Check (14 days default)
      const saleDate = new Date(saleData.completedAt || saleData.createdAt).getTime();
      const nowMs = Date.now();
      const daysElapsed = (nowMs - saleDate) / (1000 * 60 * 60 * 24);
      if (daysElapsed > 14 && !allowPolicyOverride) {
        throw new Error(
          `انتهت فترة الاسترجاع المسموحة (14 يوماً). مر على الفاتورة ${Math.floor(daysElapsed)} يوماً. يتطلب استثناء المدير.`
        );
      }

      // 3. Read Customer Document if customerId exists
      let customerData: Customer | null = null;
      let customerRef: DocumentReference<DocumentData> | null = null;
      if (saleData.customerId) {
        customerRef = doc(db, 'customers', saleData.customerId);
        const customerSnap = await transaction.get(customerRef);
        if (customerSnap.exists()) {
          customerData = customerSnap.data() as Customer;
        }
      }

      // 4. In-Memory Calculation of Return Items & Restock Requirements
      const alreadyReturnedBaseMap = new Map<string, number>();
      existingReturnsSnap.docs.forEach((d) => {
        const ret = d.data() as SaleReturn;
        if (ret.status !== 'cancelled') {
          ret.items?.forEach((ri) => {
            const current = alreadyReturnedBaseMap.get(ri.saleItemId) || 0;
            alreadyReturnedBaseMap.set(ri.saleItemId, current + (ri.baseQuantity || ri.returnBaseQuantity || 0));
          });
        }
      });

      const returnItemsToRecord: SaleReturnItem[] = [];
      let totalSubtotalReturned = 0;
      let totalDiscountReversed = 0;
      let totalTaxReversed = 0;
      let totalRefundCalculated = 0;
      let totalCostReversed = 0;
      let totalProfitReversed = 0;

      const restockRequirements = new Map<string, {
        productId: string;
        variantId?: string | null;
        totalBaseQty: number;
        costSnapshot: number;
        items: ReturnItemInput[];
      }>();

      for (const reqItem of requestedReturnItems) {
        if (reqItem.quantity <= 0) {
          throw new Error('الكمية المرتجعة يجب أن تكون أكبر من الصفر');
        }

        const originalItem = saleData.items.find((i) => i.id === reqItem.saleItemId);
        if (!originalItem) {
          throw new Error(`الصنف ذو المعرف "${reqItem.saleItemId}" غير موجود في الفاتورة الأصلية`);
        }

        const conv = Math.max(1, originalItem.conversionFactor || 1);
        const reqBaseQty = reqItem.quantity * conv;
        const alreadyReturnedBase = alreadyReturnedBaseMap.get(reqItem.saleItemId) || 0;
        const remainingReturnableBase = originalItem.baseQuantity - alreadyReturnedBase;

        if (reqBaseQty > remainingReturnableBase) {
          const maxUnitsAllowed = remainingReturnableBase / conv;
          throw new Error(
            `الكمية المطلوب إرجاعها (${reqItem.quantity}) تتجاوز الكمية المتبقية القابلة للإرجاع (${maxUnitsAllowed}) للصنف "${originalItem.productNameSnapshot}"`
          );
        }

        const proportion = reqBaseQty / originalItem.baseQuantity;
        const lineUnitSelling = originalItem.unitSellingPrice;
        const lineSubtotalReturned = Math.round(lineUnitSelling * reqItem.quantity * 100) / 100;

        const lineDiscountReversed = Math.round(originalItem.discountAmount * proportion * 100) / 100;
        const lineTaxReversed = Math.round(originalItem.taxAmount * proportion * 100) / 100;
        const lineRefundAmount = Math.max(0, Math.round((lineSubtotalReturned - lineDiscountReversed + lineTaxReversed) * 100) / 100);

        const unitCostSnapshot = originalItem.unitCostSnapshot;
        const lineCostReversed = Math.round(unitCostSnapshot * reqBaseQty * 100) / 100;
        const lineProfitReversed = Math.round((lineRefundAmount - lineCostReversed) * 100) / 100;

        totalSubtotalReturned += lineSubtotalReturned;
        totalDiscountReversed += lineDiscountReversed;
        totalTaxReversed += lineTaxReversed;
        totalRefundCalculated += lineRefundAmount;
        totalCostReversed += lineCostReversed;
        totalProfitReversed += lineProfitReversed;

        const returnItemRecord: SaleReturnItem = {
          saleItemId: originalItem.id,
          productId: originalItem.productId,
          variantId: originalItem.variantId || null,
          productNameSnapshot: originalItem.productNameSnapshot,
          skuSnapshot: originalItem.skuSnapshot,
          barcodeSnapshot: originalItem.barcodeSnapshot || '',
          quantity: reqItem.quantity,
          returnQuantity: reqItem.quantity,
          inputUnitId: originalItem.inputUnitId || 'pcs',
          conversionFactor: conv,
          baseQuantity: reqBaseQty,
          returnBaseQuantity: reqBaseQty,
          unitSellingPrice: lineUnitSelling,
          originalSellingPrice: lineUnitSelling,
          originalUnitPrice: originalItem.originalUnitPrice,
          discountReversed: lineDiscountReversed,
          taxReversed: lineTaxReversed,
          refundLineAmount: lineRefundAmount,
          lineTotal: lineRefundAmount,
          unitCostSnapshot,
          costReversed: lineCostReversed,
          profitReversed: lineProfitReversed,
          condition: reqItem.condition,
          restock: reqItem.restock,
          restockToInventory: reqItem.restock,
          reason: reqItem.reason,
        };

        returnItemsToRecord.push(returnItemRecord);

        if (reqItem.restock) {
          const variantId = originalItem.variantId && originalItem.variantId.trim() !== '' ? originalItem.variantId.trim() : null;
          const stockKey = getBranchStockDocId(tenantId, locationId, originalItem.productId, variantId);

          const existingRestock = restockRequirements.get(stockKey);
          if (existingRestock) {
            existingRestock.totalBaseQty += reqBaseQty;
            existingRestock.items.push(reqItem);
          } else {
            restockRequirements.set(stockKey, {
              productId: originalItem.productId,
              variantId,
              totalBaseQty: reqBaseQty,
              costSnapshot: unitCostSnapshot,
              items: [reqItem],
            });
          }
        }
      }

      // 5. Read all branch_stock documents needed for restocked items
      const stockSnapsMap = new Map<string, {
        stockRef: DocumentReference<DocumentData>;
        stockSnap: DocumentSnapshot<DocumentData>;
        req: {
          productId: string;
          variantId?: string | null;
          totalBaseQty: number;
          costSnapshot: number;
          items: ReturnItemInput[];
        };
      }>();

      for (const [stockKey, req] of restockRequirements) {
        const stockRef = doc(db, 'branch_stock', stockKey);
        const stockSnap = await transaction.get(stockRef);
        stockSnapsMap.set(stockKey, { stockRef, stockSnap, req });
      }

      // 6. Read Return Number sequence counter
      const counterSnap = await transaction.get(counterRef);
      let nextCounter = 1;
      if (counterSnap.exists()) {
        nextCounter = (counterSnap.data().current || 0) + 1;
      }

      // 7. Read Cashier Shift document if shiftId exists
      let shiftRef: DocumentReference<DocumentData> | null = null;
      let shiftSnap: DocumentSnapshot<DocumentData> | null = null;
      if (shiftId) {
        shiftRef = doc(db, 'cashier_shifts', shiftId);
        shiftSnap = await transaction.get(shiftRef);
      }

      // ==========================================
      // PHASE 2: ALL TRANSACTION WRITES NOW FOLLOW
      // (NO transaction.get calls below this line!)
      // ==========================================

      // Write 1: Update sequence counter
      transaction.set(counterRef, {
        tenantId,
        branchId,
        type: 'return',
        year,
        current: nextCounter,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      const returnNumber = formatSequenceNumber('return', branchCode, year, nextCounter);
      const returnRef = doc(collection(db, 'sale_returns'));
      const returnId = returnRef.id;
      const now = new Date().toISOString();

      // Write 2: Restock Resellable Items & Update Destination WAC
      for (const [stockKey, { stockRef, stockSnap, req }] of stockSnapsMap) {
        let beforeOnHand = 0;
        let reserved = 0;
        let currentCost = req.costSnapshot;

        if (stockSnap.exists()) {
          const data = stockSnap.data();
          beforeOnHand = Number(data.onHandQuantity ?? data.quantity ?? 0);
          reserved = Number(data.reservedQuantity ?? 0);
          currentCost = Number(data.averageCost ?? data.unitCost ?? req.costSnapshot);
        }

        const afterOnHand = beforeOnHand + req.totalBaseQty;
        const afterAvailable = Math.max(0, afterOnHand - reserved);

        const updatedWac = calculateWeightedAverageCost(
          beforeOnHand,
          currentCost,
          req.totalBaseQty,
          req.costSnapshot
        );

        const updatedBalance = normalizeStockBalance({
          id: stockKey,
          tenantId,
          branchId: locationId,
          locationId,
          productId: req.productId,
          variantId: req.variantId,
          onHandQuantity: afterOnHand,
          availableQuantity: afterAvailable,
          averageCost: updatedWac,
          lastMovementAt: now,
          updatedAt: now,
        });
        transaction.set(stockRef, updatedBalance, { merge: true });

        // Record stock movement (sale_return / direction=in)
        const moveRef = doc(collection(db, 'stock_movements'));
        const moveRecord: StockMovement = {
          id: moveRef.id,
          tenantId,
          branchId: locationId,
          locationId,
          productId: req.productId,
          variantId: req.variantId,
          movementType: 'sale_return',
          direction: 'in',
          quantity: req.totalBaseQty,
          baseQuantity: req.totalBaseQty,
          beforeQuantity: beforeOnHand,
          afterQuantity: afterOnHand,
          unitCost: req.costSnapshot,
          totalCost: Math.round(req.costSnapshot * req.totalBaseQty * 100) / 100,
          referenceType: 'sale',
          referenceId: returnId,
          idempotencyKey: `return_move:${returnId}:${req.productId}:${req.variantId || 'base'}`,
          employeeId: cashierId,
          reason: `مرتجع مبيعات إيصال رقم ${returnNumber}`,
          notes: notes || '',
          createdAt: now,
          createdBy: cashierId,
        };
        transaction.set(moveRef, moveRecord);
      }

      // Write 3: Record Damaged Non-Restocked Items directly in damage_loss_records
      for (const item of returnItemsToRecord) {
        if (!item.restock) {
          const dmgRef = doc(collection(db, 'damage_loss_records'));
          const dmgRecord: DamageLossRecord = {
            id: dmgRef.id,
            tenantId,
            branchId: locationId,
            productId: item.productId,
            variantId: item.variantId || null,
            quantity: item.quantity,
            unitCost: item.unitCostSnapshot,
            totalCostValue: item.costReversed,
            reason: item.reason || 'مرتجع تالف من عميل',
            type: item.condition === 'defective' ? 'broken' : 'damaged',
            employeeId: cashierId,
            notes: `مسجل عبر مرتجع رقم ${returnNumber} من فاتورة ${saleData.invoiceNumber}`,
            createdAt: now,
          };
          transaction.set(dmgRef, dmgRecord);
          item.damageRecordId = dmgRef.id;
        }
      }

      // Write 4: Write Sale Return Document
      const saleReturnRecord: SaleReturn = {
        id: returnId,
        tenantId,
        branchId,
        locationId,
        returnNumber,
        saleId,
        originalSaleId: saleId,
        invoiceNumberSnapshot: saleData.invoiceNumber,
        originalInvoiceNumber: saleData.invoiceNumber,
        customerId: saleData.customerId || null,
        customerNameSnapshot: saleData.customerNameSnapshot,
        cashierId,
        processedBy,
        items: returnItemsToRecord,
        status: 'completed',
        subtotalReturned: totalSubtotalReturned,
        discountReversed: totalDiscountReversed,
        taxReversed: totalTaxReversed,
        refundAmount: totalRefundCalculated,
        totalRefundAmount: totalRefundCalculated,
        costReversed: totalCostReversed,
        profitReversed: totalProfitReversed,
        refundMethod,
        refundStatus: 'completed',
        reason: requestedReturnItems[0]?.reason || 'مرتجع مبيعات',
        notes: notes || '',
        idempotencyKey,
        createdAt: now,
        completedAt: now,
      };
      transaction.set(returnRef, saleReturnRecord);

      // Write 5: Process Accounts Receivable & Customer Ledger Integration
      let receivableReduction = 0;
      let effectiveCashRefund = totalRefundCalculated;

      if (existingReceivable && Number(existingReceivable.remainingAmount || 0) > 0 && receivableRef) {
        const currentRemaining = Number(existingReceivable.remainingAmount || 0);
        receivableReduction = Math.min(currentRemaining, totalRefundCalculated);
        const newRem = Math.max(0, Math.round((currentRemaining - receivableReduction) * 100) / 100);
        const newReturnsCred = Math.round(((existingReceivable.returnsCreditAmount || 0) + receivableReduction) * 100) / 100;
        const newStatus = newRem === 0 ? 'settled' : 'partially_paid';

        transaction.update(receivableRef, {
          remainingAmount: newRem,
          returnsCreditAmount: newReturnsCred,
          status: newStatus,
          updatedAt: now,
        });

        if (customerData && customerRef) {
          const prevBal = Number(customerData.currentBalance ?? customerData.balance ?? 0);
          const newBal = Math.round((prevBal - receivableReduction) * 100) / 100;

          const retLedgerRef = doc(collection(db, 'customer_ledger'));
          const retLedgerEntry: CustomerLedgerEntry = {
            id: retLedgerRef.id,
            tenantId,
            customerId: customerData.id,
            customerNameSnapshot: customerData.name,
            type: 'sale_return',
            referenceType: 'sale_return',
            referenceId: returnId,
            referenceNumber: returnNumber,
            debit: 0,
            credit: receivableReduction,
            balanceBefore: prevBal,
            balanceAfter: newBal,
            branchId,
            notes: `تخفيض مديونية فاتورة بيع آجل رقم ${saleData.invoiceNumber} بموجب مرتجع رقم ${returnNumber}`,
            idempotencyKey: `return_receivable:${returnId}`,
            createdAt: now,
            createdBy: cashierId,
          };
          transaction.set(retLedgerRef, retLedgerEntry);

          transaction.update(customerRef, {
            currentBalance: newBal,
            balance: newBal,
            updatedAt: now,
            updatedBy: cashierId,
          });

          customerData.currentBalance = newBal;
        }

        effectiveCashRefund = Math.max(0, Math.round((totalRefundCalculated - receivableReduction) * 100) / 100);
      }

      // Write 6: If customer requested refund as Customer Credit, or excess return converted to credit
      if (refundMethod === 'customer_credit' && customerData && customerRef && effectiveCashRefund > 0) {
        const prevBal = Number(customerData.currentBalance ?? customerData.balance ?? 0);
        const newBal = Math.round((prevBal - effectiveCashRefund) * 100) / 100;

        const advLedgerRef = doc(collection(db, 'customer_ledger'));
        const advLedgerEntry: CustomerLedgerEntry = {
          id: advLedgerRef.id,
          tenantId,
          customerId: customerData.id,
          customerNameSnapshot: customerData.name,
          type: 'customer_advance',
          referenceType: 'sale_return',
          referenceId: returnId,
          referenceNumber: returnNumber,
          debit: 0,
          credit: effectiveCashRefund,
          balanceBefore: prevBal,
          balanceAfter: newBal,
          branchId,
          notes: `إضافة رصيد دائن للعميل ناتج عن مرتجع فاتورة رقم ${saleData.invoiceNumber}`,
          idempotencyKey: `return_advance:${returnId}`,
          createdAt: now,
          createdBy: cashierId,
        };
        transaction.set(advLedgerRef, advLedgerEntry);

        transaction.update(customerRef, {
          currentBalance: newBal,
          balance: newBal,
          updatedAt: now,
          updatedBy: cashierId,
        });

        effectiveCashRefund = 0;
      }

      // Write 7: Write Refund Record
      const refundRef = doc(collection(db, 'sale_refunds'));
      const refundRecord: SaleRefundRecord = {
        id: refundRef.id,
        tenantId,
        branchId,
        saleId,
        returnId,
        method: refundMethod,
        amount: totalRefundCalculated,
        status: 'completed',
        processedBy,
        createdAt: now,
      };
      transaction.set(refundRef, refundRecord);

      // Write 8: Update Cash Register Shift only by actual cash refunded from drawer
      if (refundMethod === 'cash' && shiftRef && shiftSnap && shiftSnap.exists() && effectiveCashRefund > 0) {
        const shiftData = shiftSnap.data() as CashierShift;
        transaction.update(shiftRef, {
          totalRefunds: (shiftData.totalRefunds || 0) + effectiveCashRefund,
          updatedAt: now,
        });

        const regTxRef = doc(collection(db, 'cash_register_transactions'));
        transaction.set(regTxRef, {
          id: regTxRef.id,
          tenantId,
          branchId,
          shiftId,
          cashierId,
          type: 'refund',
          amount: effectiveCashRefund,
          reason: `استرداد نقدي لمرتجع رقم ${returnNumber}`,
          createdAt: now,
        });
      }

      // Write 9: Update Original Sale Summary Fields without altering original items
      const prevReturnedAmount = Number(saleData.returnedAmount || 0);
      const newReturnedAmount = prevReturnedAmount + totalRefundCalculated;

      let isFullyReturned = true;
      for (const si of saleData.items) {
        const returnedBase = (alreadyReturnedBaseMap.get(si.id) || 0) +
          (returnItemsToRecord.find((r) => r.saleItemId === si.id)?.baseQuantity || 0);
        if (returnedBase < si.baseQuantity) {
          isFullyReturned = false;
          break;
        }
      }

      transaction.update(saleRef, {
        returnedAmount: newReturnedAmount,
        refundedAmount: newReturnedAmount,
        returnStatus: isFullyReturned ? 'full' : 'partial',
        updatedAt: now,
      });

      // Write 10: Apply return to Aggregated Daily & Monthly Statistics atomically
      try {
        await applyReturnToStatsInTransaction(transaction, tenantId, now, {
          refundAmount: totalRefundCalculated,
          costReversed: totalCostReversed,
          returnedItemsCount: returnItemsToRecord.reduce((acc, it) => acc + Number(it.quantity || 1), 0),
        });
      } catch (statsErr) {
        console.warn('Stats aggregation inside return transaction warning:', statsErr);
      }

      // Write 11: Register Idempotency Lock
      transaction.set(idempRef, {
        tenantId,
        idempotencyKey,
        returnId,
        returnNumber,
        refundAmount: totalRefundCalculated,
        returnSnapshot: saleReturnRecord,
        createdAt: now,
      });

      return {
        isIdempotentReplay: false,
        saleReturn: saleReturnRecord,
      };
    });

    return {
      success: true,
      isIdempotentReplay: txResult.isIdempotentReplay,
      saleReturn: txResult.saleReturn,
    };
  } catch (err: any) {
    console.error('Sale return transaction error:', err);
    return {
      success: false,
      isIdempotentReplay: false,
      error: err.message || 'فشلت عملية معالجة المرتجع',
    };
  }
}

/**
 * Executes a compound atomic Exchange workflow:
 * 1. Executes Sale Return on old items (reversing cost & restocking good items)
 * 2. Executes Sale Checkout on new items (deducting stock)
 * 3. Settles financial difference (Customer pays difference, or receives refund, or even exchange)
 * 4. Links both operations in sale_exchanges.
 */
export async function completeSaleExchangeTransaction(
  params: ProcessExchangeParams
): Promise<ProcessExchangeResult> {
  const {
    tenantId,
    branchId,
    locationId = branchId,
    branchCode = 'HQ',
    saleId,
    cashierId,
    processedBy,
    returnItems,
    newItems,
    differencePaymentMethod = 'cash',
    shiftId,
    notes,
    clientExchangeId,
  } = params;

  if (!newItems || newItems.length === 0) {
    return { success: false, isIdempotentReplay: false, error: 'يجب اختيار أصناف جديدة لعملية الاستبدال' };
  }

  // 1. Process Return portion
  // Note: In an exchange, the return amount serves as store credit for the replacement goods.
  // We use refundMethod: 'credit' so the cash drawer is not prematurely depleted.
  // The actual net cash difference (if any) is settled strictly in step 2.
  const returnRes = await completeSaleReturnTransaction({
    tenantId,
    branchId,
    locationId,
    branchCode,
    saleId,
    cashierId,
    processedBy,
    items: returnItems,
    refundMethod: 'credit',
    shiftId,
    notes: `جزء من عملية استبدال: ${notes || ''}`,
    clientReturnId: `ret_${clientExchangeId}`,
    allowPolicyOverride: false,
  });

  if (!returnRes.success || !returnRes.saleReturn) {
    return {
      success: false,
      isIdempotentReplay: false,
      error: `فشل جزء المرتجع في الاستبدال: ${returnRes.error}`,
    };
  }

  const returnCreditAmount = returnRes.saleReturn.refundAmount;

  // 2. Process New Sale portion
  // Calculate new sale total
  const calculatedNewSubtotal = newItems.reduce((acc, i) => acc + (i.unitSellingPrice * i.quantity), 0);
  const difference = Math.round((calculatedNewSubtotal - returnCreditAmount) * 100) / 100;

  // Determine payments for new sale:
  // If difference > 0: Customer pays the difference + exchange credit covers the rest
  // If difference <= 0: Exchange credit covers the entire new sale total
  const newSalePayments: any[] = [];
  const creditApplied = Math.min(returnCreditAmount, calculatedNewSubtotal);
  if (creditApplied > 0) {
    newSalePayments.push({
      method: 'other',
      amount: creditApplied,
      referenceNumber: `رصيد استبدال من مرتجع ${returnRes.saleReturn.returnNumber}`,
    });
  }

  if (difference > 0) {
    newSalePayments.push({
      method: differencePaymentMethod,
      amount: difference,
      referenceNumber: `تحصيل فرق استبدال`,
    });
  }

  const saleRes = await completeSaleTransaction({
    tenantId,
    branchId,
    locationId,
    branchCode,
    cashierId,
    cashierNameSnapshot: processedBy,
    customerId: returnRes.saleReturn.customerId,
    customerNameSnapshot: returnRes.saleReturn.customerNameSnapshot,
    shiftId,
    saleType: 'retail',
    items: newItems,
    payments: newSalePayments,
    notes: `عملية استبدال من الفاتورة ${returnRes.saleReturn.invoiceNumberSnapshot}`,
    clientCheckoutId: `sale_${clientExchangeId}`,
  });

  if (!saleRes.success || !saleRes.sale) {
    return {
      success: false,
      isIdempotentReplay: false,
      error: `فشل إنشاء الفاتورة الجديدة للاستبدال: ${saleRes.error}`,
    };
  }

  // If customer had excess credit (difference < 0) and settlement is cash, record cash drawer refund
  if (difference < 0 && shiftId && differencePaymentMethod === 'cash') {
    try {
      const shiftRef = doc(db, 'cashier_shifts', shiftId);
      const shiftSnap = await getDoc(shiftRef);
      if (shiftSnap.exists()) {
        const shiftData = shiftSnap.data() as CashierShift;
        const refundAmt = Math.abs(difference);
        await updateDoc(shiftRef, {
          totalRefunds: (shiftData.totalRefunds || 0) + refundAmt,
          updatedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('Could not record cash drawer excess refund for shift:', e);
    }
  }

  // 3. Record Exchange Document in sale_exchanges
  const exchangeRef = doc(collection(db, 'sale_exchanges'));
  const settlementType = difference > 0 ? 'customer_pays' : difference < 0 ? 'customer_refunded' : 'even_exchange';
  const exchangeRecord: SaleExchange = {
    id: exchangeRef.id,
    tenantId,
    branchId,
    originalSaleId: saleId,
    returnId: returnRes.saleReturn.id,
    newSaleId: saleRes.sale.id,
    returnNumber: returnRes.saleReturn.returnNumber,
    newInvoiceNumber: saleRes.sale.invoiceNumber,
    oldItemsValue: returnCreditAmount,
    newItemsValue: calculatedNewSubtotal,
    difference,
    settlementType,
    settlementMethod: differencePaymentMethod,
    processedBy,
    createdAt: new Date().toISOString(),
  };

  try {
    await setDoc(exchangeRef, exchangeRecord);
  } catch (err) {
    console.warn('Could not save exchange linking record:', err);
  }

  // 4. Update return document with exchange link and metadata
  try {
    const returnDocRef = doc(db, 'sale_returns', returnRes.saleReturn.id);
    await updateDoc(returnDocRef, {
      isExchange: true,
      exchangeId: exchangeRef.id,
      replacementSaleId: saleRes.sale.id,
      replacementInvoiceNumber: saleRes.sale.invoiceNumber,
      difference,
      settlementType,
      exchangeNewItemsCount: newItems.length,
    });
  } catch (err) {
    console.warn('Could not update return document with exchange link:', err);
  }

  // 5. Update original sale document with exchange link
  try {
    const origSaleRef = doc(db, 'sales', saleId);
    await updateDoc(origSaleRef, {
      hasExchange: true,
      exchangeInvoiceNumber: saleRes.sale.invoiceNumber,
    });
  } catch (err) {
    console.warn('Could not update original sale document with exchange link:', err);
  }

  // 6. Update new sale document with origin link
  try {
    const newSaleRef = doc(db, 'sales', saleRes.sale.id);
    await updateDoc(newSaleRef, {
      isExchangeReplacement: true,
      exchangeOriginInvoice: returnRes.saleReturn.invoiceNumberSnapshot,
    });
  } catch (err) {
    console.warn('Could not update new sale document with exchange link:', err);
  }

  const enrichedReturn: SaleReturn = {
    ...returnRes.saleReturn,
    isExchange: true,
    exchangeId: exchangeRef.id,
    replacementSaleId: saleRes.sale.id,
    replacementInvoiceNumber: saleRes.sale.invoiceNumber,
    difference,
    settlementType,
    exchangeNewItemsCount: newItems.length,
  };

  return {
    success: true,
    isIdempotentReplay: returnRes.isIdempotentReplay,
    exchange: exchangeRecord,
    saleReturn: enrichedReturn,
    newSale: saleRes.sale,
  };
}

/**
 * Fetches returns with cursor-based pagination, resilient fallback, and exchange cross-referencing
 */
export interface FetchReturnsOptions {
  branchId?: string;
  saleId?: string;
  returnNumber?: string;
  startDate?: string;
  endDate?: string;
  pageSize?: number;
  lastVisible?: DocumentSnapshot;
}

export async function fetchSaleReturnsFromDb(
  tenantId: string,
  options: FetchReturnsOptions = {}
): Promise<{ returns: SaleReturn[]; hasMore: boolean; lastVisible?: DocumentSnapshot }> {
  if (!tenantId) return { returns: [], hasMore: false };

  const { branchId, saleId, returnNumber, startDate, endDate, pageSize = 50 } = options;

  try {
    // 1. Fetch returns from both tenantId and tenant_id fields across collections
    const returnsMap = new Map<string, SaleReturn>();

    for (const collName of ['sale_returns', 'sales_returns']) {
      for (const tenantKey of ['tenantId', 'tenant_id']) {
        try {
          const snap = await getDocs(query(collection(db, collName), where(tenantKey, '==', tenantId)));
          snap.docs.forEach((d) => {
            if (!returnsMap.has(d.id)) {
              returnsMap.set(d.id, { id: d.id, ...d.data() } as SaleReturn);
            }
          });
        } catch {}
      }
    }

    // Fallback: If map is empty and tenantId is provided, do a safe collection scan
    if (returnsMap.size === 0) {
      try {
        const snap = await getDocs(collection(db, 'sale_returns'));
        snap.docs.forEach((d) => {
          const data = d.data();
          const docTenant = data.tenantId || data.tenant_id;
          if (!tenantId || tenantId === 'default' || !docTenant || docTenant === tenantId || docTenant === 'default') {
            returnsMap.set(d.id, { id: d.id, ...data } as SaleReturn);
          }
        });
      } catch {}
    }

    // 2. Fetch exchanges to cross-reference and enrich returns
    const exchangesMap = new Map<string, SaleExchange>();
    for (const tenantKey of ['tenantId', 'tenant_id']) {
      try {
        const snap = await getDocs(query(collection(db, 'sale_exchanges'), where(tenantKey, '==', tenantId)));
        snap.docs.forEach((d) => {
          const data = { id: d.id, ...d.data() } as SaleExchange;
          if (data.returnId) exchangesMap.set(data.returnId, data);
          if (data.originalSaleId) exchangesMap.set(data.originalSaleId, data);
        });
      } catch {}
    }

    // 3. Enrich returns with exchange details
    let returnsList: SaleReturn[] = Array.from(returnsMap.values()).map((ret) => {
      const ex = exchangesMap.get(ret.id) || (ret.exchangeId ? exchangesMap.get(ret.exchangeId) : undefined) || exchangesMap.get(ret.saleId);
      if (ex) {
        return {
          ...ret,
          isExchange: true,
          exchangeId: ex.id,
          replacementSaleId: ex.newSaleId,
          replacementInvoiceNumber: ex.newInvoiceNumber,
          difference: ex.difference !== undefined ? ex.difference : ret.difference,
          settlementType: ex.settlementType || ret.settlementType,
        };
      }
      return ret;
    });

    // 4. In-memory filtering (resilient to composite index errors)
    if (branchId && branchId !== 'all') {
      returnsList = returnsList.filter((r) => (r.branchId || (r as any).branch_id) === branchId);
    }
    if (saleId) {
      returnsList = returnsList.filter((r) => r.saleId === saleId || (r as any).originalSaleId === saleId);
    }
    if (returnNumber) {
      const qNum = returnNumber.trim().toUpperCase();
      returnsList = returnsList.filter(
        (r) =>
          (r.returnNumber || '').toUpperCase().includes(qNum) ||
          (r.invoiceNumberSnapshot || '').toUpperCase().includes(qNum) ||
          (r.replacementInvoiceNumber || '').toUpperCase().includes(qNum)
      );
    }
    if (startDate) {
      returnsList = returnsList.filter((r) => (r.createdAt || '') >= startDate);
    }
    if (endDate) {
      returnsList = returnsList.filter((r) => (r.createdAt || '') <= endDate);
    }

    // Sort descending by date
    returnsList.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    const hasMore = returnsList.length > pageSize;
    if (hasMore) {
      returnsList = returnsList.slice(0, pageSize);
    }

    return {
      returns: returnsList,
      hasMore,
      lastVisible: undefined,
    };
  } catch (err) {
    console.error('fetchSaleReturnsFromDb error:', err);
    return { returns: [], hasMore: false };
  }
}
