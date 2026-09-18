/**
 * Executive Financial Business Intelligence (BI) Service
 * Sourced 100% from General Ledger posted journal lines (Mandatory Audit 4),
 * ensuring total separation of official financial reports from operational telemetry.
 * Computes Liquidity Ratios, Profitability Ratios, DSO, DPO, and the Cash Conversion Cycle (CCC).
 */

import { generateBalanceSheet, generateProfitAndLoss, generateTrialBalance } from '../accounting/financialStatements.service';
import { DateRange } from './reportingTimezone';

export interface FinancialBIMetrics {
  // Balance Sheet derived
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  currentAssets: number;
  currentLiabilities: number;
  cashAndEquivalents: number;
  accountsReceivable: number;
  accountsPayable: number;
  inventoryGLValue: number;

  // Income Statement derived
  netRevenue: number;
  cogsGL: number;
  grossProfitGL: number;
  operatingExpensesGL: number;
  netIncomeGL: number;

  // Key Ratios
  grossMarginPct: number;
  netMarginPct: number;
  currentRatio: number; // Current Assets / Current Liabilities
  quickRatio: number;   // (Cash + AR) / Current Liabilities
  debtToEquityRatio: number; // Total Liabilities / Total Equity
  returnOnAssetsPct: number; // (Net Income / Total Assets) * 100
  returnOnEquityPct: number; // (Net Income / Total Equity) * 100

  // Working Capital & Cash Conversion Cycle
  workingCapital: number;
  dsoDays: number; // Days Sales Outstanding
  dpoDays: number; // Days Payable Outstanding
  dioDaysEstimate: number; // Days Inventory Outstanding from GL
  cashConversionCycleDays: number; // DIO + DSO - DPO
}

/**
 * Generate full GL-sourced Executive Financial BI Metrics
 */
export async function generateFinancialBIMetrics(
  tenantId: string,
  dateRange: DateRange,
  externalDioDays?: number
): Promise<FinancialBIMetrics> {
  // 1. Generate standard financial statements from posted GL lines
  const [bs, pnl, tb] = await Promise.all([
    generateBalanceSheet(tenantId, dateRange.endDate),
    generateProfitAndLoss(tenantId, dateRange.startDate, dateRange.endDate),
    generateTrialBalance(tenantId, dateRange.startDate, dateRange.endDate),
  ]);

  // Extract Balance Sheet Balances
  const totalAssets = bs.totalAssets || 0;
  const totalLiabilities = bs.totalLiabilities || 0;
  const totalEquity = bs.totalEquity || 0;

  // Group accounts from Trial Balance for fine-grained liquidity ratios
  let cashAndEquivalents = 0;
  let accountsReceivable = 0;
  let accountsPayable = 0;
  let inventoryGLValue = 0;
  let currentAssets = 0;
  let currentLiabilities = 0;

  for (const row of tb.rows) {
    const code = row.accountCode;
    const balance = row.endingDebit - row.endingCredit; // normal debit balance for assets

    // 1000s: Assets
    if (code.startsWith('10')) {
      // Cash & Bank (1010, 1020)
      cashAndEquivalents += balance;
      currentAssets += balance;
    } else if (code.startsWith('11') || code.startsWith('12')) {
      // Accounts Receivable (1200)
      accountsReceivable += balance;
      currentAssets += balance;
    } else if (code.startsWith('13')) {
      // Inventory (1300)
      inventoryGLValue += balance;
      currentAssets += balance;
    } else if (code.startsWith('1')) {
      // Other assets
      if (!code.startsWith('15') && !code.startsWith('16')) {
        currentAssets += balance;
      }
    }

    // 2000s: Liabilities (normal credit balance)
    if (code.startsWith('2')) {
      const liabilityBal = row.endingCredit - row.endingDebit;
      if (code.startsWith('21')) {
        accountsPayable += liabilityBal;
      }
      // Current liabilities
      if (!code.startsWith('25') && !code.startsWith('26')) {
        currentLiabilities += liabilityBal;
      }
    }
  }

  // P&L figures
  const netRevenue = pnl.totalRevenue || 0;
  const cogsGL = pnl.cogs || 0;
  const grossProfitGL = pnl.grossProfit || 0;
  const operatingExpensesGL = pnl.totalExpenses || 0;
  const netIncomeGL = pnl.netIncome || 0;

  // Ratios
  const grossMarginPct = netRevenue > 0 ? Number(((grossProfitGL / netRevenue) * 100).toFixed(2)) : 0;
  const netMarginPct = netRevenue > 0 ? Number(((netIncomeGL / netRevenue) * 100).toFixed(2)) : 0;

  const currentRatio = currentLiabilities > 0 ? Number((currentAssets / currentLiabilities).toFixed(2)) : currentAssets > 0 ? 99 : 0;
  const quickRatio = currentLiabilities > 0 ? Number(((cashAndEquivalents + accountsReceivable) / currentLiabilities).toFixed(2)) : 0;
  const debtToEquityRatio = totalEquity > 0 ? Number((totalLiabilities / totalEquity).toFixed(2)) : 0;

  const returnOnAssetsPct = totalAssets > 0 ? Number(((netIncomeGL / totalAssets) * 100).toFixed(2)) : 0;
  const returnOnEquityPct = totalEquity > 0 ? Number(((netIncomeGL / totalEquity) * 100).toFixed(2)) : 0;

  const workingCapital = Number((currentAssets - currentLiabilities).toFixed(2));

  // Period Days calculation
  const startMs = new Date(dateRange.startIso).getTime();
  const endMs = new Date(dateRange.endIso).getTime();
  const periodDays = Math.max(1, Math.round((endMs - startMs) / (1000 * 60 * 60 * 24)));

  // Working Capital Cycle
  // DSO = (AR / Net Revenue) * periodDays
  const dsoDays = netRevenue > 0 ? Math.round((accountsReceivable / netRevenue) * periodDays) : 0;
  // DPO = (AP / COGS) * periodDays
  const dpoDays = cogsGL > 0 ? Math.round((accountsPayable / cogsGL) * periodDays) : 0;
  // DIO from GL inventory or passed from inventory service
  const dioDaysEstimate =
    externalDioDays !== undefined
      ? externalDioDays
      : cogsGL > 0
      ? Math.round((inventoryGLValue / cogsGL) * periodDays)
      : 0;

  const cashConversionCycleDays = dioDaysEstimate + dsoDays - dpoDays;

  return {
    totalAssets: Number(totalAssets.toFixed(2)),
    totalLiabilities: Number(totalLiabilities.toFixed(2)),
    totalEquity: Number(totalEquity.toFixed(2)),
    currentAssets: Number(currentAssets.toFixed(2)),
    currentLiabilities: Number(currentLiabilities.toFixed(2)),
    cashAndEquivalents: Number(cashAndEquivalents.toFixed(2)),
    accountsReceivable: Number(accountsReceivable.toFixed(2)),
    accountsPayable: Number(accountsPayable.toFixed(2)),
    inventoryGLValue: Number(inventoryGLValue.toFixed(2)),
    netRevenue: Number(netRevenue.toFixed(2)),
    cogsGL: Number(cogsGL.toFixed(2)),
    grossProfitGL: Number(grossProfitGL.toFixed(2)),
    operatingExpensesGL: Number(operatingExpensesGL.toFixed(2)),
    netIncomeGL: Number(netIncomeGL.toFixed(2)),
    grossMarginPct,
    netMarginPct,
    currentRatio,
    quickRatio,
    debtToEquityRatio,
    returnOnAssetsPct,
    returnOnEquityPct,
    workingCapital,
    dsoDays,
    dpoDays,
    dioDaysEstimate,
    cashConversionCycleDays,
  };
}
