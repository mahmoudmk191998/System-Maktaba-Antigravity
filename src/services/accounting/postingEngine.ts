/**
 * Automatic Accounting Posting Engine (Phase 9)
 * Centralizes translation of all retail business events into double-entry balanced journal entries.
 * Strictly guarantees idempotency, zero double-posting, and subledger-to-GL parity.
 */

import { db } from '@/lib/firebase';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import type {
  Sale,
  SaleReturn,
  CustomerPayment,
  CustomerPaymentAllocation,
  GoodsReceipt,
  PurchaseReturn,
  SupplierPayment,
  DamageLossRecord,
  JournalEntry,
  ChartAccount,
  AccountingSettings,
} from '@/types/retail.types';
import {
  createAndPostJournalEntry,
  type CreateJournalLineInput,
} from './journal.service';
import { getChartOfAccounts } from './chartOfAccounts.service';

/**
 * Loads or initializes accounting settings for a tenant.
 */
export async function getAccountingSettings(tenantId: string): Promise<AccountingSettings> {
  const ref = doc(db, 'accounting_settings', tenantId);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    return snap.data() as AccountingSettings;
  }

  // Default settings mapped to standard chart
  const defaultSettings: AccountingSettings = {
    tenantId,
    accountingEnabled: true,
    baseCurrency: 'EGP',
    fiscalYearStartMonth: 1,
    postingMode: 'realtime',
    updatedAt: new Date().toISOString(),
  };

  return defaultSettings;
}

/**
 * Helper to extract account ID from either a ChartAccount object or direct string ID
 */
function getAccountId(acc: any): string {
  if (!acc) return '';
  if (typeof acc === 'string') return acc;
  return acc.id || '';
}

/**
 * Helper to resolve account IDs from chart of accounts by system mapping keys.
 */
async function resolveAccountMapping(tenantId: string): Promise<Record<string, ChartAccount>> {
  const accounts = await getChartOfAccounts(tenantId);
  const map: Record<string, ChartAccount> = {};

  for (const acc of accounts) {
    if (acc.systemMappingKey) {
      map[acc.systemMappingKey] = acc;
    }
    // Also map by code
    map[acc.accountCode] = acc;
  }

  return map;
}

// ============================================================================
// 1. SALES POSTING BUILDER & ENGINE
// ============================================================================

export function buildSaleJournalLines(
  sale: any,
  map: Record<string, any>
): CreateJournalLineInput[] {
  const cashAccId = getAccountId(map.cash || map.defaultCash || map['1111'] || map.posCashRegister || map['1112']);
  const bankAccId = getAccountId(map.bank || map.bankClearing || map['1120']);
  const arAccId = getAccountId(map.ar || map.accountsReceivable || map['1130']);
  const advanceLiabilityAccId = getAccountId(map.advances || map.customerAdvancesLiability || map['2120']);
  const retailRevAccId = getAccountId(map.salesRetail || map.retailSalesRevenue || map['4100'] || map['4110']);
  const wholesaleRevAccId = getAccountId(map.salesWholesale || map.wholesaleSalesRevenue || map['4200'] || map['4120']);
  const taxPayableAccId = getAccountId(map.taxPayable || map['2130'] || map['2140']);
  const cogsAccId = getAccountId(map.cogs || map['5100']);
  const invAccId = getAccountId(map.inventory || map['1140']);

  const lines: CreateJournalLineInput[] = [];

  let cashAmt = 0;
  let bankAmt = 0;
  let advanceAmt = 0;
  let creditAmt = 0;

  const payments = sale.payments || sale.paymentMethods || [];
  for (const p of payments) {
    const amt = Number(p.amount || 0);
    if (p.method === 'cash') {
      cashAmt += amt;
    } else if (['visa', 'mastercard', 'card', 'bank_transfer', 'instapay', 'vodafone_cash'].includes(p.method)) {
      bankAmt += amt;
    } else if (p.method === 'customer_credit' || p.method === 'customer_balance') {
      advanceAmt += amt;
    } else if (p.method === 'credit') {
      creditAmt += amt;
    } else {
      cashAmt += amt;
    }
  }

  const change = Number(sale.changeAmount ?? sale.change ?? 0);
  if (change > 0 && cashAmt >= change) {
    cashAmt = Math.round((cashAmt - change) * 100) / 100;
  }

  const grandTotal = Number(sale.total ?? sale.grandTotal ?? 0);
  const paidTotal = cashAmt + bankAmt + advanceAmt + creditAmt;
  if (paidTotal < grandTotal && sale.customerId && !creditAmt) {
    creditAmt = Math.round((grandTotal - paidTotal) * 100) / 100;
  }

  if (cashAmt > 0 && cashAccId) {
    lines.push({
      accountId: cashAccId,
      debit: cashAmt,
      credit: 0,
      description: `مقبوضات نقدية لفاتورة مبيعات ${sale.invoiceNumber}`,
      branchId: sale.branchId,
      customerId: sale.customerId,
    });
  }

  if (bankAmt > 0 && bankAccId) {
    lines.push({
      accountId: bankAccId,
      debit: bankAmt,
      credit: 0,
      description: `مدفوعات إلكترونية / بنك لفاتورة مبيعات ${sale.invoiceNumber}`,
      branchId: sale.branchId,
      customerId: sale.customerId,
    });
  }

  if (advanceAmt > 0 && advanceLiabilityAccId) {
    lines.push({
      accountId: advanceLiabilityAccId,
      debit: advanceAmt,
      credit: 0,
      description: `سداد من الرصيد الدائن / مقدم العميل لفاتورة ${sale.invoiceNumber}`,
      branchId: sale.branchId,
      customerId: sale.customerId,
    });
  }

  if (creditAmt > 0 && arAccId) {
    lines.push({
      accountId: arAccId,
      debit: creditAmt,
      credit: 0,
      description: `مبيعات آجلة على حساب العميل لفاتورة ${sale.invoiceNumber}`,
      branchId: sale.branchId,
      customerId: sale.customerId,
    });
  }

  // Fallback: If no payments listed, treat as cash sale
  if (lines.length === 0 && grandTotal > 0 && cashAccId) {
    lines.push({
      accountId: cashAccId,
      debit: grandTotal,
      credit: 0,
      description: `مبيعات نقدية لفاتورة ${sale.invoiceNumber}`,
      branchId: sale.branchId,
      customerId: sale.customerId,
    });
  }

  // Revenue side
  const isWholesale = sale.saleType === 'wholesale' || sale.pricingTierUsed === 'wholesale';
  const revenueAccId = (isWholesale && wholesaleRevAccId) ? wholesaleRevAccId : retailRevAccId;
  const netTax = Number(sale.taxAmount || 0);
  const netRevenue = Math.round((grandTotal - netTax) * 100) / 100;

  lines.push({
    accountId: revenueAccId,
    debit: 0,
    credit: netRevenue,
    description: `إيراد مبيعات فاتورة رقم ${sale.invoiceNumber}`,
    branchId: sale.branchId,
    customerId: sale.customerId,
  });

  if (netTax > 0 && taxPayableAccId) {
    lines.push({
      accountId: taxPayableAccId,
      debit: 0,
      credit: netTax,
      description: `ضريبة القيمة المضافة المستحقة لفاتورة ${sale.invoiceNumber}`,
      branchId: sale.branchId,
      customerId: sale.customerId,
    });
  }

  // COGS side (Dr COGS, Cr Inventory)
  const totalCost = Number(sale.totalCost ?? sale.costSnapshotTotal ?? 0);
  if (totalCost > 0 && cogsAccId && invAccId) {
    lines.push({
      accountId: cogsAccId,
      debit: totalCost,
      credit: 0,
      description: `تكلفة البضاعة المباعة لفاتورة ${sale.invoiceNumber}`,
      branchId: sale.branchId,
    });

    lines.push({
      accountId: invAccId,
      debit: 0,
      credit: totalCost,
      description: `صرف مخزون مباع لفاتورة ${sale.invoiceNumber}`,
      branchId: sale.branchId,
    });
  }

  return lines;
}

export async function postSaleJournalEntry(
  sale: Sale,
  tenantId: string,
  options?: { createdBy?: string }
): Promise<JournalEntry | null> {
  const settings = await getAccountingSettings(tenantId);
  if (!settings.accountingEnabled) return null;

  const map = await resolveAccountMapping(tenantId);
  const lines = buildSaleJournalLines(sale, map);

  return await createAndPostJournalEntry({
    tenantId,
    date: sale.createdAt,
    postingDate: sale.createdAt,
    sourceType: 'sale',
    sourceId: sale.id,
    description: `إثبات مبيعات وتكلفة الفاتورة رقم ${sale.invoiceNumber}`,
    branchId: sale.branchId,
    createdBy: options?.createdBy || (sale as any).cashierId || 'system',
    lines,
    idempotencyKey: `sale_${tenantId}_${sale.id}`,
  });
}

// ============================================================================
// 2. SALE RETURNS POSTING BUILDER & ENGINE
// ============================================================================

export function buildSaleReturnJournalLines(
  saleReturn: any,
  map: Record<string, any>
): CreateJournalLineInput[] {
  const salesReturnsAccId = getAccountId(map.salesReturns || map['4900'] || map['4200'] || map.retailSalesRevenue || map['4100']);
  const cashAccId = getAccountId(map.cash || map.defaultCash || map['1111']);
  const bankAccId = getAccountId(map.bank || map.bankClearing || map['1120']);
  const arAccId = getAccountId(map.ar || map.accountsReceivable || map['1130']);
  const advanceLiabilityAccId = getAccountId(map.advances || map.customerAdvancesLiability || map['2120']);
  const invAccId = getAccountId(map.inventory || map['1140']);
  const cogsAccId = getAccountId(map.cogs || map['5100']);
  const damageExpenseAccId = getAccountId(map.damageExpense || map.inventoryDamageExpense || map['6700'] || cogsAccId);

  const lines: CreateJournalLineInput[] = [];
  const returnAmount = Number(saleReturn.totalRefundAmount ?? saleReturn.returnTotal ?? 0);

  lines.push({
    accountId: salesReturnsAccId,
    debit: returnAmount,
    credit: 0,
    description: `مردودات مبيعات إشعار إرجاع رقم ${saleReturn.returnNumber}`,
    branchId: saleReturn.branchId,
    customerId: saleReturn.customerId,
  });

  const refunds = saleReturn.refunds || [];
  let refundGiven = 0;
  for (const ref of refunds) {
    const amt = Number(ref.amount || 0);
    const payAccId = (ref.method === 'visa' || ref.method === 'card') && bankAccId ? bankAccId : cashAccId;
    lines.push({
      accountId: payAccId,
      debit: 0,
      credit: amt,
      description: `صرف رد مرتجع نقدي ${saleReturn.returnNumber}`,
      branchId: saleReturn.branchId,
      customerId: saleReturn.customerId,
    });
    refundGiven += amt;
  }

  const debtReduction = Number((saleReturn as any).debtReductionAmount || 0);
  if (debtReduction > 0 && arAccId) {
    lines.push({
      accountId: arAccId,
      debit: 0,
      credit: debtReduction,
      description: `تخفيض مديونية العميل لمرتجع فاتورة ${saleReturn.invoiceNumberSnapshot || saleReturn.originalInvoiceNumber}`,
      branchId: saleReturn.branchId,
      customerId: saleReturn.customerId,
    });
  }

  const advanceCreditGranted = Number((saleReturn as any).advanceCreditGranted || 0);
  if (advanceCreditGranted > 0 && advanceLiabilityAccId) {
    lines.push({
      accountId: advanceLiabilityAccId,
      debit: 0,
      credit: advanceCreditGranted,
      description: `إثبات رصيد دائن / إشعار دائن للعميل لمرتجع ${saleReturn.returnNumber}`,
      branchId: saleReturn.branchId,
      customerId: saleReturn.customerId,
    });
  }

  // Fallback if no payment refunds listed
  if (lines.filter((l) => l.credit > 0).length === 0 && returnAmount > 0 && cashAccId) {
    lines.push({
      accountId: cashAccId,
      debit: 0,
      credit: returnAmount,
      description: `صرف رد مرتجع ${saleReturn.returnNumber}`,
      branchId: saleReturn.branchId,
      customerId: saleReturn.customerId,
    });
  }

  // Inventory & COGS Reversal side
  const costTotal = Number(saleReturn.totalCostSnapshot ?? saleReturn.costSnapshotTotal ?? 0);
  if (costTotal > 0 && cogsAccId) {
    const hasDamaged = saleReturn.items?.some((i: any) => i.condition === 'damaged' || i.inventoryAction === 'waste');

    if (!hasDamaged && invAccId) {
      lines.push({
        accountId: invAccId,
        debit: costTotal,
        credit: 0,
        description: `إعادة البضاعة المرتجعة الصالحة للمخزون ${saleReturn.returnNumber}`,
        branchId: saleReturn.branchId,
      });
      lines.push({
        accountId: cogsAccId,
        debit: 0,
        credit: costTotal,
        description: `عكس تكلفة بضاعة مباعة لمرتجع ${saleReturn.returnNumber}`,
        branchId: saleReturn.branchId,
      });
    } else if (damageExpenseAccId) {
      lines.push({
        accountId: damageExpenseAccId,
        debit: costTotal,
        credit: 0,
        description: `إثبات تلف بضاعة مرتجعة غير صالحة للبيع ${saleReturn.returnNumber}`,
        branchId: saleReturn.branchId,
      });
      lines.push({
        accountId: cogsAccId,
        debit: 0,
        credit: costTotal,
        description: `تسوية تكلفة مرتجع تالف ${saleReturn.returnNumber}`,
        branchId: saleReturn.branchId,
      });
    }
  }

  return lines;
}

export async function postSaleReturnJournalEntry(
  saleReturn: SaleReturn,
  tenantId: string,
  options?: { createdBy?: string }
): Promise<JournalEntry | null> {
  const settings = await getAccountingSettings(tenantId);
  if (!settings.accountingEnabled) return null;

  const map = await resolveAccountMapping(tenantId);
  const lines = buildSaleReturnJournalLines(saleReturn, map);

  return await createAndPostJournalEntry({
    tenantId,
    date: saleReturn.createdAt,
    postingDate: saleReturn.createdAt,
    sourceType: 'sale_return',
    sourceId: saleReturn.id,
    description: `إثبات مرتجع مبيعات إشعار رقم ${saleReturn.returnNumber}`,
    branchId: saleReturn.branchId,
    createdBy: options?.createdBy || 'system',
    lines,
    idempotencyKey: `sale_return_${tenantId}_${saleReturn.id}`,
  });
}

// ============================================================================
// 3. CUSTOMER PAYMENT POSTING BUILDER & ENGINE
// ============================================================================

export function buildCustomerPaymentJournalLines(
  payment: any,
  allocations: any[],
  map: Record<string, any>
): CreateJournalLineInput[] {
  const cashAccId = getAccountId(map.cash || map.defaultCash || map['1111']);
  const bankAccId = getAccountId(map.bank || map.bankClearing || map['1120']);
  const arAccId = getAccountId(map.ar || map.accountsReceivable || map['1130']);
  const advanceLiabilityAccId = getAccountId(map.advances || map.customerAdvancesLiability || map['2120']);

  const payAccId = (payment.paymentMethod === 'bank_transfer' || payment.paymentMethod === 'card' || payment.paymentMethod === 'cheque') && bankAccId ? bankAccId : cashAccId;
  const totalPayment = Number(payment.amount || 0);
  const lines: CreateJournalLineInput[] = [];

  lines.push({
    accountId: payAccId,
    debit: totalPayment,
    credit: 0,
    description: `قبض دفعة من العميل سند رقم ${payment.paymentNumber || payment.id}`,
    branchId: payment.branchId,
    customerId: payment.customerId,
  });

  const allocatedSum = allocations.reduce((sum, a) => sum + Number(a.allocatedAmount || 0), 0);
  if (allocatedSum > 0 && arAccId) {
    lines.push({
      accountId: arAccId,
      debit: 0,
      credit: allocatedSum,
      description: `سداد مستحقات فواتير العميل سند رقم ${payment.paymentNumber || payment.id}`,
      branchId: payment.branchId,
      customerId: payment.customerId,
    });
  }

  const unallocated = Number(payment.unallocatedCredit ?? (totalPayment - allocatedSum));
  if (unallocated > 0 && advanceLiabilityAccId) {
    lines.push({
      accountId: advanceLiabilityAccId,
      debit: 0,
      credit: unallocated,
      description: `دفعة مقدمة / رصيد دائن للعميل سند رقم ${payment.paymentNumber || payment.id}`,
      branchId: payment.branchId,
      customerId: payment.customerId,
    });
  }

  return lines;
}

export async function postCustomerPaymentJournalEntry(
  payment: CustomerPayment,
  allocations: CustomerPaymentAllocation[],
  tenantId: string,
  options?: { createdBy?: string }
): Promise<JournalEntry | null> {
  const settings = await getAccountingSettings(tenantId);
  if (!settings.accountingEnabled) return null;

  const map = await resolveAccountMapping(tenantId);
  const lines = buildCustomerPaymentJournalLines(payment, allocations, map);

  return await createAndPostJournalEntry({
    tenantId,
    date: payment.createdAt,
    postingDate: payment.createdAt,
    sourceType: 'customer_payment',
    sourceId: payment.id,
    description: `إثبات سند قبض عميل رقم ${payment.paymentNumber}`,
    branchId: payment.branchId,
    createdBy: options?.createdBy || payment.createdBy || 'system',
    lines,
    idempotencyKey: `customer_payment_${tenantId}_${payment.id}`,
  });
}

// ============================================================================
// 4. GOODS RECEIPT (PURCHASING) POSTING BUILDER & ENGINE
// ============================================================================

export function buildGoodsReceiptJournalLines(
  receipt: any,
  map: Record<string, any>
): CreateJournalLineInput[] {
  const invAccId = getAccountId(map.inventory || map['1140']);
  const apAccId = getAccountId(map.ap || map.accountsPayable || map['2110']);

  const totalValue = Number(receipt.totalAmount ?? receipt.totalCost ?? receipt.subtotal ?? 0);
  if (totalValue <= 0) return [];

  return [
    {
      accountId: invAccId,
      debit: totalValue,
      credit: 0,
      description: `استلام بضاعة ومخزون إذن استلام رقم ${receipt.grnNumber || receipt.receiptNumber || receipt.id}`,
      branchId: receipt.branchId,
      supplierId: receipt.supplierId,
    },
    {
      accountId: apAccId,
      debit: 0,
      credit: totalValue,
      description: `استحقاق المورد عن إذن استلام رقم ${receipt.grnNumber || receipt.receiptNumber || receipt.id}`,
      branchId: receipt.branchId,
      supplierId: receipt.supplierId,
    },
  ];
}

export async function postGoodsReceiptJournalEntry(
  receipt: GoodsReceipt,
  tenantId: string,
  options?: { createdBy?: string }
): Promise<JournalEntry | null> {
  const settings = await getAccountingSettings(tenantId);
  if (!settings.accountingEnabled) return null;

  const map = await resolveAccountMapping(tenantId);
  const lines = buildGoodsReceiptJournalLines(receipt, map);
  if (lines.length === 0) return null;

  return await createAndPostJournalEntry({
    tenantId,
    date: receipt.receivedAt || receipt.createdAt,
    postingDate: receipt.receivedAt || receipt.createdAt,
    sourceType: 'goods_receipt',
    sourceId: receipt.id,
    description: `إثبات استلام بضاعة إذن رقم ${receipt.receiptNumber} من المورد`,
    branchId: receipt.branchId,
    createdBy: options?.createdBy || receipt.receivedBy || 'system',
    lines,
    idempotencyKey: `goods_receipt_${tenantId}_${receipt.id}`,
  });
}

// ============================================================================
// 5. SUPPLIER PAYMENT POSTING BUILDER & ENGINE
// ============================================================================

export function buildSupplierPaymentJournalLines(
  payment: any,
  map: Record<string, any>
): CreateJournalLineInput[] {
  const apAccId = getAccountId(map.ap || map.accountsPayable || map['2110']);
  const cashAccId = getAccountId(map.cash || map.defaultCash || map['1111']);
  const bankAccId = getAccountId(map.bank || map.bankClearing || map['1120']);

  const payAccId = (payment.method === 'bank_transfer' || payment.method === 'card' || payment.method === 'cheque' || payment.paymentMethod === 'bank_transfer') && bankAccId ? bankAccId : cashAccId;
  const totalAmount = Number(payment.amount || 0);
  if (totalAmount <= 0) return [];

  return [
    {
      accountId: apAccId,
      debit: totalAmount,
      credit: 0,
      description: payment.description || `سداد مستحقات المورد سند صرف رقم ${payment.paymentNumber || payment.id}`,
      branchId: payment.branchId,
      supplierId: payment.supplierId,
    },
    {
      accountId: payAccId,
      debit: 0,
      credit: totalAmount,
      description: payment.description || `صرف سداد المورد سند صرف رقم ${payment.paymentNumber || payment.id}`,
      branchId: payment.branchId,
      supplierId: payment.supplierId,
    },
  ];
}

export async function postSupplierPaymentJournalEntry(
  payment: SupplierPayment,
  tenantId: string,
  options?: { createdBy?: string }
): Promise<JournalEntry | null> {
  const settings = await getAccountingSettings(tenantId);
  if (!settings.accountingEnabled) return null;

  const map = await resolveAccountMapping(tenantId);
  const lines = buildSupplierPaymentJournalLines(payment, map);
  if (lines.length === 0) return null;

  return await createAndPostJournalEntry({
    tenantId,
    date: payment.createdAt,
    postingDate: payment.createdAt,
    sourceType: 'supplier_payment',
    sourceId: payment.id,
    description: `إثبات سند صرف سداد مورد رقم ${payment.paymentNumber}`,
    branchId: payment.branchId,
    createdBy: options?.createdBy || payment.createdBy || 'system',
    lines,
    idempotencyKey: `supplier_payment_${tenantId}_${payment.id}`,
  });
}

// ============================================================================
// 6. PURCHASE RETURN POSTING BUILDER & ENGINE (with Cost Variance)
// ============================================================================

export function buildPurchaseReturnJournalLines(
  purchaseReturn: any,
  map: Record<string, any>,
  options?: { inventoryCarryingValue?: number }
): CreateJournalLineInput[] {
  const apAccId = getAccountId(map.ap || map.accountsPayable || map['2110']);
  const invAccId = getAccountId(map.inventory || map['1140']);
  const varianceAccId = getAccountId(map.purchaseVariance || map.purchaseReturnVariance || map['5200'] || map.cogs || map['5100']);

  const supplierCreditValue = Number(purchaseReturn.totalCreditAmount ?? purchaseReturn.totalAmount ?? 0);
  const inventoryRemovedValue = Number(options?.inventoryCarryingValue ?? purchaseReturn.carryingInventoryCost ?? supplierCreditValue);

  if (supplierCreditValue <= 0) return [];

  const lines: CreateJournalLineInput[] = [];

  // Dr Accounts Payable (reduces what we owe supplier)
  lines.push({
    accountId: apAccId,
    debit: supplierCreditValue,
    credit: 0,
    description: `إشعار دائن لمرتجع مشتريات رقم ${purchaseReturn.returnNumber || purchaseReturn.id}`,
    branchId: purchaseReturn.branchId,
    supplierId: purchaseReturn.supplierId,
  });

  // Cr Inventory Control (inventory removed)
  lines.push({
    accountId: invAccId,
    debit: 0,
    credit: inventoryRemovedValue,
    description: `إخراج بضاعة مرتجعة للمورد رقم ${purchaseReturn.returnNumber || purchaseReturn.id}`,
    branchId: purchaseReturn.branchId,
    supplierId: purchaseReturn.supplierId,
  });

  // Cost Variance handling (Audit 4)
  const variance = Math.round((supplierCreditValue - inventoryRemovedValue) * 100) / 100;
  if (Math.abs(variance) > 0.001) {
    if (variance > 0) {
      // Supplier credited more than inventory cost -> Credit variance gain
      lines.push({
        accountId: varianceAccId,
        debit: 0,
        credit: variance,
        description: `فارق تكلفة مرتجع مشتريات (زيادة دائنية المورد) ${purchaseReturn.returnNumber || purchaseReturn.id}`,
        branchId: purchaseReturn.branchId,
      });
    } else {
      // Supplier credited less than inventory cost -> Debit variance loss
      lines.push({
        accountId: varianceAccId,
        debit: Math.abs(variance),
        credit: 0,
        description: `فارق تكلفة مرتجع مشتريات (نقص دائنية المورد) ${purchaseReturn.returnNumber || purchaseReturn.id}`,
        branchId: purchaseReturn.branchId,
      });
    }
  }

  return lines;
}

export async function postPurchaseReturnJournalEntry(
  purchaseReturn: PurchaseReturn,
  tenantId: string,
  options?: { createdBy?: string; inventoryCarryingValue?: number }
): Promise<JournalEntry | null> {
  const settings = await getAccountingSettings(tenantId);
  if (!settings.accountingEnabled) return null;

  const map = await resolveAccountMapping(tenantId);
  const lines = buildPurchaseReturnJournalLines(purchaseReturn, map, options);
  if (lines.length === 0) return null;

  return await createAndPostJournalEntry({
    tenantId,
    date: purchaseReturn.createdAt,
    postingDate: purchaseReturn.createdAt,
    sourceType: 'purchase_return',
    sourceId: purchaseReturn.id,
    description: `إثبات إذن إرجاع بضاعة لمورد رقم ${purchaseReturn.returnNumber}`,
    branchId: purchaseReturn.branchId,
    createdBy: options?.createdBy || purchaseReturn.createdBy || 'system',
    lines,
    idempotencyKey: `purchase_return_${tenantId}_${purchaseReturn.id}`,
  });
}

// ============================================================================
// 7. INVENTORY DAMAGE & ADJUSTMENT POSTING BUILDER & ENGINE
// ============================================================================

export function buildDamageLossJournalLines(
  record: any,
  map: Record<string, any>
): CreateJournalLineInput[] {
  const damageExpenseAccId = getAccountId(map.damageExpense || map.inventoryDamageExpense || map['6700']);
  const invAccId = getAccountId(map.inventory || map['1140']);

  const lossValue = Number(record.totalCost ?? (Number(record.quantity || 0) * Number(record.unitCost || 0)));
  if (lossValue <= 0) return [];

  return [
    {
      accountId: damageExpenseAccId,
      debit: lossValue,
      credit: 0,
      description: `إثبات هالك وتالف ${record.reason || record.reasonCategory || 'توالف'} - ${record.productNameSnapshot || ''}`,
      branchId: record.branchId,
      productId: record.productId,
    },
    {
      accountId: invAccId,
      debit: 0,
      credit: lossValue,
      description: `استبعاد مخزون هالك وتالف ${record.productNameSnapshot || ''}`,
      branchId: record.branchId,
      productId: record.productId,
    },
  ];
}

export async function postDamageLossJournalEntry(
  record: DamageLossRecord,
  tenantId: string,
  options?: { createdBy?: string }
): Promise<JournalEntry | null> {
  const settings = await getAccountingSettings(tenantId);
  if (!settings.accountingEnabled) return null;

  const map = await resolveAccountMapping(tenantId);
  const lines = buildDamageLossJournalLines(record, map);
  if (lines.length === 0) return null;

  return await createAndPostJournalEntry({
    tenantId,
    date: record.createdAt,
    postingDate: record.createdAt,
    sourceType: 'damage_loss',
    sourceId: record.id,
    description: `إثبات هالك وتالف بضاعة سجل رقم ${record.id}`,
    branchId: record.branchId,
    createdBy: options?.createdBy || record.recordedBy || 'system',
    lines,
    idempotencyKey: `damage_loss_${tenantId}_${record.id}`,
  });
}

// ============================================================================
// 8. EXPENSES & PAYROLL POSTING BUILDER & ENGINE
// ============================================================================

export function buildExpenseJournalLines(
  expense: any,
  map: Record<string, any>
): CreateJournalLineInput[] {
  const cashAccId = getAccountId(map.cash || map.defaultCash || map['1111']);
  const bankAccId = getAccountId(map.bank || map.bankClearing || map['1120']);
  const expenseAccId = getAccountId(expense.expenseAccountId || map.rentExpense || map['6200'] || map['6900']);

  const payAccId = (expense.paymentMethod === 'bank_transfer' || expense.paymentMethod === 'card') && bankAccId ? bankAccId : cashAccId;
  const amount = Number(expense.amount || 0);
  if (amount <= 0) return [];

  return [
    {
      accountId: expenseAccId,
      debit: amount,
      credit: 0,
      description: `مصروف: ${expense.description || expense.category || 'مصروف عام'}`,
      branchId: expense.branchId,
    },
    {
      accountId: payAccId,
      debit: 0,
      credit: amount,
      description: `سداد مصروف: ${expense.description || expense.category || 'مصروف عام'}`,
      branchId: expense.branchId,
    },
  ];
}

export async function postExpenseJournalEntry(
  expense: { id: string; amount: number; category: string; description: string; date?: string; paymentMethod?: string; branchId?: string },
  tenantId: string,
  options?: { createdBy?: string }
): Promise<JournalEntry | null> {
  const settings = await getAccountingSettings(tenantId);
  if (!settings.accountingEnabled) return null;

  const map = await resolveAccountMapping(tenantId);
  const lines = buildExpenseJournalLines(expense, map);
  if (lines.length === 0) return null;

  return await createAndPostJournalEntry({
    tenantId,
    date: expense.date || new Date().toISOString(),
    postingDate: expense.date || new Date().toISOString(),
    sourceType: 'expense',
    sourceId: expense.id,
    description: `إثبات مصروف: ${expense.description || expense.category}`,
    branchId: expense.branchId,
    createdBy: options?.createdBy || 'system',
    lines,
    idempotencyKey: `expense_${tenantId}_${expense.id}`,
  });
}

export function buildPayrollJournalLines(
  payroll: any,
  map: Record<string, any>
): CreateJournalLineInput[] {
  const salExpenseAccId = getAccountId(map.salariesExpense || map.salaryExpense || map['6100']);
  const payPayableAccId = getAccountId(map.payrollPayable || map['2130'] || map['2140']);
  const amount = Number(payroll.totalNetSalaries ?? payroll.amount ?? 0);
  if (amount <= 0) return [];

  return [
    {
      accountId: salExpenseAccId,
      debit: amount,
      credit: 0,
      description: payroll.description || `استحقاق رواتب شهر ${payroll.month || ''}`,
      branchId: payroll.branchId,
    },
    {
      accountId: payPayableAccId,
      debit: 0,
      credit: amount,
      description: payroll.description || `استحقاق رواتب شهر ${payroll.month || ''}`,
      branchId: payroll.branchId,
    },
  ];
}

export async function postPayrollJournalEntry(
  payroll: { id: string; month: string; totalSalaries: number; branchId?: string; year?: number },
  tenantId: string,
  options?: { createdBy?: string }
): Promise<JournalEntry | null> {
  const settings = await getAccountingSettings(tenantId);
  if (!settings.accountingEnabled) return null;

  const map = await resolveAccountMapping(tenantId);
  const lines = buildPayrollJournalLines(payroll, map);
  if (lines.length === 0) return null;

  return await createAndPostJournalEntry({
    tenantId,
    date: new Date().toISOString(),
    postingDate: new Date().toISOString(),
    sourceType: 'payroll',
    sourceId: payroll.id,
    description: `إثبات استحقاق رواتب شهر ${payroll.month}`,
    branchId: payroll.branchId,
    createdBy: options?.createdBy || 'system',
    lines,
    idempotencyKey: `payroll_${tenantId}_${payroll.id}`,
  });
}
