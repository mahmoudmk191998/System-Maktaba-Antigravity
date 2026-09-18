import { describe, it, expect } from 'vitest';
import {
  validateBalancedJournalLines,
  getJournalIdempotencyDocId,
} from '../services/accounting/journal.service';
import {
  DEFAULT_RETAIL_CHART_OF_ACCOUNTS,
} from '../services/accounting/chartOfAccounts.service';
import {
  buildSaleJournalLines,
  buildSaleReturnJournalLines,
  buildCustomerPaymentJournalLines,
  buildGoodsReceiptJournalLines,
  buildSupplierPaymentJournalLines,
  buildPurchaseReturnJournalLines,
  buildDamageLossJournalLines,
  buildExpenseJournalLines,
  buildPayrollJournalLines,
} from '../services/accounting/postingEngine';
import { formatSequenceNumber } from '../services/sales/invoiceNumber.service';
import type {
  Sale,
  SaleItem,
  PaymentEntry,
  SaleReturn,
  SaleReturnItem,
  GoodsReceipt,
  PurchaseOrder,
  PurchaseReturn,
  DamageLossRecord,
  ChartAccount,
} from '../types/retail.types';

describe('Phase 9: Advanced Accounting, General Ledger, Financial Statements & Analytics', () => {

  // Mock Account IDs matching standard bookstore chart
  const accountIds = {
    cash: 'acc_1111_cash',
    posCash: 'acc_1112_pos_cash',
    bank: 'acc_1120_bank',
    ar: 'acc_1130_ar',
    inventory: 'acc_1140_inv',
    ap: 'acc_2110_ap',
    advances: 'acc_2120_advances',
    payrollPayable: 'acc_2130_payroll_payable',
    taxPayable: 'acc_2140_tax_payable',
    capital: 'acc_3100_capital',
    retainedEarnings: 'acc_3200_retained',
    salesRetail: 'acc_4110_sales_retail',
    salesWholesale: 'acc_4120_sales_wholesale',
    salesReturns: 'acc_4200_sales_returns',
    cogs: 'acc_5100_cogs',
    purchaseVariance: 'acc_5200_purchase_variance',
    salariesExpense: 'acc_6100_salaries',
    rentExpense: 'acc_6200_rent',
    damageExpense: 'acc_6700_damage',
  };

  describe('1. Double-Entry Invariant & Journal Validation', () => {
    it('accepts perfectly balanced journal lines (Total Debit == Total Credit)', () => {
      const lines = [
        { accountId: accountIds.cash, debit: 150.00, credit: 0 },
        { accountId: accountIds.salesRetail, debit: 0, credit: 150.00 },
      ];
      const result = validateBalancedJournalLines(lines);
      expect(result.isValid).toBe(true);
      expect(result.totalDebit).toBe(150.00);
      expect(result.totalCredit).toBe(150.00);
      expect(result.difference).toBe(0);
    });

    it('accepts multi-line compound balanced entries', () => {
      // Split payment sale: 50 cash, 50 card/bank, 100 sales
      const lines = [
        { accountId: accountIds.cash, debit: 50.00, credit: 0 },
        { accountId: accountIds.bank, debit: 50.00, credit: 0 },
        { accountId: accountIds.salesRetail, debit: 0, credit: 100.00 },
      ];
      const result = validateBalancedJournalLines(lines);
      expect(result.isValid).toBe(true);
      expect(result.totalDebit).toBe(100.00);
      expect(result.totalCredit).toBe(100.00);
    });

    it('rejects entries with fewer than two lines', () => {
      const lines = [{ accountId: accountIds.cash, debit: 100.00, credit: 0 }];
      const result = validateBalancedJournalLines(lines);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('طرفين على الأقل');
    });

    it('rejects negative debit or credit amounts', () => {
      const lines = [
        { accountId: accountIds.cash, debit: -50.00, credit: 0 },
        { accountId: accountIds.salesRetail, debit: 0, credit: -50.00 },
      ];
      const result = validateBalancedJournalLines(lines);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('لا يمكن أن تكون سالبة');
    });

    it('rejects a line having both debit and credit amounts', () => {
      const lines = [
        { accountId: accountIds.cash, debit: 50.00, credit: 20.00 },
        { accountId: accountIds.salesRetail, debit: 0, credit: 30.00 },
      ];
      const result = validateBalancedJournalLines(lines);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('لا يمكن أن يحتوي السطر على مبلغ مدين ومبلغ دائن معاً');
    });

    it('rejects unbalanced entries and reports precise variance', () => {
      const lines = [
        { accountId: accountIds.cash, debit: 120.00, credit: 0 },
        { accountId: accountIds.salesRetail, debit: 0, credit: 100.00 },
      ];
      const result = validateBalancedJournalLines(lines);
      expect(result.isValid).toBe(false);
      expect(result.difference).toBe(20.00);
      expect(result.error).toContain('القيد غير متوازن');
    });

    it('handles decimal cents precision cleanly (e.g. 33.33 + 66.67 = 100.00)', () => {
      const lines = [
        { accountId: accountIds.cash, debit: 33.33, credit: 0 },
        { accountId: accountIds.bank, debit: 66.67, credit: 0 },
        { accountId: accountIds.salesRetail, debit: 0, credit: 100.00 },
      ];
      const result = validateBalancedJournalLines(lines);
      expect(result.isValid).toBe(true);
      expect(result.difference).toBe(0);
    });
  });

  describe('2. Deterministic Idempotency & Journal Numbering', () => {
    it('generates deterministic idempotency key for transactions (Audit 5)', () => {
      const key1 = getJournalIdempotencyDocId('tenant_01', 'sale', 'sale_1001');
      const key2 = getJournalIdempotencyDocId('tenant_01', 'sale', 'sale_1001');
      expect(key1).toBe('tenant_01___sale___sale_1001');
      expect(key1).toBe(key2);
    });

    it('formats sequence numbers with zero-padding (JE-YYYY-XXXXXX)', () => {
      const num1 = `JE-2026-${formatSequenceNumber(1, 6)}`;
      const num42 = `JE-2026-${formatSequenceNumber(42, 6)}`;
      expect(num1).toBe('JE-2026-000001');
      expect(num42).toBe('JE-2026-000042');
    });
  });

  describe('3. Standard Bookstore Chart of Accounts Template', () => {
    it('contains all 6 fundamental retail account categories', () => {
      const types = new Set(DEFAULT_RETAIL_CHART_OF_ACCOUNTS.map((a) => a.accountType));
      expect(types.has('asset')).toBe(true);
      expect(types.has('liability')).toBe(true);
      expect(types.has('equity')).toBe(true);
      expect(types.has('revenue')).toBe(true);
      expect(types.has('cost_of_goods_sold')).toBe(true);
      expect(types.has('expense')).toBe(true);
    });

    it('contains mandatory bookstore control accounts with required mapping keys', () => {
      const mappings = new Map(
        DEFAULT_RETAIL_CHART_OF_ACCOUNTS.filter((a) => a.systemMappingKey).map((a) => [
          a.systemMappingKey,
          a.accountCode,
        ])
      );

      expect(mappings.get('defaultCash')).toBe('1111');
      expect(mappings.get('posCashRegister')).toBe('1112');
      expect(mappings.get('bankClearing')).toBe('1120');
      expect(mappings.get('accountsReceivable')).toBe('1130');
      expect(mappings.get('inventory')).toBe('1140');
      expect(mappings.get('accountsPayable')).toBe('2110');
      expect(mappings.get('customerAdvancesLiability')).toBe('2120');
      expect(mappings.get('ownerCapital')).toBe('3100');
      expect(mappings.get('retailSalesRevenue')).toBe('4100');
      expect(mappings.get('wholesaleSalesRevenue')).toBe('4200');
      expect(mappings.get('salesReturns')).toBe('4900');
      expect(mappings.get('cogs')).toBe('5100');
      expect(mappings.get('purchaseReturnVariance')).toBe('5200');
      expect(mappings.get('inventoryDamageExpense')).toBe('6700');
    });
  });

  describe('4. Deterministic Business Transaction Posting Templates (Audit 4)', () => {
    it('posts Cash Retail Sale with Revenue and COGS', () => {
      const sale: Sale = {
        id: 'sale_001',
        tenantId: 'tenant_01',
        invoiceNumber: 'INV-2026-000001',
        customerId: null,
        saleType: 'retail',
        subtotal: 100.00,
        discountAmount: 0,
        taxAmount: 14.00,
        total: 114.00,
        paidAmount: 114.00,
        changeAmount: 0,
        paymentStatus: 'paid',
        status: 'completed',
        totalCost: 60.00,
        grossProfit: 40.00,
        payments: [{ id: 'p1', method: 'cash', amount: 114.00, receivedAt: '2026-01-01' }],
        items: [],
        createdAt: '2026-01-01T10:00:00Z',
        updatedAt: '2026-01-01T10:00:00Z',
        createdBy: 'user_1',
      };

      const lines = buildSaleJournalLines(sale, accountIds);
      const balance = validateBalancedJournalLines(lines);

      expect(balance.isValid).toBe(true);
      expect(balance.totalDebit).toBe(174.00); // 114 (Cash) + 60 (COGS)
      expect(balance.totalCredit).toBe(174.00); // 100 (Revenue) + 14 (Tax) + 60 (Inventory)
    });

    it('posts Split Payment Sale (Cash + Bank Card)', () => {
      const sale: Sale = {
        id: 'sale_002',
        tenantId: 'tenant_01',
        invoiceNumber: 'INV-2026-000002',
        customerId: null,
        saleType: 'retail',
        subtotal: 200.00,
        discountAmount: 0,
        taxAmount: 0,
        total: 200.00,
        paidAmount: 200.00,
        changeAmount: 0,
        paymentStatus: 'paid',
        status: 'completed',
        totalCost: 120.00,
        grossProfit: 80.00,
        payments: [
          { id: 'p1', method: 'cash', amount: 80.00, receivedAt: '2026-01-01' },
          { id: 'p2', method: 'card', amount: 120.00, receivedAt: '2026-01-01' },
        ],
        items: [],
        createdAt: '2026-01-01T11:00:00Z',
        updatedAt: '2026-01-01T11:00:00Z',
        createdBy: 'user_1',
      };

      const lines = buildSaleJournalLines(sale, accountIds);
      const balance = validateBalancedJournalLines(lines);

      expect(balance.isValid).toBe(true);
      const cashLine = lines.find((l) => l.accountId === accountIds.cash);
      const bankLine = lines.find((l) => l.accountId === accountIds.bank);
      expect(cashLine?.debit).toBe(80.00);
      expect(bankLine?.debit).toBe(120.00);
    });

    it('posts Credit Sale with Customer Advance applied', () => {
      const sale: Sale = {
        id: 'sale_003',
        tenantId: 'tenant_01',
        invoiceNumber: 'INV-2026-000003',
        customerId: 'cust_school_01',
        saleType: 'wholesale',
        subtotal: 1000.00,
        discountAmount: 0,
        taxAmount: 0,
        total: 1000.00,
        paidAmount: 200.00, // 200 applied from customer advance
        changeAmount: 0,
        paymentStatus: 'partial',
        status: 'completed',
        totalCost: 700.00,
        grossProfit: 300.00,
        payments: [
          { id: 'p1', method: 'customer_balance', amount: 200.00, receivedAt: '2026-01-01' },
        ],
        items: [],
        createdAt: '2026-01-01T12:00:00Z',
        updatedAt: '2026-01-01T12:00:00Z',
        createdBy: 'user_1',
      };

      const lines = buildSaleJournalLines(sale, accountIds);
      const balance = validateBalancedJournalLines(lines);

      expect(balance.isValid).toBe(true);
      const advanceLine = lines.find((l) => l.accountId === accountIds.advances);
      const arLine = lines.find((l) => l.accountId === accountIds.ar);
      const revLine = lines.find((l) => l.accountId === accountIds.salesWholesale);

      expect(advanceLine?.debit).toBe(200.00);
      expect(arLine?.debit).toBe(800.00);
      expect(revLine?.credit).toBe(1000.00);
    });

    it('posts Restocked Sale Return (Refund Cash, Restock Inventory)', () => {
      const returnRecord: SaleReturn = {
        id: 'ret_001',
        tenantId: 'tenant_01',
        returnNumber: 'RET-2026-000001',
        saleId: 'sale_001',
        invoiceNumberSnapshot: 'INV-2026-000001',
        customerId: null,
        subtotal: 50.00,
        taxAmount: 0,
        totalRefundAmount: 50.00,
        refundStatus: 'completed',
        restockFee: 0,
        returnType: 'refund',
        status: 'completed',
        totalCostSnapshot: 30.00,
        items: [
          {
            id: 'item_1',
            saleItemId: 'si_1',
            productId: 'p_1',
            quantity: 1,
            unitPriceSnapshot: 50.00,
            unitCostSnapshot: 30.00,
            lineTotal: 50.00,
            condition: 'resellable',
            inventoryAction: 'restock',
            exchangeItem: null,
          },
        ],
        refunds: [{ id: 'ref_1', method: 'cash', amount: 50.00, createdAt: '2026-01-02' }],
        exchanges: [],
        createdAt: '2026-01-02T10:00:00Z',
        updatedAt: '2026-01-02T10:00:00Z',
        processedBy: 'user_1',
      };

      const lines = buildSaleReturnJournalLines(returnRecord, accountIds);
      const balance = validateBalancedJournalLines(lines);

      expect(balance.isValid).toBe(true);
      const retLine = lines.find((l) => l.accountId === accountIds.salesReturns);
      const cashLine = lines.find((l) => l.accountId === accountIds.cash);
      const invLine = lines.find((l) => l.accountId === accountIds.inventory);
      const cogsLine = lines.find((l) => l.accountId === accountIds.cogs);

      expect(retLine?.debit).toBe(50.00);
      expect(cashLine?.credit).toBe(50.00);
      expect(invLine?.debit).toBe(30.00);
      expect(cogsLine?.credit).toBe(30.00);
    });

    it('posts Damaged Sale Return: routes cost to Damage Expense rather than sellable stock', () => {
      const returnRecord: SaleReturn = {
        id: 'ret_002',
        tenantId: 'tenant_01',
        returnNumber: 'RET-2026-000002',
        saleId: 'sale_001',
        invoiceNumberSnapshot: 'INV-2026-000001',
        customerId: null,
        subtotal: 50.00,
        taxAmount: 0,
        totalRefundAmount: 50.00,
        refundStatus: 'completed',
        restockFee: 0,
        returnType: 'refund',
        status: 'completed',
        totalCostSnapshot: 30.00,
        items: [
          {
            id: 'item_2',
            saleItemId: 'si_2',
            productId: 'p_2',
            quantity: 1,
            unitPriceSnapshot: 50.00,
            unitCostSnapshot: 30.00,
            lineTotal: 50.00,
            condition: 'damaged',
            inventoryAction: 'waste',
            exchangeItem: null,
          },
        ],
        refunds: [{ id: 'ref_2', method: 'cash', amount: 50.00, createdAt: '2026-01-02' }],
        exchanges: [],
        createdAt: '2026-01-02T11:00:00Z',
        updatedAt: '2026-01-02T11:00:00Z',
        processedBy: 'user_1',
      };

      const lines = buildSaleReturnJournalLines(returnRecord, accountIds);
      const balance = validateBalancedJournalLines(lines);

      expect(balance.isValid).toBe(true);
      const damageLine = lines.find((l) => l.accountId === accountIds.damageExpense);
      const invLine = lines.find((l) => l.accountId === accountIds.inventory);
      expect(damageLine?.debit).toBe(30.00);
      expect(invLine).toBeUndefined(); // NOT restocked to sellable inventory
    });

    it('posts Goods Receiving Note (GRN): Dr Inventory, Cr Accounts Payable', () => {
      const grn: GoodsReceipt = {
        id: 'grn_001',
        tenantId: 'tenant_01',
        grnNumber: 'GRN-2026-000001',
        purchaseOrderId: 'po_001',
        supplierId: 'supp_001',
        supplierInvoiceNumber: 'SUPP-INV-99',
        totalAmount: 5000.00,
        totalItemsCount: 10,
        status: 'completed',
        items: [],
        createdAt: '2026-01-03T10:00:00Z',
        receivedAt: '2026-01-03T10:00:00Z',
        receivedBy: 'user_1',
      };

      const lines = buildGoodsReceiptJournalLines(grn, accountIds);
      const balance = validateBalancedJournalLines(lines);

      expect(balance.isValid).toBe(true);
      const invLine = lines.find((l) => l.accountId === accountIds.inventory);
      const apLine = lines.find((l) => l.accountId === accountIds.ap);
      expect(invLine?.debit).toBe(5000.00);
      expect(apLine?.credit).toBe(5000.00);
    });

    it('posts Supplier Payment: Dr Accounts Payable, Cr Cash', () => {
      const payment = {
        id: 'sp_001',
        tenantId: 'tenant_01',
        supplierId: 'supp_001',
        amount: 2500.00,
        method: 'cash' as const,
        description: 'دفعة نقدية تحت الحساب',
      };

      const lines = buildSupplierPaymentJournalLines(payment, accountIds);
      const balance = validateBalancedJournalLines(lines);

      expect(balance.isValid).toBe(true);
      const apLine = lines.find((l) => l.accountId === accountIds.ap);
      const cashLine = lines.find((l) => l.accountId === accountIds.cash);
      expect(apLine?.debit).toBe(2500.00);
      expect(cashLine?.credit).toBe(2500.00);
    });

    it('posts Purchase Return with Cost Variance (Audit 4)', () => {
      // Supplier credit is 1000, but carrying WAC inventory cost removed is 950.
      // Difference (50) is favorable variance credited to 5200.
      const pReturn: PurchaseReturn = {
        id: 'pret_001',
        tenantId: 'tenant_01',
        returnNumber: 'PRT-2026-000001',
        supplierId: 'supp_001',
        totalAmount: 1000.00,
        carryingInventoryCost: 950.00,
        status: 'approved',
        reason: 'كتب تالفة من دار النشر',
        items: [],
        createdAt: '2026-01-04T10:00:00Z',
        updatedAt: '2026-01-04T10:00:00Z',
        createdBy: 'user_1',
      };

      const lines = buildPurchaseReturnJournalLines(pReturn, accountIds);
      const balance = validateBalancedJournalLines(lines);

      expect(balance.isValid).toBe(true);
      const apLine = lines.find((l) => l.accountId === accountIds.ap);
      const invLine = lines.find((l) => l.accountId === accountIds.inventory);
      const varLine = lines.find((l) => l.accountId === accountIds.purchaseVariance);

      expect(apLine?.debit).toBe(1000.00);
      expect(invLine?.credit).toBe(950.00);
      expect(varLine?.credit).toBe(50.00);
    });

    it('posts Inventory Damage / Shrinkage: Dr Damage Expense, Cr Inventory', () => {
      const damageRecord: DamageLossRecord = {
        id: 'dmg_001',
        tenantId: 'tenant_01',
        recordNumber: 'DMG-2026-000001',
        branchId: 'main',
        totalCost: 450.00,
        reasonCategory: 'water_damage',
        status: 'approved',
        items: [],
        notes: 'تلف كشاكيل نتيجة تسريب مياه',
        createdAt: '2026-01-05T10:00:00Z',
        updatedAt: '2026-01-05T10:00:00Z',
        createdBy: 'user_1',
      };

      const lines = buildDamageLossJournalLines(damageRecord, accountIds);
      const balance = validateBalancedJournalLines(lines);

      expect(balance.isValid).toBe(true);
      const dmgLine = lines.find((l) => l.accountId === accountIds.damageExpense);
      const invLine = lines.find((l) => l.accountId === accountIds.inventory);
      expect(dmgLine?.debit).toBe(450.00);
      expect(invLine?.credit).toBe(450.00);
    });

    it('posts Operating Expense: Dr Rent Expense, Cr Bank', () => {
      const expense = {
        id: 'exp_001',
        tenantId: 'tenant_01',
        expenseAccountId: accountIds.rentExpense,
        amount: 3000.00,
        paymentMethod: 'bank_transfer' as const,
        description: 'إيجار مقر المكتبة لشهر يناير',
      };

      const lines = buildExpenseJournalLines(expense, accountIds);
      const balance = validateBalancedJournalLines(lines);

      expect(balance.isValid).toBe(true);
      const rentLine = lines.find((l) => l.accountId === accountIds.rentExpense);
      const bankLine = lines.find((l) => l.accountId === accountIds.bank);
      expect(rentLine?.debit).toBe(3000.00);
      expect(bankLine?.credit).toBe(3000.00);
    });

    it('posts Payroll: Dr Salaries Expense, Cr Payroll Payable', () => {
      const payroll = {
        id: 'pay_001',
        tenantId: 'tenant_01',
        month: '2026-01',
        totalNetSalaries: 15000.00,
        description: 'استحقاق رواتب موظفي المكتبة لشهر يناير',
      };

      const lines = buildPayrollJournalLines(payroll, accountIds);
      const balance = validateBalancedJournalLines(lines);

      expect(balance.isValid).toBe(true);
      const salLine = lines.find((l) => l.accountId === accountIds.salariesExpense);
      const payPayLine = lines.find((l) => l.accountId === accountIds.payrollPayable);
      expect(salLine?.debit).toBe(15000.00);
      expect(payPayLine?.credit).toBe(15000.00);
    });
  });

  describe('5. Audit 2: Subledger vs General Ledger Reconciliation Invariants', () => {
    it('verifies AR reconciliation condition: variance = GL AR - Customer Subledger', () => {
      const glARBalance = 12500.00;
      const customerSubledgerTotal = 12500.00;
      const variance = Math.round((glARBalance - customerSubledgerTotal) * 100) / 100;
      const isMatched = Math.abs(variance) < 0.01;

      expect(variance).toBe(0);
      expect(isMatched).toBe(true);
    });

    it('detects variance when customer subledger deviates from GL AR', () => {
      const glARBalance = 12500.00;
      const customerSubledgerTotal = 12000.00; // 500 missing in subledger
      const variance = Math.round((glARBalance - customerSubledgerTotal) * 100) / 100;
      const isMatched = Math.abs(variance) < 0.01;

      expect(variance).toBe(500.00);
      expect(isMatched).toBe(false);
    });

    it('verifies AP reconciliation condition: variance = GL AP - Supplier Subledger', () => {
      const glAPBalance = 8000.00;
      const supplierSubledgerTotal = 8000.00;
      const variance = Math.round((glAPBalance - supplierSubledgerTotal) * 100) / 100;
      const isMatched = Math.abs(variance) < 0.01;

      expect(variance).toBe(0);
      expect(isMatched).toBe(true);
    });

    it('verifies Inventory reconciliation condition: GL Inventory == Stock Valuation', () => {
      const glInventoryBalance = 45000.00;
      const stockValuationTotal = 45000.00;
      const variance = Math.round((glInventoryBalance - stockValuationTotal) * 100) / 100;
      const isMatched = Math.abs(variance) < 0.01;

      expect(variance).toBe(0);
      expect(isMatched).toBe(true);
    });
  });

  describe('6. Audit 3: Opening Balances Migration Math', () => {
    it('calculates balanced Opening Equity from assets and liabilities snapshots', () => {
      const inventorySnapshot = 50000.00;
      const arSnapshot = 15000.00;
      const cashSnapshot = 10000.00;
      const bankSnapshot = 25000.00;
      const apSnapshot = 30000.00;

      const totalAssets = inventorySnapshot + arSnapshot + cashSnapshot + bankSnapshot; // 100,000
      const totalLiabilities = apSnapshot; // 30,000
      const netOpeningEquity = totalAssets - totalLiabilities; // 70,000

      expect(totalAssets).toBe(100000.00);
      expect(netOpeningEquity).toBe(70000.00);

      // Journal Lines Construction:
      const lines = [
        { accountId: accountIds.inventory, debit: inventorySnapshot, credit: 0 },
        { accountId: accountIds.ar, debit: arSnapshot, credit: 0 },
        { accountId: accountIds.cash, debit: cashSnapshot, credit: 0 },
        { accountId: accountIds.bank, debit: bankSnapshot, credit: 0 },
        { accountId: accountIds.ap, debit: 0, credit: apSnapshot },
        { accountId: accountIds.capital, debit: 0, credit: netOpeningEquity },
      ];

      const balance = validateBalancedJournalLines(lines);
      expect(balance.isValid).toBe(true);
      expect(balance.totalDebit).toBe(100000.00);
      expect(balance.totalCredit).toBe(100000.00);
      expect(balance.difference).toBe(0);
    });
  });

  describe('7. Financial Statements Equations & Invariants', () => {
    it('validates Balance Sheet equation: Total Assets == Total Liabilities + Total Equity', () => {
      const assets = {
        cash: 10000.00,
        bank: 25000.00,
        ar: 15000.00,
        inventory: 50000.00,
      };
      const totalAssets = assets.cash + assets.bank + assets.ar + assets.inventory; // 100,000

      const liabilities = {
        ap: 20000.00,
        advances: 2000.00,
        payroll: 3000.00,
      };
      const totalLiabilities = liabilities.ap + liabilities.advances + liabilities.payroll; // 25,000

      const equity = {
        capital: 60000.00,
        retainedEarnings: 10000.00,
        netIncome: 5000.00,
      };
      const totalEquity = equity.capital + equity.retainedEarnings + equity.netIncome; // 75,000

      const totalLiabilitiesAndEquity = totalLiabilities + totalEquity; // 100,000
      const variance = Math.round((totalAssets - totalLiabilitiesAndEquity) * 100) / 100;

      expect(totalAssets).toBe(100000.00);
      expect(totalLiabilitiesAndEquity).toBe(100000.00);
      expect(variance).toBe(0);
    });

    it('validates Multi-Step P&L equation: Net Income = (Revenue - Returns - COGS) - Expenses', () => {
      const grossSales = 100000.00;
      const salesReturns = 2000.00;
      const netRevenue = grossSales - salesReturns; // 98,000
      const cogs = 60000.00;
      const grossProfit = netRevenue - cogs; // 38,000
      const grossMargin = (grossProfit / netRevenue) * 100;

      const operatingExpenses = 25000.00;
      const netIncome = grossProfit - operatingExpenses; // 13,000

      expect(netRevenue).toBe(98000.00);
      expect(grossProfit).toBe(38000.00);
      expect(grossMargin.toFixed(2)).toBe('38.78');
      expect(netIncome).toBe(13000.00);
    });
  });
});
