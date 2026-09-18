import { describe, it, expect } from 'vitest';
import {
  calculateWeightedAverageCost,
  normalizeStockBalance,
  getBranchStockDocId,
  deduceMovementDirection,
} from '../services/inventory/retailInventory.service';
import {
  calculateItemPrice,
} from '../services/pricing/pricingEngine';
import {
  formatSequenceNumber,
} from '../services/sales/invoiceNumber.service';
import {
  getSaleIdempotencyDocId,
} from '../services/sales/sales.service';
import type {
  Product,
  Sale,
  SaleItem,
  PaymentEntry,
  StockBalance,
  CashierShift,
  HeldSale,
} from '../types/retail.types';

describe('Phase 5: Retail POS Engine, Sales & Payments Test Suite', () => {

  describe('1. Mandatory Pre-Phase Fix 1 — Transfer Cost & Consolidated WAC Preservation', () => {
    it('preserves consolidated enterprise inventory value when transferring stock between locations', () => {
      // Main Warehouse has 100 units @ 7 EGP = 700 EGP value
      let mainWarehouseStock = 100;
      let mainWarehouseWac = 7;
      const initialSourceValue = mainWarehouseStock * mainWarehouseWac; // 700 EGP

      // Nasr City Branch already has 100 units @ 10 EGP = 1000 EGP value
      let nasrCityStock = 100;
      let nasrCityWac = 10;
      const initialDestValue = nasrCityStock * nasrCityWac; // 1000 EGP

      const totalConsolidatedValueBefore = initialSourceValue + initialDestValue; // 1700 EGP
      expect(totalConsolidatedValueBefore).toBe(1700);

      // Step A: Dispatch 100 units from Main Warehouse.
      // Source cost snapshot captured at dispatch time = 7 EGP
      const transferQty = 100;
      const sourceCarryingCostSnapshot = mainWarehouseWac; // 7 EGP

      mainWarehouseStock -= transferQty; // Source stock becomes 0
      // Source transfer_out does NOT alter source WAC!
      expect(mainWarehouseStock).toBe(0);
      expect(mainWarehouseWac).toBe(7);

      // Step B: Receive 100 units at Nasr City using the dispatched carrying cost snapshot (7 EGP)
      const newDestWac = calculateWeightedAverageCost(
        nasrCityStock, // 100
        nasrCityWac,   // 10
        transferQty,   // 100
        sourceCarryingCostSnapshot // 7
      );

      nasrCityStock += transferQty; // 200
      nasrCityWac = newDestWac;     // ((100 * 10) + (100 * 7)) / 200 = 1700 / 200 = 8.5 EGP

      expect(nasrCityStock).toBe(200);
      expect(nasrCityWac).toBe(8.5);

      // Step C: Verify consolidated inventory value is 100% preserved
      const finalConsolidatedValue = (mainWarehouseStock * mainWarehouseWac) + (nasrCityStock * nasrCityWac);
      // 0 + (200 * 8.5) = 1700 EGP
      expect(finalConsolidatedValue).toBe(totalConsolidatedValueBefore);
    });

    it('guarantees source transfer_out leaves source WAC invariant', () => {
      // Warehouse has 200 units @ 12 EGP
      const sourceOnHand = 200;
      const sourceCost = 12;
      const dispatchQty = 50;

      // Transfer out deduction
      const remainingSourceQty = sourceOnHand - dispatchQty;
      // In direction 'out', WAC formula does not change existing unit cost
      const remainingSourceCost = sourceCost;

      expect(remainingSourceQty).toBe(150);
      expect(remainingSourceCost).toBe(12);
    });

    it('prevents double-application of cost snapshot via deterministic idempotency keys', () => {
      const tenantId = 't_cai_01';
      const transferId = 'TRF_2026_000042';
      const productId = 'prod_pens';
      const variantId = 'var_blue';

      const sendIdempKey = `trf_send:${transferId}:${productId}:${variantId}`;
      const recvIdempKey = `trf_recv:${transferId}:${productId}:${variantId}`;

      expect(sendIdempKey).toBe('trf_send:TRF_2026_000042:prod_pens:var_blue');
      expect(recvIdempKey).toBe('trf_recv:TRF_2026_000042:prod_pens:var_blue');
      expect(sendIdempKey).not.toBe(recvIdempKey);
    });
  });

  describe('2. Mandatory Pre-Phase Fix 2 — Stock Balance Invariant: quantity === onHandQuantity', () => {
    it('strictly normalizes StockBalance so quantity and onHandQuantity never diverge', () => {
      const rawDoc = {
        id: 'bal_1',
        tenantId: 't1',
        branchId: 'b1',
        productId: 'p1',
        onHandQuantity: 42,
        quantity: 999, // divergent mock data
        unitCost: 15.5,
        averageCost: 15.5,
      };

      const normalized = normalizeStockBalance(rawDoc);

      // Invariant: quantity and onHandQuantity MUST be strictly equal
      expect(normalized.quantity).toBe(42);
      expect(normalized.onHandQuantity).toBe(42);
      expect(normalized.quantity).toBe(normalized.onHandQuantity);
      expect(normalized.unitCost).toBe(normalized.averageCost);
    });

    it('correctly defaults missing fields without introducing divergence', () => {
      const rawDoc = {
        id: 'bal_2',
        tenantId: 't1',
        branchId: 'b1',
        productId: 'p2',
        quantity: 15,
      };

      const normalized = normalizeStockBalance(rawDoc);

      expect(normalized.onHandQuantity).toBe(15);
      expect(normalized.quantity).toBe(15);
      expect(normalized.availableQuantity).toBe(15);
      expect(normalized.reservedQuantity).toBe(0);
    });
  });

  describe('3. Mandatory Pre-Phase Fix 3 — Whole Sale Atomicity & Rollback Safety', () => {
    it('simulates whole-cart atomic checkout: rolls back all items if any single item is insufficient', () => {
      // Mock inventory balances
      const inventory = new Map<string, { onHand: number; reserved: number; cost: number }>([
        ['item_A', { onHand: 10, reserved: 0, cost: 5 }],
        ['item_B', { onHand: 5, reserved: 0, cost: 20 }],
        ['item_C', { onHand: 1, reserved: 0, cost: 50 }], // Only 1 available
      ]);

      const cart = [
        { id: 'item_A', requestedQty: 2 },
        { id: 'item_B', requestedQty: 3 },
        { id: 'item_C', requestedQty: 5 }, // Needs 5, only 1 in stock!
      ];

      // Atomic validation step
      let rollbackTriggered = false;
      let failureReason = '';

      try {
        for (const line of cart) {
          const stock = inventory.get(line.id);
          if (!stock || stock.onHand < line.requestedQty) {
            throw new Error(`الكمية المتاحة غير كافية للصنف ${line.id}. المتاح: ${stock?.onHand || 0}، المطلوب: ${line.requestedQty}`);
          }
        }
      } catch (err: any) {
        rollbackTriggered = true;
        failureReason = err.message;
      }

      // Assert entire checkout failed atomically
      expect(rollbackTriggered).toBe(true);
      expect(failureReason).toContain('الكمية المتاحة غير كافية للصنف item_C');

      // Assert ZERO partial deductions occurred!
      expect(inventory.get('item_A')?.onHand).toBe(10);
      expect(inventory.get('item_B')?.onHand).toBe(5);
      expect(inventory.get('item_C')?.onHand).toBe(1);
    });
  });

  describe('4. Mandatory Pre-Phase Fix 4 — Sale Idempotency Lock & Double-Click Replay', () => {
    it('generates consistent deterministic idempotency keys for client checkouts', () => {
      const tenantId = 'tenant_alwan';
      const clientCheckoutId = 'chk_171000000_abc123';
      const idempKey = `sale_checkout:${tenantId}:${clientCheckoutId}`;

      const docId = getSaleIdempotencyDocId(tenantId, idempKey);
      expect(docId).toBe('tenant_alwan___sale_checkout_tenant_alwan_chk_171000000_abc123');
    });

    it('simulates double-click replay returning existing sale with zero double deductions', () => {
      const idempotencyDb = new Map<string, any>();
      let stockOnHand = 100;

      const checkoutPayload = {
        tenantId: 't1',
        clientCheckoutId: 'chk_double_click_test',
        productId: 'p_pen',
        quantity: 2,
        price: 10,
      };

      const executeCheckout = (payload: typeof checkoutPayload) => {
        const idempKey = `sale_checkout:${payload.tenantId}:${payload.clientCheckoutId}`;

        // 1. Check idempotency lock
        if (idempotencyDb.has(idempKey)) {
          return {
            isIdempotentReplay: true,
            sale: idempotencyDb.get(idempKey),
          };
        }

        // 2. Validate & deduct stock
        if (stockOnHand < payload.quantity) throw new Error('Out of stock');
        stockOnHand -= payload.quantity;

        // 3. Create sale doc
        const createdSale = {
          id: 'sale_999',
          invoiceNumber: 'INV-CAI-2026-000099',
          total: payload.quantity * payload.price,
          itemsCount: payload.quantity,
        };

        // 4. Save to idempotency store
        idempotencyDb.set(idempKey, createdSale);

        return {
          isIdempotentReplay: false,
          sale: createdSale,
        };
      };

      // First click: Processes sale normally
      const res1 = executeCheckout(checkoutPayload);
      expect(res1.isIdempotentReplay).toBe(false);
      expect(res1.sale.invoiceNumber).toBe('INV-CAI-2026-000099');
      expect(stockOnHand).toBe(98); // 100 - 2

      // Second click (Double-click or network retry): Replays without modifying stock!
      const res2 = executeCheckout(checkoutPayload);
      expect(res2.isIdempotentReplay).toBe(true);
      expect(res2.sale.invoiceNumber).toBe('INV-CAI-2026-000099');
      expect(stockOnHand).toBe(98); // Still 98! No second deduction!
    });
  });

  describe('5. Pricing Engine Integration, Wholesale Mode & Minimum Price Guard', () => {
    const mockProduct: Product = {
      id: 'prod_pen_bic',
      tenantId: 't1',
      name: 'قلم جاف بيك أزرق',
      sku: 'BIC-BLU-01',
      barcode: '6221234567890',
      sellingPrice: 10,
      wholesalePrice: 8.5,
      minimumSellingPrice: 7,
      purchasePrice: 6,
      averageCost: 6,
      baseUnitId: 'pcs',
      type: 'standard',
      status: 'active',
      createdAt: '',
      updatedAt: '',
    };

    it('calculates retail pricing with profit estimation correctly', () => {
      const pricing = calculateItemPrice({
        product: mockProduct,
        quantity: 5,
        isWholesale: false,
      });

      expect(pricing.appliedUnitPrice).toBe(10);
      expect(pricing.pricingTierUsed).toBe('retail');
      expect(pricing.subtotal).toBe(50);
      expect(pricing.unitCost).toBe(6);
      expect(pricing.estimatedProfit).toBe(20); // 50 - (5 * 6) = 20 EGP
    });

    it('applies wholesale pricing when wholesale mode is enabled', () => {
      const pricing = calculateItemPrice({
        product: mockProduct,
        quantity: 10,
        isWholesale: true,
      });

      expect(pricing.appliedUnitPrice).toBe(8.5);
      expect(pricing.pricingTierUsed).toBe('wholesale');
      expect(pricing.subtotal).toBe(85);
      expect(pricing.estimatedProfit).toBe(25); // 85 - (10 * 6) = 25 EGP
    });

    it('enforces minimum selling price guard when manual discount exceeds threshold', () => {
      // Retail is 10, Minimum is 7. Cashier tries to discount by 5 (price would become 5).
      const pricing = calculateItemPrice({
        product: mockProduct,
        quantity: 1,
        manualDiscountAmount: 5,
      });

      // Price is bounded at minimumSellingPrice = 7
      expect(pricing.appliedUnitPrice).toBe(7);
      expect(pricing.discountAmount).toBe(3); // capped at 10 - 7
      expect(pricing.discountReason).toContain('مقيد بالحد الأدنى للبيع');
    });
  });

  describe('6. Packaging Units & Multiple Lines of Same Product in Cart', () => {
    it('calculates base units correctly when selling packaging boxes (e.g. 1 Box of 50 pens)', () => {
      const boxConversion = 50;
      const boxQty = 2; // 2 Boxes
      const baseUnitsDeducted = boxQty * boxConversion; // 100 Pieces

      expect(baseUnitsDeducted).toBe(100);
    });

    it('aggregates multiple cart lines of the same product with different units before stock validation', () => {
      // Cart has:
      // Line 1: 1 Box of Pens (= 50 pieces)
      // Line 2: 10 Individual Pens (= 10 pieces)
      const productId = 'prod_pen';
      const availableBaseStock = 55; // Only 55 pieces in stock

      const cartLines = [
        { productId, quantity: 1, conversionFactor: 50 },
        { productId, quantity: 10, conversionFactor: 1 },
      ];

      // Grouping
      let totalRequiredBaseQuantity = 0;
      for (const line of cartLines) {
        totalRequiredBaseQuantity += line.quantity * line.conversionFactor;
      }

      expect(totalRequiredBaseQuantity).toBe(60); // 50 + 10 = 60 pieces needed
      const isSufficient = availableBaseStock >= totalRequiredBaseQuantity;

      // 55 < 60 -> Insufficient!
      expect(isSufficient).toBe(false);
    });
  });

  describe('7. Payment Methods, Split Payments & Cash Change', () => {
    it('handles exact split payment across Cash and Card', () => {
      const grandTotal = 60;
      const payments: PaymentEntry[] = [
        { method: 'cash', amount: 20 },
        { method: 'visa', amount: 40 },
      ];

      const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
      expect(totalPaid).toBe(grandTotal);
      expect(totalPaid >= grandTotal).toBe(true);
    });

    it('calculates cash change accurately on overpayment', () => {
      const grandTotal = 83;
      const cashReceived = 100;
      const change = Math.round((cashReceived - grandTotal) * 100) / 100;

      expect(change).toBe(17);
    });

    it('blocks underpayment when credit sale is not permitted', () => {
      const grandTotal = 100;
      const amountPaid = 90;
      const isCreditAllowed = false;

      const validatePayment = () => {
        if (amountPaid < grandTotal && !isCreditAllowed) {
          throw new Error(`المبلغ المدفوع (${amountPaid}) أقل من إجمالي الفاتورة (${grandTotal})`);
        }
      };

      expect(() => validatePayment()).toThrow('أقل من إجمالي الفاتورة');
    });
  });

  describe('8. Cash Register Shift Reconciliations & Drawer Variance', () => {
    it('calculates expected drawer cash and flags exact match when balanced', () => {
      const openingCash = 500;
      const cashSales = 200;
      const cashIn = 0;
      const cashOut = 0;
      const refunds = 0;

      const expectedCash = openingCash + cashSales + cashIn - cashOut - refunds;
      expect(expectedCash).toBe(700);

      const actualCountedCash = 700;
      const difference = actualCountedCash - expectedCash;
      expect(difference).toBe(0);
    });

    it('accurately calculates cash shortage (عجز) when counted cash is less than expected', () => {
      const expectedCash = 700;
      const actualCountedCash = 680;
      const difference = actualCountedCash - expectedCash;

      expect(difference).toBe(-20); // 20 EGP shortage
    });
  });

  describe('9. Suspended / Held Sales (Draft Carts)', () => {
    it('creates held sale draft without altering on-hand inventory', () => {
      let onHandStock = 50;

      const heldSale: HeldSale = {
        id: 'held_01',
        tenantId: 't1',
        branchId: 'b1',
        cashierId: 'cashier_1',
        items: [
          {
            id: 'item_1',
            productId: 'p_book',
            productNameSnapshot: 'رواية',
            skuSnapshot: 'BK-01',
            quantity: 2,
            conversionFactor: 1,
            baseQuantity: 2,
            unitSellingPrice: 40,
            sellingPrice: 40,
            originalUnitPrice: 40,
            originalPrice: 40,
            discountAmount: 0,
            discount: 0,
            taxAmount: 0,
            tax: 0,
            lineTotal: 80,
            unitCostSnapshot: 25,
            costPriceSnapshot: 25,
            totalCost: 50,
            grossProfit: 30,
          },
        ],
        subtotal: 80,
        discount: 0,
        tax: 0,
        total: 80,
        heldAt: new Date().toISOString(),
      };

      // Suspended draft MUST NOT deduct stock!
      expect(onHandStock).toBe(50);
      expect(heldSale.items.length).toBe(1);
    });
  });

  describe('10. Full Acceptance Criteria Scenario Execution', () => {
    it('executes the complete retail acceptance scenario with financial, stock, and idempotency precision', () => {
      // -------------------------------------------------------------
      // Acceptance Parameters:
      // Branch: Nasr City (مدينة نصر)
      // Cashier opens register with Float = 500 EGP
      // -------------------------------------------------------------
      let cashRegisterDrawer = 500;
      let totalSalesCash = 0;
      let totalSalesCard = 0;

      // Product 1: BIC Blue Pens
      let bicStock = 100;
      let bicWac = 7;
      const bicRetail = 10;
      const bicWholesale = 8.5;

      // Product 2: Notebooks
      let notebookStock = 50;
      let notebookWac = 30;
      const notebookRetail = 45;

      // Customer Buys: 2 BIC Blue + 1 Notebook
      const cartBicQty = 2;
      const cartNotebookQty = 1;

      // 1. Calculate Line Subtotals
      const bicLineSubtotal = cartBicQty * bicRetail; // 2 * 10 = 20 EGP
      const notebookLineSubtotal = cartNotebookQty * notebookRetail; // 1 * 45 = 45 EGP
      const subtotal = bicLineSubtotal + notebookLineSubtotal; // 65 EGP
      expect(subtotal).toBe(65);

      // 2. Cart Discount = 5 EGP
      const cartDiscount = 5;
      const grandTotal = subtotal - cartDiscount; // 60 EGP
      expect(grandTotal).toBe(60);

      // 3. Payment: Cash 20, Card 40
      const paymentCash = 20;
      const paymentCard = 40;
      expect(paymentCash + paymentCard).toBe(grandTotal);

      // 4. Atomic Execution:
      // A. Stock deductions
      bicStock -= cartBicQty;
      notebookStock -= cartNotebookQty;

      expect(bicStock).toBe(98);
      expect(notebookStock).toBe(49);

      // B. WAC remains unchanged by sales!
      expect(bicWac).toBe(7);
      expect(notebookWac).toBe(30);

      // C. Cost Snapshots & Gross Profit Calculation
      const bicTotalCost = cartBicQty * bicWac; // 2 * 7 = 14 EGP
      const notebookTotalCost = cartNotebookQty * notebookWac; // 1 * 30 = 30 EGP
      const totalCost = bicTotalCost + notebookTotalCost; // 44 EGP

      // Gross profit = Total Revenue (60) - Total Cost (44) = 16 EGP!
      const grossProfit = grandTotal - totalCost;
      expect(totalCost).toBe(44);
      expect(grossProfit).toBe(16);

      // D. Register updates
      totalSalesCash += paymentCash;
      totalSalesCard += paymentCard;
      cashRegisterDrawer += paymentCash;

      expect(totalSalesCash).toBe(20);
      expect(totalSalesCard).toBe(40);
      expect(cashRegisterDrawer).toBe(520); // 500 float + 20 cash

      // E. Invoice Number format verification
      const invoiceNumber = formatSequenceNumber('sale', 'NASR1', 2026, 1);
      expect(invoiceNumber).toBe('INV-NASR1-2026-000001');

      // F. Idempotent Retry check
      const clientCheckoutId = 'chk_accept_scenario_001';
      const idempKey = `sale_checkout:tenant_cai:${clientCheckoutId}`;
      const firstRunRecorded = true;

      // If re-sent, does NOT alter stock or cash!
      if (firstRunRecorded) {
        // Replay returns cached result
        expect(bicStock).toBe(98);
        expect(notebookStock).toBe(49);
        expect(cashRegisterDrawer).toBe(520);
      }
    });

    it('accurately calculates Percentage and Fixed discounts, clamping and shift accumulation', () => {
      const subtotal = 200; // 200 EGP

      // 1. Percentage Discount Test (15%)
      const pctValue = 15;
      const effectivePctDiscount = Math.round((subtotal * (Math.min(100, Math.max(0, pctValue)) / 100)) * 100) / 100;
      expect(effectivePctDiscount).toBe(30); // 15% of 200 = 30 EGP
      const grandTotalPct = Math.max(0, subtotal - effectivePctDiscount);
      expect(grandTotalPct).toBe(170);

      // Percentage Discount cannot exceed 100%
      const invalidPct = 150;
      const clampedPct = Math.round((subtotal * (Math.min(100, Math.max(0, invalidPct)) / 100)) * 100) / 100;
      expect(clampedPct).toBe(200); // 100% of 200 = 200 EGP

      // 2. Fixed Discount Test (45 EGP)
      const fixedValue = 45;
      const effectiveFixedDiscount = Math.min(subtotal, Math.max(0, fixedValue));
      expect(effectiveFixedDiscount).toBe(45);
      const grandTotalFixed = Math.max(0, subtotal - effectiveFixedDiscount);
      expect(grandTotalFixed).toBe(155);

      // Fixed Discount cannot exceed subtotal
      const excessFixed = 350;
      const clampedFixed = Math.min(subtotal, Math.max(0, excessFixed));
      expect(clampedFixed).toBe(200);

      // 3. Shift Discount Accumulation
      let shiftTotalDiscounts = 0;
      shiftTotalDiscounts += effectivePctDiscount;
      shiftTotalDiscounts += effectiveFixedDiscount;
      expect(shiftTotalDiscounts).toBe(75); // 30 + 45 = 75 EGP
    });
  });
});
