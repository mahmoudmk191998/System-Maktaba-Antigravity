/**
 * Retail Sales & POS Engine
 * Provides atomic, idempotent, concurrency-safe checkout for bookstores & stationery retail.
 * Guarantees zero partial checkout, captures historical cost snapshots, and updates inventory ledger.
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
  type DocumentSnapshot,
} from 'firebase/firestore';
import type {
  Sale,
  SaleItem,
  SalePaymentRecord,
  PaymentEntry,
  SaleType,
  SaleStatus,
  StockMovement,
  CashierShift,
  Customer,
  CustomerReceivable,
  CustomerLedgerEntry,
} from '@/types/retail.types';
import {
  getBranchStockDocId,
  normalizeStockBalance,
} from '@/services/inventory/retailInventory.service';
import { formatSequenceNumber } from './invoiceNumber.service';
import { checkCustomerCreditEligibility } from '@/services/customers/creditSales.service';

export interface CartLineItemInput {
  productId: string;
  variantId?: string | null;
  productName: string;
  variantName?: string | null;
  sku: string;
  barcode?: string;
  categoryName?: string;
  brandName?: string;
  quantity: number;           // Input quantity (e.g. 2 boxes)
  inputUnitId?: string;
  conversionFactor?: number;  // e.g. 50
  unitSellingPrice: number;   // Price per input unit
  originalUnitPrice?: number;
  discountAmount?: number;    // Line discount
  taxRate?: number;           // e.g. 0.14
  priceSource?: string;
  priceListId?: string | null;
  pricingRuleId?: string | null;
  minimumSellingPrice?: number;
  isArchived?: boolean;
}

export interface CompleteSaleParams {
  tenantId: string;
  branchId: string;
  locationId?: string;
  branchCode?: string;
  cashierId: string;
  cashierNameSnapshot?: string;
  customerId?: string | null;
  customerNameSnapshot?: string;
  customerPhoneSnapshot?: string;
  shiftId?: string | null;
  saleType: SaleType;
  items: CartLineItemInput[];
  payments: PaymentEntry[];
  cartDiscountAmount?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  notes?: string;
  isCreditSale?: boolean;
  allowCreditOverride?: boolean;
  blockCreditWhenOverdue?: boolean;
  dueDate?: string;
  clientCheckoutId: string;
  allowBelowMinimum?: boolean;
  allowPriceOverride?: boolean;
  serviceChargeRate?: number;
  serviceChargeAmount?: number;
  taxIncluded?: boolean;
  serviceChargeIncluded?: boolean;
}

export interface CompleteSaleResult {
  success: boolean;
  isIdempotentReplay: boolean;
  sale?: Sale;
  error?: string;
}

/**
 * Returns deterministic doc ID for sale idempotency lock
 */
export function getSaleIdempotencyDocId(tenantId: string, idempotencyKey: string): string {
  const sanitized = idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${tenantId}___${sanitized}`;
}

/**
 * Executes a complete retail checkout atomically inside a single Firestore transaction.
 * Either all items are validated, stock deducted, invoice generated, and payments recorded,
 * or the entire transaction fails with ZERO partial state.
 */
export async function completeSaleTransaction(
  params: CompleteSaleParams
): Promise<CompleteSaleResult> {
  const {
    tenantId,
    branchId,
    locationId = branchId,
    branchCode = 'HQ',
    cashierId,
    cashierNameSnapshot = 'كاشير',
    customerId = null,
    customerNameSnapshot,
    customerPhoneSnapshot,
    shiftId,
    saleType = 'retail',
    items,
    payments,
    cartDiscountAmount = 0,
    discountType = 'fixed',
    discountValue,
    notes,
    isCreditSale = false,
    allowCreditOverride = false,
    blockCreditWhenOverdue = false,
    dueDate,
    clientCheckoutId,
    allowBelowMinimum = false,
    serviceChargeRate = 0,
    serviceChargeAmount,
    taxIncluded = false,
    serviceChargeIncluded = false,
  } = params;

  if (!tenantId || !branchId || !cashierId) {
    return { success: false, isIdempotentReplay: false, error: 'بيانات الفرع أو الكاشير غير مكتملة' };
  }

  if (!items || items.length === 0) {
    return { success: false, isIdempotentReplay: false, error: 'سلة المشتريات فارغة' };
  }

  const idempotencyKey = `sale_checkout:${tenantId}:${clientCheckoutId}`;
  const idempDocId = getSaleIdempotencyDocId(tenantId, idempotencyKey);
  const idempRef = doc(db, 'sale_idempotency', idempDocId);
  const year = new Date().getFullYear();
  const counterDocId = `${tenantId}_${branchId}_sale_${year}`;
  const counterRef = doc(db, 'sequence_counters', counterDocId);

  // Group cart items by stock document to compute total base quantity needed per SKU/Variant
  const stockRequirements = new Map<string, {
    productId: string;
    variantId?: string | null;
    totalBaseQuantity: number;
    lines: CartLineItemInput[];
  }>();

  for (const line of items) {
    if (line.quantity <= 0) {
      return { success: false, isIdempotentReplay: false, error: `الكمية غير صالحة للصنف "${line.productName}"` };
    }
    if (line.isArchived) {
      return { success: false, isIdempotentReplay: false, error: `الصنف "${line.productName}" مؤرشف ولا يمكن بيعه` };
    }

    const conv = Math.max(1, line.conversionFactor || 1);
    const baseQty = line.quantity * conv;
    const variantId = line.variantId && line.variantId.trim() !== '' ? line.variantId.trim() : null;
    const stockKey = getBranchStockDocId(tenantId, locationId, line.productId, variantId);

    const existing = stockRequirements.get(stockKey);
    if (existing) {
      existing.totalBaseQuantity += baseQty;
      existing.lines.push(line);
    } else {
      stockRequirements.set(stockKey, {
        productId: line.productId,
        variantId,
        totalBaseQuantity: baseQty,
        lines: [line],
      });
    }
  }

  try {
    const transactionResult = await runTransaction(db, async (transaction) => {
      // 1. Check Idempotency Lock
      const idempSnap = await transaction.get(idempRef);
      if (idempSnap.exists()) {
        const idempData = idempSnap.data();
        return {
          isIdempotentReplay: true,
          sale: idempData.saleSnapshot as Sale,
        };
      }

      // 2. Read Cashier Shift if provided
      let shiftData: CashierShift | null = null;
      let shiftRef = null;
      if (shiftId) {
        shiftRef = doc(db, 'cashier_shifts', shiftId);
        const shiftSnap = await transaction.get(shiftRef);
        if (shiftSnap.exists()) {
          shiftData = shiftSnap.data() as CashierShift;
          if (shiftData.status !== 'open') {
            throw new Error('وردية الكاشير مغلقة حالياً. يرجى فتح الوردية أولاً لإتمام البيع.');
          }
        }
      }

      // 3. Read All Required Stock Balances in Transaction
      const stockSnapshots = new Map<string, { snap: DocumentSnapshot; beforeOnHand: number; averageCost: number }>();

      for (const [stockKey] of stockRequirements) {
        const stockRef = doc(db, 'branch_stock', stockKey);
        const snap = await transaction.get(stockRef);

        let beforeOnHand = 0;
        let reserved = 0;
        let averageCost = 0;

        if (snap.exists()) {
          const data = snap.data();
          beforeOnHand = Number(data.onHandQuantity ?? data.quantity ?? 0);
          reserved = Number(data.reservedQuantity ?? 0);
          averageCost = Number(data.averageCost ?? data.unitCost ?? 0);
        }

        const available = Math.max(0, beforeOnHand - reserved);
        stockSnapshots.set(stockKey, { snap, beforeOnHand, averageCost });
      }

      // 4. Validate Stock Availability for all grouped requirements
      for (const [stockKey, req] of stockRequirements) {
        const stockInfo = stockSnapshots.get(stockKey)!;
        const available = stockInfo.beforeOnHand; // reserved stock accounted for
        if (available < req.totalBaseQuantity) {
          const firstLine = req.lines[0];
          throw new Error(
            `الكمية المتاحة غير كافية في هذا الموقع للصنف "${firstLine.productName}". المتاح: ${available}، المطلوب صرفه: ${req.totalBaseQuantity}`
          );
        }
      }

      // 5. Read Customer in Transaction if customerId is provided
      let customerData: Customer | null = null;
      let customerRef: any = null;
      if (customerId) {
        customerRef = doc(db, 'customers', customerId);
        const customerSnap = await transaction.get(customerRef);
        if (customerSnap.exists()) {
          customerData = customerSnap.data() as Customer;
        }
      }

      // 6. Read and Increment Sequence Counter for Invoice Number
      const counterSnap = await transaction.get(counterRef);
      let nextCounter = 1;
      if (counterSnap.exists()) {
        nextCounter = (counterSnap.data().current || 0) + 1;
      }
      transaction.set(counterRef, {
        tenantId,
        branchId,
        type: 'sale',
        year,
        current: nextCounter,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      const invoiceNumber = formatSequenceNumber('sale', branchCode, year, nextCounter);
      const saleRef = doc(collection(db, 'sales'));
      const saleId = saleRef.id;
      const now = new Date().toISOString();

      // 6. Build Sale Items & Calculate Line Financials with Cost Snapshots
      const saleItems: SaleItem[] = [];
      let calculatedSubtotal = 0;
      let calculatedLineDiscounts = 0;
      let calculatedTaxes = 0;
      let calculatedCostTotal = 0;

      for (let i = 0; i < items.length; i++) {
        const itemInput = items[i];
        const conv = Math.max(1, itemInput.conversionFactor || 1);
        const baseQty = itemInput.quantity * conv;
        const variantId = itemInput.variantId && itemInput.variantId.trim() !== '' ? itemInput.variantId.trim() : null;
        const stockKey = getBranchStockDocId(tenantId, locationId, itemInput.productId, variantId);
        const stockInfo = stockSnapshots.get(stockKey)!;
        const unitCostSnapshot = stockInfo.averageCost;

        // Minimum price guard
        const minPrice = itemInput.minimumSellingPrice ?? 0;
        if (!allowBelowMinimum && minPrice > 0 && itemInput.unitSellingPrice < minPrice) {
          throw new Error(
            `سعر بيع الصنف "${itemInput.productName}" (${itemInput.unitSellingPrice} ج.م) أقل من الحد الأدنى المسموح (${minPrice} ج.م)`
          );
        }

        const lineOriginalUnit = itemInput.originalUnitPrice ?? itemInput.unitSellingPrice;
        const lineSubtotal = Math.round(itemInput.unitSellingPrice * itemInput.quantity * 100) / 100;
        const lineDiscount = Math.round((itemInput.discountAmount ?? 0) * 100) / 100;
        const taxRate = itemInput.taxRate ?? 0;
        const taxableAmount = Math.max(0, lineSubtotal - lineDiscount);
        const lineTax = Math.round(taxableAmount * taxRate * 100) / 100;
        const lineFinalTotal = Math.round((taxableAmount + lineTax) * 100) / 100;

        const lineTotalCost = Math.round(unitCostSnapshot * baseQty * 100) / 100;
        const lineGrossProfit = Math.round((lineFinalTotal - lineTotalCost) * 100) / 100;

        calculatedSubtotal += lineSubtotal;
        calculatedLineDiscounts += lineDiscount;
        calculatedTaxes += lineTax;
        calculatedCostTotal += lineTotalCost;

        const saleItemId = `${saleId}_item_${i + 1}`;
        const saleItemRecord: SaleItem = {
          id: saleItemId,
          saleId,
          productId: itemInput.productId,
          variantId,
          productNameSnapshot: itemInput.productName,
          variantNameSnapshot: itemInput.variantName || null,
          skuSnapshot: itemInput.sku,
          barcodeSnapshot: itemInput.barcode || '',
          categorySnapshot: itemInput.categoryName || '',
          brandSnapshot: itemInput.brandName || '',
          quantity: itemInput.quantity,
          inputUnitId: itemInput.inputUnitId || 'pcs',
          unitId: itemInput.inputUnitId || 'pcs',
          conversionFactor: conv,
          baseQuantity: baseQty,
          unitSellingPrice: itemInput.unitSellingPrice,
          sellingPrice: itemInput.unitSellingPrice,
          originalUnitPrice: lineOriginalUnit,
          originalPrice: lineOriginalUnit,
          discountAmount: lineDiscount,
          discount: lineDiscount,
          taxAmount: lineTax,
          tax: lineTax,
          lineTotal: lineFinalTotal,
          unitCostSnapshot,
          costPriceSnapshot: unitCostSnapshot,
          totalCost: lineTotalCost,
          grossProfit: lineGrossProfit,
          priceSource: itemInput.priceSource || (saleType === 'wholesale' ? 'wholesale' : 'retail'),
          priceListId: itemInput.priceListId || null,
          pricingRuleId: itemInput.pricingRuleId || null,
          resolvedPrice: itemInput.unitSellingPrice,
        };

        saleItems.push(saleItemRecord);
      }

      // Apportion cart level discount if present
      const totalDiscount = Math.round((calculatedLineDiscounts + Math.max(0, cartDiscountAmount)) * 100) / 100;
      
      const serviceRate = Number(serviceChargeRate) || 0;
      let effectiveServiceAmount = 0;
      if (serviceChargeAmount !== undefined) {
        effectiveServiceAmount = Number(serviceChargeAmount) || 0;
      } else if (serviceRate > 0) {
        const taxableSubtotal = Math.max(0, calculatedSubtotal - totalDiscount);
        if (serviceChargeIncluded) {
          effectiveServiceAmount = Math.round((taxableSubtotal - (taxableSubtotal / (1 + serviceRate / 100))) * 100) / 100;
        } else {
          effectiveServiceAmount = Math.round(taxableSubtotal * (serviceRate / 100) * 100) / 100;
        }
      }

      const taxToAdd = taxIncluded ? 0 : calculatedTaxes;
      const serviceToAdd = serviceChargeIncluded ? 0 : effectiveServiceAmount;
      const finalGrandTotal = Math.max(0, Math.round((calculatedSubtotal - totalDiscount + taxToAdd + serviceToAdd) * 100) / 100);
      const overallGrossProfit = Math.round((finalGrandTotal - calculatedCostTotal) * 100) / 100;

      // 7. Validate Payments
      const totalPaid = Math.round(payments.reduce((acc, p) => acc + Number(p.amount || 0), 0) * 100) / 100;
      const hasCash = payments.some((p) => p.method === 'cash');
      let changeAmount = 0;

      if (totalPaid < finalGrandTotal && !isCreditSale) {
        throw new Error(
          `المبلغ المدفوع (${totalPaid} ج.م) أقل من إجمالي الفاتورة المطلوب (${finalGrandTotal} ج.م)`
        );
      }

      if (hasCash && totalPaid > finalGrandTotal) {
        changeAmount = Math.round((totalPaid - finalGrandTotal) * 100) / 100;
      } else if (!hasCash && totalPaid > finalGrandTotal && !isCreditSale) {
        throw new Error(
          `المبلغ المدفوع عبر وسائل إلكترونية (${totalPaid} ج.م) يتجاوز قيمة الفاتورة (${finalGrandTotal} ج.م)`
        );
      }

      // 8. Build Payment Records
      const salePaymentRecords: SalePaymentRecord[] = payments.map((p, idx) => ({
        id: `${saleId}_pay_${idx + 1}`,
        saleId,
        tenantId,
        branchId,
        method: p.method,
        amount: Number(p.amount),
        reference: p.referenceNumber || '',
        paidAt: now,
        cashierId,
        status: 'success',
      }));

      // 9. Deduct Stock Balances and Write Movements inside Transaction
      for (const [stockKey, req] of stockRequirements) {
        const stockRef = doc(db, 'branch_stock', stockKey);
        const stockInfo = stockSnapshots.get(stockKey)!;
        const afterOnHand = stockInfo.beforeOnHand - req.totalBaseQuantity;
        const afterAvailable = Math.max(0, afterOnHand);

        // Update Stock Balance preserving WAC (sales do NOT alter remaining inventory WAC)
        const updatedBalance = normalizeStockBalance({
          id: stockKey,
          tenantId,
          branchId: locationId,
          locationId,
          productId: req.productId,
          variantId: req.variantId,
          onHandQuantity: afterOnHand,
          availableQuantity: afterAvailable,
          averageCost: stockInfo.averageCost,
          lastMovementAt: now,
          updatedAt: now,
        });
        transaction.set(stockRef, updatedBalance, { merge: true });

        // Record stock movement for each line
        for (const line of req.lines) {
          const moveRef = doc(collection(db, 'stock_movements'));
          const lineConv = Math.max(1, line.conversionFactor || 1);
          const lineBaseQty = line.quantity * lineConv;
          const movementDoc: StockMovement = {
            id: moveRef.id,
            tenantId,
            branchId: locationId,
            locationId,
            productId: line.productId,
            variantId: req.variantId,
            movementType: 'sale',
            direction: 'out',
            quantity: -lineBaseQty,
            inputQuantity: line.quantity,
            inputUnitId: line.inputUnitId || 'pcs',
            conversionFactor: lineConv,
            baseQuantity: lineBaseQty,
            beforeQuantity: stockInfo.beforeOnHand,
            afterQuantity: afterOnHand,
            unitCost: stockInfo.averageCost,
            totalCost: Math.round(stockInfo.averageCost * lineBaseQty * 100) / 100,
            referenceType: 'sale',
            referenceId: saleId,
            idempotencyKey: `sale_item:${saleId}:${line.productId}:${req.variantId || 'base'}`,
            employeeId: cashierId,
            reason: `مبيعات فاتورة رقم ${invoiceNumber}`,
            notes: notes || '',
            createdAt: now,
            createdBy: cashierId,
          };
          transaction.set(moveRef, movementDoc);
        }
      }

      // 10. Write Sale Document
      const saleRecord: Sale = {
        id: saleId,
        tenantId,
        branchId,
        locationId,
        invoiceNumber,
        customerId,
        customerNameSnapshot: customerNameSnapshot || (customerId ? 'عميل مسجل' : 'عميل نقدي (Walk-in)'),
        customerPhoneSnapshot: customerPhoneSnapshot || '',
        cashierId,
        cashierNameSnapshot,
        shiftId: shiftId || null,
        status: 'completed',
        saleStatus: 'completed',
        saleType,
        items: saleItems,
        subtotal: calculatedSubtotal,
        discountType: discountType || 'fixed',
        discountValue: discountValue !== undefined ? Number(discountValue) : Number(cartDiscountAmount),
        cartDiscountAmount: Number(cartDiscountAmount) || 0,
        discountTotal: totalDiscount,
        discount: totalDiscount,
        serviceChargeRate: serviceRate,
        serviceChargeTotal: effectiveServiceAmount,
        serviceCharge: effectiveServiceAmount,
        taxTotal: calculatedTaxes,
        tax: calculatedTaxes,
        taxIncluded: !!taxIncluded,
        serviceChargeIncluded: !!serviceChargeIncluded,
        total: finalGrandTotal,
        costTotal: calculatedCostTotal,
        grossProfit: overallGrossProfit,
        paidAmount: totalPaid - changeAmount,
        changeAmount,
        remainingAmount: isCreditSale ? Math.max(0, finalGrandTotal - totalPaid) : 0,
        paymentStatus: isCreditSale && totalPaid < finalGrandTotal ? 'partial' : 'paid',
        paymentMethods: payments,
        payments: salePaymentRecords,
        priceTierUsed: saleType,
        notes: notes || '',
        isCreditSale: !!isCreditSale,
        idempotencyKey,
        createdBy: cashierId,
        createdAt: now,
        completedAt: now,
        updatedAt: now,
      };

      transaction.set(saleRef, saleRecord);

      // Write standalone sale_payments docs
      for (const pRecord of salePaymentRecords) {
        const pRef = doc(db, 'sale_payments', pRecord.id);
        transaction.set(pRef, pRecord);
      }

      // 11. Process Credit Sale & Customer Accounts (Phase 8)
      const remainingCreditAmount = isCreditSale ? Math.max(0, Math.round((finalGrandTotal - totalPaid) * 100) / 100) : 0;
      const customerCreditPayment = payments.find((p) => p.method === 'customer_credit');
      const creditPaidAmount = customerCreditPayment ? Number(customerCreditPayment.amount || 0) : 0;

      if (remainingCreditAmount > 0 || creditPaidAmount > 0 || customerId) {
        if ((remainingCreditAmount > 0 || creditPaidAmount > 0) && (!customerId || !customerData)) {
          throw new Error('البيع الآجل أو الدفع من رصيد العميل يتطلب تحديد عميل مسجل');
        }

        let runningCustomerBalance = Number(customerData?.currentBalance ?? customerData?.balance ?? 0);

        // A. If payment used customer_credit, deduct from available customer advance
        if (creditPaidAmount > 0 && customerData) {
          const availableCredit = Math.max(0, -runningCustomerBalance);
          if (creditPaidAmount > availableCredit) {
            throw new Error(
              `رصيد العميل الدائن المتاح (${availableCredit} ج.م) لا يكفي لسداد ${creditPaidAmount} ج.م`
            );
          }

          const balBefore = runningCustomerBalance;
          runningCustomerBalance = Math.round((runningCustomerBalance + creditPaidAmount) * 100) / 100;

          const advanceLedgerRef = doc(collection(db, 'customer_ledger'));
          const advanceLedgerEntry: CustomerLedgerEntry = {
            id: advanceLedgerRef.id,
            tenantId,
            customerId: customerData.id,
            customerNameSnapshot: customerData.name,
            type: 'advance_applied',
            referenceType: 'sale',
            referenceId: saleId,
            referenceNumber: invoiceNumber,
            debit: creditPaidAmount,
            credit: 0,
            balanceBefore: balBefore,
            balanceAfter: runningCustomerBalance,
            branchId,
            notes: `استخدام رصيد دائن لسداد فاتورة ${invoiceNumber}`,
            idempotencyKey: `advance_applied:${saleId}`,
            createdAt: now,
            createdBy: cashierId,
          };
          transaction.set(advanceLedgerRef, advanceLedgerEntry);
        }

        // B. If remaining unpaid balance is a Credit Sale, validate limit & create receivable
        if (remainingCreditAmount > 0 && customerData) {
          const eligibility = checkCustomerCreditEligibility(customerData, remainingCreditAmount, {
            allowCreditOverride,
            blockCreditWhenOverdue,
          });

          if (!eligibility.eligible) {
            throw new Error(eligibility.reason || 'العميل غير مؤهل للشراء الآجل');
          }

          const recDueDate = dueDate || new Date(Date.now() + (customerData.paymentTermsDays || 30) * 86400000).toISOString().split('T')[0];

          // Write Customer Receivable
          const recRef = doc(collection(db, 'customer_receivables'));
          const recDoc: CustomerReceivable = {
            id: recRef.id,
            tenantId,
            customerId: customerData.id,
            customerNameSnapshot: customerData.name,
            saleId,
            invoiceNumber,
            branchId,
            issueDate: now.split('T')[0],
            dueDate: recDueDate,
            originalAmount: remainingCreditAmount,
            paidAmount: 0,
            returnsCreditAmount: 0,
            remainingAmount: remainingCreditAmount,
            status: 'open',
            createdAt: now,
            updatedAt: now,
          };
          transaction.set(recRef, recDoc);

          // Write Customer Ledger Entry for Credit Sale (debit increases customer debt)
          const balBefore = runningCustomerBalance;
          runningCustomerBalance = Math.round((runningCustomerBalance + remainingCreditAmount) * 100) / 100;

          const creditLedgerRef = doc(collection(db, 'customer_ledger'));
          const creditLedgerEntry: CustomerLedgerEntry = {
            id: creditLedgerRef.id,
            tenantId,
            customerId: customerData.id,
            customerNameSnapshot: customerData.name,
            type: 'credit_sale',
            referenceType: 'sale',
            referenceId: saleId,
            referenceNumber: invoiceNumber,
            debit: remainingCreditAmount,
            credit: 0,
            balanceBefore: balBefore,
            balanceAfter: runningCustomerBalance,
            dueDate: recDueDate,
            branchId,
            notes: `مبيعات آجلة فاتورة رقم ${invoiceNumber}`,
            idempotencyKey: `credit_sale:${saleId}`,
            createdAt: now,
            createdBy: cashierId,
          };
          transaction.set(creditLedgerRef, creditLedgerEntry);
        }

        // C. Update Customer cached balance and purchase statistics
        if (customerData && customerRef) {
          transaction.update(customerRef, {
            currentBalance: runningCustomerBalance,
            balance: runningCustomerBalance,
            totalPurchases: (customerData.totalPurchases || 0) + 1,
            lastPurchaseAt: now,
            updatedAt: now,
            updatedBy: cashierId,
          });
        }
      }

      // 11. Update Cashier Shift if active
      if (shiftRef && shiftData) {
        const cashAmount = payments
          .filter((p) => p.method === 'cash')
          .reduce((acc, p) => acc + Number(p.amount || 0), 0) - changeAmount;
        const cardAmount = payments
          .filter((p) => p.method !== 'cash')
          .reduce((acc, p) => acc + Number(p.amount || 0), 0);

        transaction.update(shiftRef, {
          totalSalesCash: (shiftData.totalSalesCash || 0) + Math.max(0, cashAmount),
          totalSalesCard: (shiftData.totalSalesCard || 0) + Math.max(0, cardAmount),
          totalSalesCount: (shiftData.totalSalesCount || 0) + 1,
          totalDiscounts: (shiftData.totalDiscounts || 0) + totalDiscount,
          updatedAt: now,
        });
      }

      // 12. Register Idempotency Lock
      transaction.set(idempRef, {
        tenantId,
        idempotencyKey,
        saleId,
        invoiceNumber,
        total: finalGrandTotal,
        saleSnapshot: saleRecord,
        createdAt: now,
      });

      return {
        isIdempotentReplay: false,
        sale: saleRecord,
      };
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('alwan_sales_synced'));
      window.dispatchEvent(new CustomEvent('alwan_shifts_synced'));
      window.dispatchEvent(new CustomEvent('alwan_inventory_synced'));
    }

    return {
      success: true,
      isIdempotentReplay: transactionResult.isIdempotentReplay,
      sale: transactionResult.sale,
    };
  } catch (err: any) {
    console.error('Sale checkout transaction failed:', err);
    return {
      success: false,
      isIdempotentReplay: false,
      error: err.message || 'فشلت عملية إتمام البيع',
    };
  }
}

/**
 * Fetches sales records with cursor pagination and filtering
 */
export interface FetchSalesOptions {
  branchId?: string;
  cashierId?: string;
  customerId?: string;
  saleType?: SaleType;
  startDate?: string;
  endDate?: string;
  invoiceNumber?: string;
  pageSize?: number;
  lastVisible?: DocumentSnapshot;
}

export async function fetchSalesFromDb(
  tenantId: string,
  options: FetchSalesOptions = {}
): Promise<{ sales: Sale[]; hasMore: boolean; lastVisible?: DocumentSnapshot }> {
  if (!tenantId) return { sales: [], hasMore: false };

  const {
    branchId,
    cashierId,
    customerId,
    saleType,
    startDate,
    endDate,
    invoiceNumber,
    pageSize = 20,
    lastVisible,
  } = options;

  try {
    const constraints: any[] = [where('tenantId', '==', tenantId)];

    if (branchId) constraints.push(where('branchId', '==', branchId));
    if (cashierId) constraints.push(where('cashierId', '==', cashierId));
    if (customerId) constraints.push(where('customerId', '==', customerId));
    if (saleType) constraints.push(where('saleType', '==', saleType));
    if (invoiceNumber) constraints.push(where('invoiceNumber', '==', invoiceNumber.trim().toUpperCase()));

    if (startDate) constraints.push(where('createdAt', '>=', startDate));
    if (endDate) constraints.push(where('createdAt', '<=', endDate));

    constraints.push(orderBy('createdAt', 'desc'));
    constraints.push(limit(pageSize + 1));

    if (lastVisible) {
      constraints.push(startAfter(lastVisible));
    }

    const q = query(collection(db, 'sales'), ...constraints);
    const snap = await getDocs(q);

    let docs = snap.docs;
    const hasMore = docs.length > pageSize;
    if (hasMore) {
      docs = docs.slice(0, pageSize);
    }

    const sales = docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as Sale));

    return {
      sales,
      hasMore,
      lastVisible: docs.length > 0 ? docs[docs.length - 1] : undefined,
    };
  } catch (indexError) {
    console.warn('fetchSalesFromDb indexed query failed, using safe in-memory fallback:', indexError);
    // Fallback: simple query by tenantId to avoid composite index crashes
    const fallbackQ = query(collection(db, 'sales'), where('tenantId', '==', tenantId), limit(100));
    const snap = await getDocs(fallbackQ);
    let sales = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    } as Sale));

    if (branchId) {
      sales = sales.filter((s) => s.branchId === branchId);
    }
    if (cashierId) {
      sales = sales.filter((s) => s.cashierId === cashierId);
    }
    if (customerId) {
      sales = sales.filter((s) => s.customerId === customerId);
    }
    if (saleType) {
      sales = sales.filter((s) => s.saleType === saleType);
    }
    if (invoiceNumber) {
      sales = sales.filter((s) => s.invoiceNumber?.toUpperCase() === invoiceNumber.trim().toUpperCase());
    }
    if (startDate) {
      sales = sales.filter((s) => (s.createdAt || '') >= startDate);
    }
    if (endDate) {
      sales = sales.filter((s) => (s.createdAt || '') <= endDate);
    }

    sales.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    const hasMore = sales.length > pageSize;
    if (hasMore) {
      sales = sales.slice(0, pageSize);
    }

    return {
      sales,
      hasMore,
      lastVisible: undefined,
    };
  }
}

/**
 * Fetches single sale by ID with full item snapshots
 */
export async function getSaleById(tenantId: string, saleId: string): Promise<Sale | null> {
  const ref = doc(db, 'sales', saleId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as Sale;
  if (data.tenantId !== tenantId) return null;
  return { id: snap.id, ...data };
}
