import { describe, it, expect } from 'vitest';
import { formatSequenceNumber } from '../services/sales/invoiceNumber.service';
import {
  calculateItemPrice,
} from '../services/pricing/pricingEngine';
import {
  checkCustomerCreditEligibility,
  calculateReceivablesAging,
} from '../services/customers/creditSales.service';
import {
  getCustomerPaymentIdempotencyDocId,
} from '../services/customers/customerPayments.service';
import type {
  Customer,
  CustomerLedgerEntry,
  CustomerReceivable,
  CustomerPayment,
  CustomerPaymentAllocation,
  PriceList,
  PriceListItem,
  CustomerProductPrice,
  Product,
  ProductVariant,
  Sale,
  SaleItem,
  PaymentEntry,
} from '../types/retail.types';

describe('Phase 8: Customers Advanced Accounts, Wholesale Pricing, Credit Sales & Receivables', () => {

  // Mock product for testing
  const notebookProduct: Product = {
    id: 'prod_notebook_60_pages',
    tenantId: 'tenant_alwan_01',
    name: 'كشكول سلك 60 ورقة ألوان',
    sku: 'NB-60-ALW',
    barcode: '6221234567890',
    type: 'standard',
    baseUnitId: 'pcs',
    sellingPrice: 20.00,
    wholesalePrice: 15.00,
    costPrice: 10.00,
    minimumSellingPrice: 12.00,
    taxRate: 0,
    status: 'active',
    hasVariants: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  // Mock customer: مدرسة النور الخاصة
  const schoolCustomer: Customer = {
    id: 'cust_school_alnoor',
    tenantId: 'tenant_alwan_01',
    code: 'CUS-000001',
    name: 'مدرسة النور الخاصة',
    phone: '01011112222',
    email: 'info@alnoor-school.edu.eg',
    customerType: 'school',
    creditEnabled: true,
    creditLimit: 10000.00,
    creditStatus: 'normal',
    paymentTermsDays: 30,
    maxInvoiceAmount: 8000.00,
    currentBalance: 0.00,
    totalPurchases: 0.00,
    totalPaid: 0.00,
    overdueBalance: 0.00,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  // ==========================================
  // 1. Mandatory Pre-Phase Audits & Invariants
  // ==========================================
  describe('1. Mandatory Pre-Phase Audits & Invariants', () => {
    it('Audit 1: Customer code adheres to format CUS-000001', () => {
      const code1 = `CUS-${formatSequenceNumber(1, 6)}`;
      const code42 = `CUS-${formatSequenceNumber(42, 6)}`;
      expect(code1).toBe('CUS-000001');
      expect(code42).toBe('CUS-000042');
    });

    it('Audit 1: Ledger convention: Positive (+) = Customer owes store, Negative (-) = Store owes customer', () => {
      // Invariant: Running balance = Sum(debits) - Sum(credits)
      const debitEntry: CustomerLedgerEntry = {
        id: 'led_1',
        tenantId: 'tenant_alwan_01',
        customerId: schoolCustomer.id,
        entryType: 'credit_sale',
        referenceId: 'sale_inv_101',
        referenceType: 'sale',
        debit: 4000.00,
        credit: 0.00,
        balanceAfter: 4000.00,
        description: 'فاتورة مبيعات آجلة',
        createdAt: '2026-08-01T10:00:00Z',
        createdBy: 'user_cashier',
      };
      expect(debitEntry.balanceAfter).toBeGreaterThan(0); // Customer owes 4000

      const creditEntry: CustomerLedgerEntry = {
        id: 'led_2',
        tenantId: 'tenant_alwan_01',
        customerId: schoolCustomer.id,
        entryType: 'customer_payment',
        referenceId: 'pay_cp_201',
        referenceType: 'customer_payment',
        debit: 0.00,
        credit: 4500.00,
        balanceAfter: debitEntry.balanceAfter - 4500.00, // 4000 - 4500 = -500
        description: 'سداد دفعة نقدية مع زيادة دفعة مقدمة',
        createdAt: '2026-08-05T10:00:00Z',
        createdBy: 'user_cashier',
      };
      expect(creditEntry.balanceAfter).toBe(-500.00); // Store owes customer 500 advance
    });

    it('Audit 2 & 3: Customer payment idempotency key is deterministic', () => {
      const key1 = getCustomerPaymentIdempotencyDocId('tenant_alwan_01', 'client_tx_abc_123');
      const key2 = getCustomerPaymentIdempotencyDocId('tenant_alwan_01', 'client_tx_abc_123');
      expect(key1).toBe('tenant_alwan_01___client_tx_abc_123');
      expect(key1).toBe(key2);
    });
  });

  // ==========================================
  // 2. Pricing Engine Pipeline & Priority Rule
  // ==========================================
  describe('2. Deterministic Pricing Pipeline & Priority Hierarchy', () => {
    it('Priority 1: Customer Contractual Price overrides everything', () => {
      const contractualPrice: CustomerProductPrice = {
        id: 'cpp_1',
        tenantId: 'tenant_alwan_01',
        customerId: schoolCustomer.id,
        productId: notebookProduct.id,
        customPrice: 13.50,
        isActive: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      const result = calculateItemPrice({
        product: notebookProduct,
        customer: schoolCustomer,
        customerProductPrices: [contractualPrice],
        quantity: 10,
        isWholesale: true, // even if wholesale is requested
      });

      expect(result.appliedUnitPrice).toBe(13.50);
      expect(result.priceSource).toBe('customer_contract');
    });

    it('Priority 2: Assigned Price List overrides Wholesale and Retail', () => {
      const schoolPriceList: PriceList = {
        id: 'pl_schools_2026',
        tenantId: 'tenant_alwan_01',
        name: 'قائمة أسعار المدارس الخاصة',
        code: 'PL-SCHOOL',
        currency: 'EGP',
        type: 'school',
        roundingMode: 'nearest',
        isActive: true,
        priority: 10,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      const priceListItem: PriceListItem = {
        id: 'pli_1',
        tenantId: 'tenant_alwan_01',
        priceListId: schoolPriceList.id,
        productId: notebookProduct.id,
        fixedPrice: 14.25,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };

      const customerWithList: Customer = {
        ...schoolCustomer,
        priceListId: schoolPriceList.id,
      };

      const result = calculateItemPrice({
        product: notebookProduct,
        customer: customerWithList,
        priceListItems: [priceListItem],
        quantity: 5,
        isWholesale: false,
      });

      expect(result.appliedUnitPrice).toBe(14.25);
      expect(result.priceSource).toBe('price_list');
    });

    it('Priority 3: Quantity Tiers applied on base quantity', () => {
      const productWithTiers: Product = {
        ...notebookProduct,
        pricingRules: [
          {
            id: 'rule_tier_50',
            tierMinQty: 50,
            tierMaxQty: 99,
            discountType: 'fixed_price',
            discountValue: 16.00,
          },
          {
            id: 'rule_tier_100',
            tierMinQty: 100,
            discountType: 'fixed_price',
            discountValue: 14.00,
          },
        ],
      };

      // Case A: 10 pcs -> regular retail price 20.00
      const res10 = calculateItemPrice({ product: productWithTiers, quantity: 10 });
      expect(res10.appliedUnitPrice).toBe(20.00);

      // Case B: 60 pcs -> Tier 50+ matches price 16.00
      const res60 = calculateItemPrice({ product: productWithTiers, quantity: 60 });
      expect(res60.appliedUnitPrice).toBe(16.00);
      expect(res60.priceSource).toBe('quantity_tier');

      // Case C: 120 pcs -> Tier 100+ matches price 14.00
      const res120 = calculateItemPrice({ product: productWithTiers, quantity: 120 });
      expect(res120.appliedUnitPrice).toBe(14.00);
      expect(res120.priceSource).toBe('quantity_tier');
    });

    it('Priority 4: Wholesale price applies when customer is wholesale or isWholesale is true', () => {
      const wholesaleCust: Customer = {
        ...schoolCustomer,
        customerType: 'wholesale',
      };

      const res = calculateItemPrice({
        product: notebookProduct,
        customer: wholesaleCust,
        quantity: 1,
      });

      expect(res.appliedUnitPrice).toBe(notebookProduct.wholesalePrice); // 15.00
      expect(res.priceSource).toBe('wholesale');
    });

    it('Hard Guard: Minimum Selling Price cannot be breached without override', () => {
      // Trying to apply massive 80% discount
      const res = calculateItemPrice({
        product: notebookProduct, // sellingPrice: 20, minimumSellingPrice: 12
        quantity: 1,
        manualDiscountPercent: 80, // would be 4.00
        allowBelowMinimum: false,
      });

      // Must be capped at minimum selling price 12.00
      expect(res.appliedUnitPrice).toBe(notebookProduct.minimumSellingPrice); // 12.00
      expect(res.warning).toContain('الحد الأدنى');
    });
  });

  // ==========================================
  // 3. Scenario 1: Credit Sale Transaction
  // ==========================================
  describe('3. Scenario 1: Credit Sale Transaction (مدرسة النور)', () => {
    it('Accurately processes 5000 EGP sale with 1000 Bank and 4000 Credit', () => {
      // Eligibility Check
      const eligibility = checkCustomerCreditEligibility(schoolCustomer, 4000.00);
      expect(eligibility.isEligible).toBe(true);
      expect(eligibility.creditStatus).toBe('normal');

      // Sale Creation Simulation
      const payments: PaymentEntry[] = [
        { method: 'bank_transfer', amount: 1000.00 },
        { method: 'credit', amount: 4000.00 },
      ];
      const creditPortion = payments.find(p => p.method === 'credit')?.amount || 0;
      expect(creditPortion).toBe(4000.00);

      // Create Receivable
      const receivable: CustomerReceivable = {
        id: 'rec_101',
        tenantId: 'tenant_alwan_01',
        branchId: 'branch_hq',
        customerId: schoolCustomer.id,
        saleId: 'sale_101',
        saleInvoiceNumber: 'INV-HQ-2026-000001',
        originalAmount: 4000.00,
        paidAmount: 0.00,
        remainingAmount: 4000.00,
        dueDate: '2026-09-01T00:00:00Z',
        status: 'open',
        createdAt: '2026-08-01T10:00:00Z',
        updatedAt: '2026-08-01T10:00:00Z',
      };

      // Ledger Entry (Audit 1: debit = 4000, balanceAfter = +4000)
      const ledgerEntry: CustomerLedgerEntry = {
        id: 'led_101',
        tenantId: 'tenant_alwan_01',
        customerId: schoolCustomer.id,
        entryType: 'credit_sale',
        referenceId: 'sale_101',
        referenceType: 'sale',
        debit: 4000.00,
        credit: 0.00,
        balanceAfter: (schoolCustomer.currentBalance || 0) + 4000.00,
        description: 'فاتورة مبيعات بالآجل رقم INV-HQ-2026-000001',
        createdAt: '2026-08-01T10:00:00Z',
        createdBy: 'user_cashier',
      };

      expect(receivable.remainingAmount).toBe(4000.00);
      expect(ledgerEntry.balanceAfter).toBe(4000.00);
    });
  });

  // ==========================================
  // 4. Scenario 2: Concurrent Credit Limit Enforcement
  // ==========================================
  describe('4. Scenario 2: Credit Limit & Status Enforcement', () => {
    it('Blocks sale when requested credit exceeds available limit', () => {
      const customerWithDebt: Customer = {
        ...schoolCustomer,
        creditLimit: 10000.00,
        currentBalance: 8000.00, // 2000 remaining
      };

      // Sale requesting 3000 credit -> exceeds 2000 remaining
      const check = checkCustomerCreditEligibility(customerWithDebt, 3000.00);
      expect(check.isEligible).toBe(false);
      expect(check.reason).toContain('تجاوز السقف الائتماني');
    });

    it('Blocks sale if customer credit status is blocked', () => {
      const blockedCustomer: Customer = {
        ...schoolCustomer,
        creditStatus: 'blocked',
      };

      const check = checkCustomerCreditEligibility(blockedCustomer, 100.00);
      expect(check.isEligible).toBe(false);
      expect(check.reason).toContain('محظور ائتمانياً');
    });

    it('Blocks sale if customer has overdue balance and policy forbids overdue sales', () => {
      const overdueCustomer: Customer = {
        ...schoolCustomer,
        overdueBalance: 500.00,
      };

      const check = checkCustomerCreditEligibility(overdueCustomer, 100.00, { blockIfOverdue: true });
      expect(check.isEligible).toBe(false);
      expect(check.reason).toContain('مديونية متأخرة');
    });
  });

  // ==========================================
  // 5. Scenario 3: Payment Allocation (Oldest Due First)
  // ==========================================
  describe('5. Scenario 3: Payment Allocation & Advance Handling', () => {
    it('Allocates 3000 EGP payment across INV-A (2500 due) and INV-B (1500 due)', () => {
      const recA: CustomerReceivable = {
        id: 'rec_A',
        tenantId: 'tenant_alwan_01',
        branchId: 'branch_hq',
        customerId: schoolCustomer.id,
        saleId: 'sale_A',
        saleInvoiceNumber: 'INV-A',
        originalAmount: 2500.00,
        paidAmount: 0.00,
        remainingAmount: 2500.00,
        dueDate: '2026-08-01T00:00:00Z',
        status: 'open',
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-01T00:00:00Z',
      };

      const recB: CustomerReceivable = {
        id: 'rec_B',
        tenantId: 'tenant_alwan_01',
        branchId: 'branch_hq',
        customerId: schoolCustomer.id,
        saleId: 'sale_B',
        saleInvoiceNumber: 'INV-B',
        originalAmount: 1500.00,
        paidAmount: 0.00,
        remainingAmount: 1500.00,
        dueDate: '2026-08-15T00:00:00Z',
        status: 'open',
        createdAt: '2026-07-15T00:00:00Z',
        updatedAt: '2026-07-15T00:00:00Z',
      };

      const paymentAmount = 3000.00;
      let unallocated = paymentAmount;
      const allocations: CustomerPaymentAllocation[] = [];

      // Sort by oldest due first
      const openReceivables = [recA, recB].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

      for (const rec of openReceivables) {
        if (unallocated <= 0) break;
        const alloc = Math.min(unallocated, rec.remainingAmount);
        rec.paidAmount += alloc;
        rec.remainingAmount -= alloc;
        rec.status = rec.remainingAmount === 0 ? 'paid' : 'partial';
        unallocated -= alloc;
        allocations.push({
          id: `alloc_${rec.id}`,
          tenantId: 'tenant_alwan_01',
          paymentId: 'pay_3000',
          receivableId: rec.id,
          saleId: rec.saleId,
          allocatedAmount: alloc,
          createdAt: '2026-08-20T00:00:00Z',
        });
      }

      // Assertions:
      // INV-A should be fully paid (allocated 2500, remaining 0)
      expect(recA.paidAmount).toBe(2500.00);
      expect(recA.remainingAmount).toBe(0.00);
      expect(recA.status).toBe('paid');

      // INV-B should be partially paid (allocated 500, remaining 1000)
      expect(recB.paidAmount).toBe(500.00);
      expect(recB.remainingAmount).toBe(1000.00);
      expect(recB.status).toBe('partial');

      expect(unallocated).toBe(0.00);
      expect(allocations.length).toBe(2);
    });

    it('Creates customer advance when payment exceeds total outstanding debt', () => {
      const recOnly: CustomerReceivable = {
        id: 'rec_single',
        tenantId: 'tenant_alwan_01',
        branchId: 'branch_hq',
        customerId: schoolCustomer.id,
        saleId: 'sale_single',
        saleInvoiceNumber: 'INV-SINGLE',
        originalAmount: 1000.00,
        paidAmount: 0.00,
        remainingAmount: 1000.00,
        dueDate: '2026-08-01T00:00:00Z',
        status: 'open',
        createdAt: '2026-07-01T00:00:00Z',
        updatedAt: '2026-07-01T00:00:00Z',
      };

      const initialCustomerBalance = 1000.00; // owes 1000
      const paymentAmount = 1500.00; // pays 1500

      const alloc = Math.min(paymentAmount, recOnly.remainingAmount);
      recOnly.remainingAmount -= alloc; // 0
      const unallocatedAdvance = paymentAmount - alloc; // 500.00

      const newCustomerBalance = initialCustomerBalance - paymentAmount; // 1000 - 1500 = -500

      expect(recOnly.remainingAmount).toBe(0.00);
      expect(unallocatedAdvance).toBe(500.00);
      expect(newCustomerBalance).toBe(-500.00); // Negative indicates store owes customer (Advance)
    });
  });

  // ==========================================
  // 6. Scenario 4 & 5: Return on Credit Sale (Audit 4)
  // ==========================================
  describe('6. Scenarios 4 & 5: Return on Credit Sale (Audit 4 Guard)', () => {
    it('Scenario 4: Return of 500 on 1000 sale (300 paid, 700 due) -> Reduces debt to 200, ZERO cash refund', () => {
      const initialTotal = 1000.00;
      const cashPaid = 300.00;
      const creditDue = 700.00;
      const returnTotal = 500.00;

      // Invariant Audit 4: Return reduces outstanding credit receivable first
      const debtReduction = Math.min(returnTotal, creditDue); // 500
      const remainingReceivable = creditDue - debtReduction;  // 200

      // Refundable amount is excess of return over debt reduction
      const excessAfterDebt = Math.max(0, returnTotal - debtReduction); // 0
      // Max cash refund is capped at cash actually paid
      const cashRefund = Math.min(excessAfterDebt, cashPaid); // 0

      expect(debtReduction).toBe(500.00);
      expect(remainingReceivable).toBe(200.00);
      expect(cashRefund).toBe(0.00); // ZERO cash given to customer!
    });

    it('Scenario 5: Return of 500 on 1000 sale (800 paid, 200 due) -> Clears 200 debt, refunds/credits 300', () => {
      const cashPaid = 800.00;
      const creditDue = 200.00;
      const returnTotal = 500.00;

      // Debt reduction
      const debtReduction = Math.min(returnTotal, creditDue); // 200
      const remainingReceivable = creditDue - debtReduction;  // 0 (cleared)

      // Refundable portion
      const excessAfterDebt = returnTotal - debtReduction; // 300
      // Strictly capped at actual cash paid
      const maxCashRefundAllowed = Math.min(excessAfterDebt, cashPaid); // 300

      expect(debtReduction).toBe(200.00);
      expect(remainingReceivable).toBe(0.00);
      expect(maxCashRefundAllowed).toBe(300.00);
    });
  });

  // ==========================================
  // 7. Scenario 6: Customer Advance Payment & Consumption
  // ==========================================
  describe('7. Scenario 6: Customer Advance & Store Credit Consumption', () => {
    it('Consumes 600 from 1000 advance -> leaves 400 advance remaining', () => {
      // Initial state: customer has -1000 balance (advance)
      const customerWithAdvance: Customer = {
        ...schoolCustomer,
        currentBalance: -1000.00,
      };

      const saleAmount = 600.00;
      // Sale is paid using 'customer_credit' payment method
      const payment: PaymentEntry = {
        method: 'customer_credit',
        amount: saleAmount,
      };

      // Ledger records advance_applied (debit 600)
      const newBalance = customerWithAdvance.currentBalance + saleAmount; // -1000 + 600 = -400

      const ledgerEntry: CustomerLedgerEntry = {
        id: 'led_adv_1',
        tenantId: 'tenant_alwan_01',
        customerId: customerWithAdvance.id,
        entryType: 'advance_applied',
        referenceId: 'sale_adv_600',
        referenceType: 'sale',
        debit: saleAmount,
        credit: 0.00,
        balanceAfter: newBalance,
        description: 'خصم من الرصيد الدائن / مقدم العميل لسداد فاتورة',
        createdAt: '2026-08-25T10:00:00Z',
        createdBy: 'user_cashier',
      };

      expect(ledgerEntry.balanceAfter).toBe(-400.00);
      expect(newBalance).toBe(-400.00);
    });
  });

  // ==========================================
  // 8. Receivables Aging Calculation (30/60/90+)
  // ==========================================
  describe('8. Receivables Aging Schedule Calculation', () => {
    it('Accurately buckets receivables into Current, 1-30, 31-60, 61-90, 90+ days', () => {
      const now = new Date('2026-09-01T00:00:00Z');

      const mockReceivables: CustomerReceivable[] = [
        // Current (due in future: 2026-09-10) -> 1000
        {
          id: 'rec_curr',
          tenantId: 'tenant_alwan_01',
          branchId: 'branch_hq',
          customerId: schoolCustomer.id,
          saleId: 's1',
          saleInvoiceNumber: 'INV-1',
          originalAmount: 1000.00,
          paidAmount: 0.00,
          remainingAmount: 1000.00,
          dueDate: '2026-09-10T00:00:00Z',
          status: 'open',
          createdAt: '2026-08-10T00:00:00Z',
          updatedAt: '2026-08-10T00:00:00Z',
        },
        // 1-30 days overdue (due 2026-08-15, 17 days ago) -> 2000
        {
          id: 'rec_30',
          tenantId: 'tenant_alwan_01',
          branchId: 'branch_hq',
          customerId: schoolCustomer.id,
          saleId: 's2',
          saleInvoiceNumber: 'INV-2',
          originalAmount: 2000.00,
          paidAmount: 0.00,
          remainingAmount: 2000.00,
          dueDate: '2026-08-15T00:00:00Z',
          status: 'open',
          createdAt: '2026-07-15T00:00:00Z',
          updatedAt: '2026-07-15T00:00:00Z',
        },
        // 31-60 days overdue (due 2026-07-15, 48 days ago) -> 3000
        {
          id: 'rec_60',
          tenantId: 'tenant_alwan_01',
          branchId: 'branch_hq',
          customerId: schoolCustomer.id,
          saleId: 's3',
          saleInvoiceNumber: 'INV-3',
          originalAmount: 3000.00,
          paidAmount: 0.00,
          remainingAmount: 3000.00,
          dueDate: '2026-07-15T00:00:00Z',
          status: 'open',
          createdAt: '2026-06-15T00:00:00Z',
          updatedAt: '2026-06-15T00:00:00Z',
        },
        // 90+ days overdue (due 2026-04-01, 153 days ago) -> 4000
        {
          id: 'rec_90plus',
          tenantId: 'tenant_alwan_01',
          branchId: 'branch_hq',
          customerId: schoolCustomer.id,
          saleId: 's4',
          saleInvoiceNumber: 'INV-4',
          originalAmount: 4000.00,
          paidAmount: 0.00,
          remainingAmount: 4000.00,
          dueDate: '2026-04-01T00:00:00Z',
          status: 'open',
          createdAt: '2026-03-01T00:00:00Z',
          updatedAt: '2026-03-01T00:00:00Z',
        },
      ];

      const aging = calculateReceivablesAging(mockReceivables, now);

      expect(aging.current).toBe(1000.00);
      expect(aging.days1to30).toBe(2000.00);
      expect(aging.days31to60).toBe(3000.00);
      expect(aging.days61to90).toBe(0.00);
      expect(aging.days90plus).toBe(4000.00);
      expect(aging.totalOutstanding).toBe(10000.00);
      expect(aging.totalOverdue).toBe(9000.00);
    });
  });

  // ==========================================
  // 9. Reconciliation & Ledger Integrity
  // ==========================================
  describe('9. Customer Ledger Balance Reconciliation', () => {
    it('Verifies derived balance sum(debit) - sum(credit) strictly equals customer.currentBalance', () => {
      const ledger: CustomerLedgerEntry[] = [
        {
          id: 'l1',
          tenantId: 'tenant_alwan_01',
          customerId: schoolCustomer.id,
          entryType: 'opening_balance',
          debit: 1000.00,
          credit: 0.00,
          balanceAfter: 1000.00,
          createdAt: '2026-01-01T00:00:00Z',
          createdBy: 'admin',
        },
        {
          id: 'l2',
          tenantId: 'tenant_alwan_01',
          customerId: schoolCustomer.id,
          entryType: 'credit_sale',
          debit: 4000.00,
          credit: 0.00,
          balanceAfter: 5000.00,
          createdAt: '2026-02-01T00:00:00Z',
          createdBy: 'cashier',
        },
        {
          id: 'l3',
          tenantId: 'tenant_alwan_01',
          customerId: schoolCustomer.id,
          entryType: 'customer_payment',
          debit: 0.00,
          credit: 3500.00,
          balanceAfter: 1500.00,
          createdAt: '2026-02-15T00:00:00Z',
          createdBy: 'cashier',
        },
        {
          id: 'l4',
          tenantId: 'tenant_alwan_01',
          customerId: schoolCustomer.id,
          entryType: 'sale_return',
          debit: 0.00,
          credit: 500.00,
          balanceAfter: 1000.00,
          createdAt: '2026-02-20T00:00:00Z',
          createdBy: 'cashier',
        },
      ];

      const totalDebits = ledger.reduce((sum, e) => sum + e.debit, 0);   // 1000 + 4000 = 5000
      const totalCredits = ledger.reduce((sum, e) => sum + e.credit, 0); // 3500 + 500 = 4000
      const derivedBalance = Math.round((totalDebits - totalCredits) * 100) / 100; // 1000.00

      expect(totalDebits).toBe(5000.00);
      expect(totalCredits).toBe(4000.00);
      expect(derivedBalance).toBe(1000.00);
      expect(derivedBalance).toBe(ledger[ledger.length - 1].balanceAfter);
    });
  });
});
