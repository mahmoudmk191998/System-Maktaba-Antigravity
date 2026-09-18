/**
 * Financial Statements Service (Phase 9)
 * Generates official financial reports based on a double-entry accounting foundation aligned with standard accounting principles:
 * 1. Trial Balance (ميزان المراجعة)
 * 2. Income Statement / Profit & Loss (قائمة الدخل والأرباح والخسائر)
 * 3. Balance Sheet (قائمة المركز المالي / الميزانية العمومية)
 * 4. Cash Flow Statement (قائمة التدفقات النقدية)
 */

import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
} from 'firebase/firestore';
import type {
  TrialBalanceReportData,
  TrialBalanceRow,
  ProfitLossStatementData,
  BalanceSheetData,
  CashFlowStatementData,
  ChartAccount,
  AccountType,
} from '@/types/retail.types';
import { getChartOfAccounts } from './chartOfAccounts.service';

/**
 * Generates Trial Balance Report (ميزان المراجعة بالمجاميع والأرصدة)
 */
export async function generateTrialBalance(
  tenantId: string,
  startDate?: string,
  endDate?: string
): Promise<TrialBalanceReportData> {
  const accounts = await getChartOfAccounts(tenantId);
  const accountMap = new Map<string, ChartAccount>();
  for (const acc of accounts) {
    accountMap.set(acc.id, acc);
  }

  // Fetch all journal lines up to endDate
  const constraints = [where('tenantId', '==', tenantId)];
  if (endDate) {
    constraints.push(where('postingDate', '<=', endDate));
  }
  const linesSnap = await getDocs(query(collection(db, 'journal_lines'), ...constraints));

  interface Accumulator {
    openingDr: number;
    openingCr: number;
    periodDr: number;
    periodCr: number;
  }

  const accMap = new Map<string, Accumulator>();

  linesSnap.forEach((docSnap) => {
    const data = docSnap.data();
    const accId = data.accountId;
    if (!accMap.has(accId)) {
      accMap.set(accId, { openingDr: 0, openingCr: 0, periodDr: 0, periodCr: 0 });
    }
    const acc = accMap.get(accId)!;
    const dr = Number(data.debit || 0);
    const cr = Number(data.credit || 0);
    const postingDate = data.postingDate;

    if (startDate && postingDate < startDate) {
      acc.openingDr += dr;
      acc.openingCr += cr;
    } else {
      acc.periodDr += dr;
      acc.periodCr += cr;
    }
  });

  const rows: TrialBalanceRow[] = [];
  let totalOpeningDebit = 0;
  let totalOpeningCredit = 0;
  let totalPeriodDebit = 0;
  let totalPeriodCredit = 0;
  let totalClosingDebit = 0;
  let totalClosingCredit = 0;

  for (const acc of accounts) {
    const accum = accMap.get(acc.id) || { openingDr: 0, openingCr: 0, periodDr: 0, periodCr: 0 };
    const openingDr = Math.round(accum.openingDr * 100) / 100;
    const openingCr = Math.round(accum.openingCr * 100) / 100;
    const periodDr = Math.round(accum.periodDr * 100) / 100;
    const periodCr = Math.round(accum.periodCr * 100) / 100;

    const cumulativeDr = Math.round((openingDr + periodDr) * 100) / 100;
    const cumulativeCr = Math.round((openingCr + periodCr) * 100) / 100;

    let closingDebit = 0;
    let closingCredit = 0;
    let closingNet = 0;

    if (acc.normalBalance === 'debit') {
      const net = Math.round((cumulativeDr - cumulativeCr) * 100) / 100;
      closingNet = net;
      if (net >= 0) {
        closingDebit = net;
      } else {
        closingCredit = Math.abs(net);
      }
    } else {
      const net = Math.round((cumulativeCr - cumulativeDr) * 100) / 100;
      closingNet = net;
      if (net >= 0) {
        closingCredit = net;
      } else {
        closingDebit = Math.abs(net);
      }
    }

    // Only include accounts that have activity or allow posting
    if (openingDr > 0 || openingCr > 0 || periodDr > 0 || periodCr > 0 || acc.allowPosting) {
      rows.push({
        accountId: acc.id,
        accountCode: acc.accountCode,
        accountName: acc.name,
        accountType: acc.accountType,
        normalBalance: acc.normalBalance,
        level: acc.level,
        openingDebit: openingDr,
        openingCredit: openingCr,
        periodDebit: periodDr,
        periodCredit: periodCr,
        closingDebit,
        closingCredit,
        closingNet,
      });

      // Accumulate totals for posting leaf accounts
      if (acc.allowPosting) {
        totalOpeningDebit += openingDr;
        totalOpeningCredit += openingCr;
        totalPeriodDebit += periodDr;
        totalPeriodCredit += periodCr;
        totalClosingDebit += closingDebit;
        totalClosingCredit += closingCredit;
      }
    }
  }

  totalOpeningDebit = Math.round(totalOpeningDebit * 100) / 100;
  totalOpeningCredit = Math.round(totalOpeningCredit * 100) / 100;
  totalPeriodDebit = Math.round(totalPeriodDebit * 100) / 100;
  totalPeriodCredit = Math.round(totalPeriodCredit * 100) / 100;
  totalClosingDebit = Math.round(totalClosingDebit * 100) / 100;
  totalClosingCredit = Math.round(totalClosingCredit * 100) / 100;

  const isBalanced = Math.abs(totalClosingDebit - totalClosingCredit) < 0.05;

  return {
    rows,
    totalOpeningDebit,
    totalOpeningCredit,
    totalPeriodDebit,
    totalPeriodCredit,
    totalClosingDebit,
    totalClosingCredit,
    isBalanced,
  };
}

/**
 * Generates Profit & Loss Statement (قائمة الدخل)
 */
export async function generateProfitAndLoss(
  tenantId: string,
  startDate: string,
  endDate: string
): Promise<ProfitLossStatementData> {
  const accounts = await getChartOfAccounts(tenantId);
  const accountByCode = new Map<string, ChartAccount>();
  const accountById = new Map<string, ChartAccount>();
  for (const a of accounts) {
    accountByCode.set(a.accountCode, a);
    accountById.set(a.id, a);
  }

  // Query journal lines within the period
  const linesSnap = await getDocs(
    query(
      collection(db, 'journal_lines'),
      where('tenantId', '==', tenantId),
      where('postingDate', '>=', startDate),
      where('postingDate', '<=', endDate)
    )
  );

  let grossSalesRetail = 0;
  let grossSalesWholesale = 0;
  let salesReturnsAndDiscounts = 0;
  let costOfGoodsSold = 0;
  const operatingExpensesByCategory: Record<string, number> = {};
  let totalOperatingExpenses = 0;
  let otherIncomeAndExpenses = 0;

  linesSnap.forEach((docSnap) => {
    const line = docSnap.data();
    const acc = accountById.get(line.accountId);
    if (!acc) return;

    const dr = Number(line.debit || 0);
    const cr = Number(line.credit || 0);

    // Revenue accounts (Normal balance credit: Credit - Debit)
    if (acc.accountType === 'revenue') {
      const netCredit = cr - dr;
      if (acc.accountCode === '4110') {
        grossSalesRetail += netCredit;
      } else if (acc.accountCode === '4120') {
        grossSalesWholesale += netCredit;
      } else if (acc.accountCode.startsWith('42') || acc.systemMappingKey === 'salesReturns') {
        // Contra revenue: Debit - Credit
        salesReturnsAndDiscounts += (dr - cr);
      } else {
        grossSalesRetail += netCredit;
      }
    }

    // Cost of Goods Sold (Normal balance debit: Debit - Credit)
    if (acc.accountType === 'cogs' || acc.accountCode.startsWith('51')) {
      costOfGoodsSold += (dr - cr);
    }

    // Purchase return variance / other cost adjustments
    if (acc.accountCode === '5200' || acc.systemMappingKey === 'purchaseReturnVariance') {
      otherIncomeAndExpenses += (cr - dr); // Credit is gain/favorable
    }

    // Operating Expenses (Normal balance debit: Debit - Credit)
    if (acc.accountType === 'expense' && !acc.accountCode.startsWith('5')) {
      const expenseNet = dr - cr;
      const catName = acc.name;
      operatingExpensesByCategory[catName] = (operatingExpensesByCategory[catName] || 0) + expenseNet;
      totalOperatingExpenses += expenseNet;
    }
  });

  grossSalesRetail = Math.round(grossSalesRetail * 100) / 100;
  grossSalesWholesale = Math.round(grossSalesWholesale * 100) / 100;
  const totalGrossRevenue = Math.round((grossSalesRetail + grossSalesWholesale) * 100) / 100;
  salesReturnsAndDiscounts = Math.round(salesReturnsAndDiscounts * 100) / 100;
  const netRevenue = Math.round((totalGrossRevenue - salesReturnsAndDiscounts) * 100) / 100;
  costOfGoodsSold = Math.round(costOfGoodsSold * 100) / 100;
  const grossProfit = Math.round((netRevenue - costOfGoodsSold) * 100) / 100;
  const grossMarginPercentage = netRevenue > 0 ? Math.round((grossProfit / netRevenue) * 10000) / 100 : 0;
  totalOperatingExpenses = Math.round(totalOperatingExpenses * 100) / 100;
  const operatingProfit = Math.round((grossProfit - totalOperatingExpenses) * 100) / 100;
  otherIncomeAndExpenses = Math.round(otherIncomeAndExpenses * 100) / 100;
  const netIncome = Math.round((operatingProfit + otherIncomeAndExpenses) * 100) / 100;

  // Round categories
  for (const k in operatingExpensesByCategory) {
    operatingExpensesByCategory[k] = Math.round(operatingExpensesByCategory[k] * 100) / 100;
  }

  return {
    grossSalesRetail,
    grossSalesWholesale,
    totalGrossRevenue,
    salesReturnsAndDiscounts,
    netRevenue,
    costOfGoodsSold,
    grossProfit,
    grossMarginPercentage,
    operatingExpensesByCategory,
    totalOperatingExpenses,
    operatingProfit,
    otherIncomeAndExpenses,
    netIncome,
    periodStart: startDate,
    periodEnd: endDate,
  };
}

export const generateProfitLossStatement = generateProfitAndLoss;

/**
 * Generates Balance Sheet Statement (قائمة المركز المالي / الميزانية العمومية)
 * Formula: Total Assets == Total Liabilities + Total Equity
 */
export async function generateBalanceSheet(
  tenantId: string,
  asOfDate: string = new Date().toISOString().split('T')[0]
): Promise<BalanceSheetData> {
  const accounts = await getChartOfAccounts(tenantId);
  const accountById = new Map<string, ChartAccount>();
  for (const a of accounts) {
    accountById.set(a.id, a);
  }

  // Fetch all journal lines up to asOfDate
  const linesSnap = await getDocs(
    query(
      collection(db, 'journal_lines'),
      where('tenantId', '==', tenantId),
      where('postingDate', '<=', asOfDate)
    )
  );

  // Compute net balance for each account
  const balances = new Map<string, number>();

  linesSnap.forEach((docSnap) => {
    const line = docSnap.data();
    const acc = accountById.get(line.accountId);
    if (!acc) return;

    const dr = Number(line.debit || 0);
    const cr = Number(line.credit || 0);
    const delta = acc.normalBalance === 'debit' ? (dr - cr) : (cr - dr);
    balances.set(acc.accountCode, (balances.get(acc.accountCode) || 0) + delta);
  });

  const getBal = (code: string) => Math.round((balances.get(code) || 0) * 100) / 100;

  // Current Assets
  const cashAndEquivalents = Math.round((getBal('1111') + getBal('1112')) * 100) / 100;
  const bankAccounts = getBal('1120');
  const accountsReceivable = getBal('1130');
  const inventoryValuation = getBal('1140');
  const otherCurrentAssets = getBal('1150');
  const totalCurrentAssets = Math.round(
    (cashAndEquivalents + bankAccounts + accountsReceivable + inventoryValuation + otherCurrentAssets) * 100
  ) / 100;

  // Non-Current Assets
  const fixedAssets = getBal('1200');
  const totalNonCurrentAssets = fixedAssets;
  const totalAssets = Math.round((totalCurrentAssets + totalNonCurrentAssets) * 100) / 100;

  // Current Liabilities
  const accountsPayable = getBal('2110');
  const customerAdvances = getBal('2120');
  const payrollLiabilities = getBal('2130');
  const taxPayable = getBal('2140');
  const otherCurrentLiabilities = getBal('2150');
  const totalCurrentLiabilities = Math.round(
    (accountsPayable + customerAdvances + payrollLiabilities + taxPayable + otherCurrentLiabilities) * 100
  ) / 100;
  const totalLiabilities = totalCurrentLiabilities;

  // Net income up to asOfDate from all revenue, cogs, expense lines
  let cumulativeRevenue = 0;
  let cumulativeCogs = 0;
  let cumulativeExpenses = 0;

  linesSnap.forEach((docSnap) => {
    const line = docSnap.data();
    const acc = accountById.get(line.accountId);
    if (!acc) return;
    const dr = Number(line.debit || 0);
    const cr = Number(line.credit || 0);

    if (acc.accountType === 'revenue') cumulativeRevenue += (cr - dr);
    if (acc.accountType === 'cogs') cumulativeCogs += (dr - cr);
    if (acc.accountType === 'expense') cumulativeExpenses += (dr - cr);
  });

  const currentPeriodNetIncome = Math.round((cumulativeRevenue - cumulativeCogs - cumulativeExpenses) * 100) / 100;
  const ownerCapital = getBal('3100');
  const retainedEarnings = getBal('3200');
  const totalEquity = Math.round((ownerCapital + retainedEarnings + currentPeriodNetIncome) * 100) / 100;

  const totalLiabilitiesAndEquity = Math.round((totalLiabilities + totalEquity) * 100) / 100;
  const variance = Math.round((totalAssets - totalLiabilitiesAndEquity) * 100) / 100;
  const isBalanced = Math.abs(variance) < 0.05;

  return {
    currentAssets: {
      cashAndEquivalents,
      bankAccounts,
      accountsReceivable,
      inventoryValuation,
      otherCurrentAssets,
      totalCurrentAssets,
    },
    nonCurrentAssets: {
      fixedAssets,
      totalNonCurrentAssets,
    },
    totalAssets,
    currentLiabilities: {
      accountsPayable,
      customerAdvances,
      payrollLiabilities,
      taxPayable,
      otherCurrentLiabilities,
      totalCurrentLiabilities,
    },
    totalLiabilities,
    equity: {
      ownerCapital,
      retainedEarnings,
      currentPeriodNetIncome,
      totalEquity,
    },
    totalLiabilitiesAndEquity,
    variance,
    isBalanced,
    asOfDate,
  };
}

/**
 * Generates Direct Cash Flow Statement (قائمة التدفقات النقدية)
 */
export async function generateCashFlow(
  tenantId: string,
  startDate: string,
  endDate: string
): Promise<CashFlowStatementData> {
  const accounts = await getChartOfAccounts(tenantId);
  const cashAccountIds = new Set(
    accounts
      .filter(
        (a) =>
          a.systemMappingKey === 'defaultCash' ||
          a.systemMappingKey === 'posCashRegister' ||
          a.systemMappingKey === 'bankClearing' ||
          ['1111', '1112', '1120'].includes(a.accountCode)
      )
      .map((a) => a.id)
  );

  const linesSnap = await getDocs(
    query(
      collection(db, 'journal_lines'),
      where('tenantId', '==', tenantId),
      where('postingDate', '<=', endDate)
    )
  );

  let openingCash = 0;
  let customerCollections = 0;
  let supplierPayments = 0;
  let payrollPaid = 0;
  let operatingExpensesPaid = 0;
  let ownerContributions = 0;
  let cashTransfersNet = 0;

  linesSnap.forEach((docSnap) => {
    const line = docSnap.data();
    if (!cashAccountIds.has(line.accountId)) return;

    const dr = Number(line.debit || 0);
    const cr = Number(line.credit || 0);
    const netCash = dr - cr;
    const postingDate = line.postingDate;

    if (postingDate < startDate) {
      openingCash += netCash;
    } else {
      const src = line.sourceType;
      if (src === 'customer_payment' || (src === 'sale' && dr > 0)) {
        customerCollections += dr;
      } else if (src === 'supplier_payment' || (src === 'purchase_invoice' && cr > 0)) {
        supplierPayments += cr;
      } else if (src === 'payroll') {
        payrollPaid += cr;
      } else if (src === 'expense') {
        operatingExpensesPaid += cr;
      } else if (src === 'opening_balance' && dr > 0) {
        ownerContributions += dr;
      } else {
        cashTransfersNet += netCash;
      }
    }
  });

  customerCollections = Math.round(customerCollections * 100) / 100;
  supplierPayments = Math.round(supplierPayments * 100) / 100;
  payrollPaid = Math.round(payrollPaid * 100) / 100;
  operatingExpensesPaid = Math.round(operatingExpensesPaid * 100) / 100;
  const netOperatingCashFlow = Math.round(
    (customerCollections - supplierPayments - payrollPaid - operatingExpensesPaid) * 100
  ) / 100;

  ownerContributions = Math.round(ownerContributions * 100) / 100;
  cashTransfersNet = Math.round(cashTransfersNet * 100) / 100;
  const netFinancingCashFlow = Math.round((ownerContributions + cashTransfersNet) * 100) / 100;

  const netChangeInCash = Math.round((netOperatingCashFlow + netFinancingCashFlow) * 100) / 100;
  const openingCashBalance = Math.round(openingCash * 100) / 100;
  const closingCashBalance = Math.round((openingCashBalance + netChangeInCash) * 100) / 100;

  return {
    operatingActivities: {
      customerCollections,
      supplierPayments,
      payrollPaid,
      operatingExpensesPaid,
      netOperatingCashFlow,
    },
    financingAndTransfers: {
      ownerContributions,
      cashTransfersNet,
      netFinancingCashFlow,
    },
    netChangeInCash,
    openingCashBalance,
    closingCashBalance,
    periodStart: startDate,
    periodEnd: endDate,
  };
}
