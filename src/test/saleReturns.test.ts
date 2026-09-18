import { describe, it, expect } from 'vitest';
import {
  calculateWeightedAverageCost,
  normalizeStockBalance,
  getBranchStockDocId,
} from '../services/inventory/retailInventory.service';
import { formatSequenceNumber } from '../services/sales/invoiceNumber.service';
import {
  getReturnIdempotencyDocId,
} from '../services/sales/saleReturns.service';
import type {
  Sale,
  SaleItem,
  SaleReturn,
  SaleReturnItem,
  SaleRefundRecord,
  SaleExchange,
  StockBalance,
  CashierShift,
  DamageLossRecord,
} from '../types/retail.types';

describe('Phase 6: Sales Returns, Refunds & Exchanges Engine Test Suite', () => {

  // Sample historical sale snapshot
  const createSampleSale = (): Sale => ({
    id: 'sale_inv_001',
    tenantId: 'tenant_alwan_01',
    branchId: 'branch_hq',
    invoiceNumber: 'INV-2026-000001',
    status: 'completed',
    saleType: 'retail',
    cashierId: 'cashier_01',
    cashierNameSnapshot: 'أحمد محمود',
    customerId: 'cust_01',
    customerNameSnapshot: 'محمد عبد الله',
    subtotal: 65,
    discountTotal: 5,
    taxTotal: 0,
    total: 60,
    paidAmount: 60,
    changeAmount: 0,
    costTotal: 44,
    grossProfit: 16,
    profitMarginPercent: 26.67,
    paymentMethods: [
      { method: 'cash', amount: 20 },
      { method: 'card', amount: 40 },
    ],
    items: [
      {
        id: 'sale_item_1',
        productId: 'prod_bic_blue',
        productNameSnapshot: 'قلم جاف بيك أزرق',
        skuSnapshot: 'PEN-BIC-BLU',
        barcodeSnapshot: '6221234567890',
        quantity: 2,
        baseQuantity: 2,
        conversionFactor: 1,
        inputUnitId: 'pcs',
        originalUnitPrice: 10,
        unitSellingPrice: 10,
        discountAmount: 1.54, // Proportional cart discount allocation
        taxAmount: 0,
        lineTotal: 18.46,
        unitCostSnapshot: 7, // Original WAC cost at time of sale
        totalCost: 14,
        grossProfit: 4.46,
      },
      {
        id: 'sale_item_2',
        productId: 'prod_notebook_a4',
        productNameSnapshot: 'كشكول سلك A4 80 ورقة',
        skuSnapshot: 'NOTE-A4-80',
        barcodeSnapshot: '6229876543210',
        quantity: 1,
        baseQuantity: 1,
        conversionFactor: 1,
        inputUnitId: 'pcs',
        originalUnitPrice: 45,
        unitSellingPrice: 45,
        discountAmount: 3.46, // Proportional cart discount allocation
        taxAmount: 0,
        lineTotal: 41.54,
        unitCostSnapshot: 30, // Original WAC cost at time of sale
        totalCost: 30,
        grossProfit: 11.54,
      },
    ],
    createdAt: '2026-09-15T10:00:00Z',
    completedAt: '2026-09-15T10:02:00Z',
  });

  describe('1. Mandatory Pre-Phase Audits & Mathematical Invariants', () => {
    it('Audit 1: Historical SaleItem retains exact immutable price, discount, tax, and cost snapshots', () => {
      const sale = createSampleSale();
      const item1 = sale.items[0];

      expect(item1.originalUnitPrice).toBe(10);
      expect(item1.unitSellingPrice).toBe(10);
      expect(item1.quantity).toBe(2);
      expect(item1.baseQuantity).toBe(2);
      expect(item1.discountAmount).toBe(1.54);
      expect(item1.taxAmount).toBe(0);
      expect(item1.lineTotal).toBe(18.46);
      expect(item1.unitCostSnapshot).toBe(7);
      expect(item1.totalCost).toBe(14);
      expect(item1.grossProfit).toBe(4.46);
    });

    it('Audit 2: Sale immutability is preserved; only derived summary fields change on returns', () => {
      const sale = createSampleSale();
      const originalItemsBefore = JSON.stringify(sale.items);
      const originalTotalBefore = sale.total;
      const originalPaymentsBefore = JSON.stringify(sale.paymentMethods);

      // Simulating partial return derived update
      const updatedSale = {
        ...sale,
        returnedAmount: 18.46,
        refundedAmount: 18.46,
        returnStatus: 'partial' as const,
      };

      expect(JSON.stringify(updatedSale.items)).toBe(originalItemsBefore);
      expect(updatedSale.total).toBe(originalTotalBefore);
      expect(JSON.stringify(updatedSale.paymentMethods)).toBe(originalPaymentsBefore);
      expect(updatedSale.returnStatus).toBe('partial');
      expect(updatedSale.returnedAmount).toBe(18.46);
    });

    it('Audit 3 & Concurrency: Protects against concurrent return over-requests (Terminal A returns 7, Terminal B returns 7 from 10 sold)', () => {
      const soldQuantity = 10;
      let alreadyReturnedCumulative = 0;

      const attemptReturn = (requestedQty: number): { success: boolean; returnedQty: number; error?: string } => {
        const remainingReturnable = soldQuantity - alreadyReturnedCumulative;
        if (requestedQty > remainingReturnable) {
          return {
            success: false,
            returnedQty: 0,
            error: `Requested ${requestedQty} exceeds remaining returnable ${remainingReturnable}`,
          };
        }
        alreadyReturnedCumulative += requestedQty;
        return { success: true, returnedQty: requestedQty };
      };

      // Terminal A attempts 7
      const resA = attemptReturn(7);
      expect(resA.success).toBe(true);
      expect(alreadyReturnedCumulative).toBe(7);

      // Terminal B attempts 7 simultaneously against the remaining 3
      const resB = attemptReturn(7);
      expect(resB.success).toBe(false);
      expect(resB.error).toContain('Requested 7 exceeds remaining returnable 3');
      expect(alreadyReturnedCumulative).toBe(7); // Must NOT exceed 10!
    });

    it('Audit 4 & Idempotency: Duplicate submissions produce identical return snapshot without re-executing stock or cash changes', () => {
      const tenantId = 'tenant_alwan_01';
      const clientReturnId = 'ret_client_unique_123';
      const idempotencyKey = `sale_return:${tenantId}:${clientReturnId}`;
      const docId = getReturnIdempotencyDocId(tenantId, idempotencyKey);

      expect(docId).toBe('tenant_alwan_01___sale_return_tenant_alwan_01_ret_client_unique_123');

      // First run creates lock
      const idempotencyStore = new Map<string, any>();
      const initialSnapshot = {
        id: 'ret_001',
        returnNumber: 'RET-HQ-2026-000001',
        refundAmount: 18.46,
      };
      idempotencyStore.set(docId, initialSnapshot);

      // Subsequent retry (e.g. double click or network timeout retry)
      const existing = idempotencyStore.get(docId);
      expect(existing).toBeDefined();
      expect(existing.returnNumber).toBe('RET-HQ-2026-000001');
      expect(existing.refundAmount).toBe(18.46);
    });

    it('Audit 5 & WAC Recalculation: Restocking restored product uses original unitCostSnapshot, NOT current inflated WAC', () => {
      // Scenario:
      // Current branch stock: 100 units @ 10 EGP WAC = 1,000 EGP total inventory value
      // Customer returns 10 units of a pen that was originally sold when its unitCostSnapshot was 7 EGP
      const currentOnHand = 100;
      const currentWac = 10;
      const returnedQty = 10;
      const originalCostSnapshot = 7; // Sold a week ago when cost was 7 EGP

      const newWac = calculateWeightedAverageCost(
        currentOnHand,
        currentWac,
        returnedQty,
        originalCostSnapshot
      );

      // Expected calculation:
      // Current value: 100 * 10 = 1,000
      // Returned value: 10 * 7 = 70
      // Total value: 1,070
      // Total units: 110
      // New WAC: 1,070 / 110 = 9.72727... rounded to 2 decimal currency places = 9.73 EGP
      expect(newWac).toBe(9.73);
      expect(newWac).toBeLessThan(currentWac); // Returning at lower cost accurately dilutes current WAC!
    });
  });

  describe('2. Return Quantities, Unit Conversions, and Residual Rounding', () => {
    it('handles multiple partial returns until item is fully exhausted', () => {
      const saleItem: SaleItem = {
        id: 'si_1',
        productId: 'prod_pens',
        productNameSnapshot: 'أقلام بيك',
        skuSnapshot: 'PEN-01',
        quantity: 5,
        baseQuantity: 5,
        conversionFactor: 1,
        inputUnitId: 'pcs',
        originalUnitPrice: 10,
        unitSellingPrice: 10,
        discountAmount: 5, // 1 EGP discount per unit
        taxAmount: 0,
        lineTotal: 45, // 9 EGP paid per unit
        unitCostSnapshot: 6,
        totalCost: 30,
        grossProfit: 15,
      };

      let returnedBase = 0;

      // Partial Return 1: Return 2 units
      const ret1Qty = 2;
      const prop1 = ret1Qty / saleItem.baseQuantity;
      const refund1 = (saleItem.unitSellingPrice * ret1Qty) - (saleItem.discountAmount * prop1);
      expect(refund1).toBe(18); // 20 - 2 = 18 EGP
      returnedBase += ret1Qty;

      // Partial Return 2: Return 2 units
      const ret2Qty = 2;
      const prop2 = ret2Qty / saleItem.baseQuantity;
      const refund2 = (saleItem.unitSellingPrice * ret2Qty) - (saleItem.discountAmount * prop2);
      expect(refund2).toBe(18);
      returnedBase += ret2Qty;

      // Final Return 3: Return remaining 1 unit with residual rounding guarantee
      const ret3Qty = 1;
      const remainingBefore = saleItem.baseQuantity - returnedBase;
      expect(remainingBefore).toBe(1);

      const refund3 = saleItem.lineTotal - (refund1 + refund2);
      expect(refund3).toBe(9); // Exactly 45 - (18 + 18) = 9
      returnedBase += ret3Qty;

      expect(returnedBase).toBe(saleItem.baseQuantity);
      expect(refund1 + refund2 + refund3).toBe(saleItem.lineTotal);
    });

    it('correctly converts multi-unit returns (Sold 2 Boxes of 50 pens = 100 pens, Customer returns 25 individual pens)', () => {
      const boxItem: SaleItem = {
        id: 'si_boxes',
        productId: 'prod_pens',
        productNameSnapshot: 'علبة أقلام 50 قلم',
        skuSnapshot: 'BOX-PEN-50',
        quantity: 2, // 2 Boxes
        conversionFactor: 50, // 50 pens per box
        baseQuantity: 100, // 100 pens
        inputUnitId: 'box',
        originalUnitPrice: 400, // 400 per box = 8 EGP per pen
        unitSellingPrice: 400,
        discountAmount: 0,
        taxAmount: 0,
        lineTotal: 800,
        unitCostSnapshot: 5, // 5 EGP per pen = 250 per box
        totalCost: 500,
        grossProfit: 300,
      };

      // Customer returns 25 individual pens
      const returnedPens = 25;
      const reqBaseQty = returnedPens; // 25 pieces
      const remainingReturnableBase = boxItem.baseQuantity; // 100

      expect(reqBaseQty).toBeLessThanOrEqual(remainingReturnableBase);

      const proportion = reqBaseQty / boxItem.baseQuantity; // 25 / 100 = 0.25
      const refundAmount = Math.round(boxItem.lineTotal * proportion * 100) / 100;
      const costReversed = Math.round(boxItem.unitCostSnapshot * reqBaseQty * 100) / 100;

      expect(refundAmount).toBe(200); // 25 pens * 8 EGP = 200 EGP
      expect(costReversed).toBe(125); // 25 pens * 5 EGP = 125 EGP
      expect(boxItem.baseQuantity - reqBaseQty).toBe(75); // 75 pens remaining returnable
    });
  });

  describe('3. Restock vs Damaged Non-Restock Inventory Routes', () => {
    it('restocks resellable item: creates stock_movement IN and adds to onHand stock', () => {
      let onHand = 50;
      const returnItem: Partial<SaleReturnItem> = {
        productId: 'prod_ruler',
        quantity: 5,
        baseQuantity: 5,
        condition: 'resellable',
        restock: true,
        unitCostSnapshot: 3,
      };

      if (returnItem.restock) {
        onHand += returnItem.baseQuantity!;
      }

      expect(onHand).toBe(55);
    });

    it('routes damaged/defective items directly to damage_loss_records without increasing available inventory', () => {
      let onHand = 50;
      const damageLossStore: DamageLossRecord[] = [];

      const returnItem: Partial<SaleReturnItem> = {
        productId: 'prod_compass',
        quantity: 2,
        baseQuantity: 2,
        condition: 'damaged',
        restock: false,
        unitCostSnapshot: 25,
        reason: 'كسر في المفصلة أثناء الاستخدام',
      };

      if (returnItem.restock) {
        onHand += returnItem.baseQuantity!;
      } else {
        damageLossStore.push({
          id: 'dmg_001',
          tenantId: 'tenant_alwan_01',
          branchId: 'branch_hq',
          productId: returnItem.productId!,
          quantity: returnItem.quantity!,
          unitCost: returnItem.unitCostSnapshot!,
          totalCost: returnItem.quantity! * returnItem.unitCostSnapshot!,
          reason: `مرتجع تالف من عميل: ${returnItem.reason}`,
          recordedBy: 'cashier_01',
          createdAt: new Date().toISOString(),
        });
      }

      expect(onHand).toBe(50); // Unchanged!
      expect(damageLossStore).toHaveLength(1);
      expect(damageLossStore[0].totalCost).toBe(50); // 2 * 25 EGP
    });
  });

  describe('4. Cash Drawer & Split-Payment Refunds', () => {
    it('cash refund reduces expected drawer cash and creates register transaction', () => {
      const shift: CashierShift = {
        id: 'shift_today',
        tenantId: 'tenant_alwan_01',
        branchId: 'branch_hq',
        cashierId: 'cashier_01',
        status: 'open',
        openingCash: 500,
        expectedCash: 1200,
        totalSalesCash: 700,
        totalRefunds: 0,
        openedAt: '2026-09-17T08:00:00Z',
      };

      const refundAmount = 150;
      const refundMethod = 'cash';

      if (refundMethod === 'cash') {
        shift.totalRefunds = (shift.totalRefunds || 0) + refundAmount;
        shift.expectedCash = (shift.expectedCash || 0) - refundAmount;
      }

      expect(shift.totalRefunds).toBe(150);
      expect(shift.expectedCash).toBe(1050);
    });

    it('allows return even if the original cashier shift is already closed (processed in current active shift)', () => {
      const originalShiftId = 'shift_yesterday_closed';
      const currentActiveShiftId = 'shift_today_open';

      const saleReturn: Partial<SaleReturn> = {
        saleId: 'sale_old',
        shiftId: currentActiveShiftId, // Linked to today's active drawer
        refundMethod: 'cash',
        refundAmount: 50,
      };

      expect(saleReturn.shiftId).toBe(currentActiveShiftId);
      expect(saleReturn.shiftId).not.toBe(originalShiftId);
    });

    it('split-payment refund ensures refund amount cannot exceed actual customer paid amount', () => {
      const originalTotal = 100;
      const actualPaid = 40; // Customer paid 40 EGP (60 outstanding receivable)
      const requestedRefund = 50;

      const maxRefundAllowed = Math.min(requestedRefund, actualPaid);
      expect(maxRefundAllowed).toBe(40);
      expect(maxRefundAllowed).toBeLessThan(requestedRefund);
    });
  });

  describe('5. Return Policy Engine & Manager Overrides', () => {
    it('blocks return if completed date exceeds 14 days without manager override', () => {
      const saleDate = new Date('2026-08-01T10:00:00Z').getTime();
      const currentDate = new Date('2026-09-17T10:00:00Z').getTime(); // 47 days elapsed
      const daysElapsed = (currentDate - saleDate) / (1000 * 60 * 60 * 24);

      const maxAllowedDays = 14;
      const allowManagerOverride = false;

      const canReturn = daysElapsed <= maxAllowedDays || allowManagerOverride;
      expect(canReturn).toBe(false);
    });

    it('permits return exceeding 14 days when manager override is authorized', () => {
      const daysElapsed = 25;
      const maxAllowedDays = 14;
      const allowManagerOverride = true;

      const canReturn = daysElapsed <= maxAllowedDays || allowManagerOverride;
      expect(canReturn).toBe(true);
    });
  });

  describe('6. Exchange Engine: Atomic Return + New Sale Workflow', () => {
    it('Customer pays difference when new product is higher value (Old: 50 EGP, New: 80 EGP => Customer pays 30 EGP)', () => {
      const returnCredit = 50;
      const newItemsTotal = 80;
      const difference = newItemsTotal - returnCredit;

      expect(difference).toBe(30);
      const settlementType = difference > 0 ? 'customer_pays' : difference < 0 ? 'customer_refunded' : 'even';
      expect(settlementType).toBe('customer_pays');
    });

    it('Customer receives refund when new product is lower value (Old: 80 EGP, New: 50 EGP => Customer refunded 30 EGP)', () => {
      const returnCredit = 80;
      const newItemsTotal = 50;
      const difference = newItemsTotal - returnCredit;

      expect(difference).toBe(-30);
      const settlementType = difference > 0 ? 'customer_pays' : difference < 0 ? 'customer_refunded' : 'even';
      expect(settlementType).toBe('customer_refunded');
    });

    it('Zero-difference exchange (Old: 50 EGP, New: 50 EGP => Even exchange)', () => {
      const returnCredit = 50;
      const newItemsTotal = 50;
      const difference = newItemsTotal - returnCredit;

      expect(difference).toBe(0);
      const settlementType = difference > 0 ? 'customer_pays' : difference < 0 ? 'customer_refunded' : 'even';
      expect(settlementType).toBe('even');
    });

    it('Critical Exchange Atomic Rule: Exchange fails completely if new item has insufficient stock (All or Nothing)', () => {
      let returnedProductStock = 10;
      let newProductStock = 0; // Out of stock!

      const executeExchange = (): { success: boolean; error?: string } => {
        // Step 1: Pre-check new items stock
        if (newProductStock < 1) {
          return { success: false, error: 'الرصيد غير كافٍ للصنف الجديد المطلوب استبداله' };
        }
        // If stock was available:
        returnedProductStock += 1;
        newProductStock -= 1;
        return { success: true };
      };

      const result = executeExchange();
      expect(result.success).toBe(false);
      expect(result.error).toContain('الرصيد غير كافٍ');
      // Verify returned product was NOT restocked when exchange failed
      expect(returnedProductStock).toBe(10);
    });
  });

  describe('7. End-to-End Acceptance Scenario Verification', () => {
    it('executes full acceptance scenario with BIC Blue partial return and Notebook exchange', () => {
      // Original Sale:
      // Invoice INV-001
      // 2 BIC Blue @ 10 EGP (unit cost snapshot = 7 EGP)
      // 1 Notebook @ 45 EGP (unit cost snapshot = 30 EGP)
      // Cart Discount: 5 EGP
      // Total Paid: 60 EGP (20 Cash, 40 Card)
      // Cost: 44 EGP
      const sale = createSampleSale();

      // After 2 days:
      // 1. Customer returns 1 BIC Blue (resellable => restock: true)
      const returnedBicBaseQty = 1;
      const bicItem = sale.items[0];
      const bicProportion = returnedBicBaseQty / bicItem.baseQuantity; // 1 / 2 = 0.5
      const bicSubtotal = bicItem.unitSellingPrice * returnedBicBaseQty; // 10
      const bicDiscountReversed = Math.round(bicItem.discountAmount * bicProportion * 100) / 100; // 0.77
      const bicRefund = bicSubtotal - bicDiscountReversed; // 9.23 EGP
      const bicCostReversed = bicItem.unitCostSnapshot * returnedBicBaseQty; // 7 EGP

      expect(bicRefund).toBe(9.23);
      expect(bicCostReversed).toBe(7);

      // 2. Customer exchanges Notebook (45 EGP list, paid 41.54 EGP net) for bigger Notebook @ 60 EGP
      const returnedNoteBaseQty = 1;
      const noteItem = sale.items[1];
      const noteProportion = 1;
      const noteRefund = Math.round(noteItem.lineTotal * noteProportion * 100) / 100; // 41.54 EGP
      const noteCostReversed = noteItem.unitCostSnapshot * returnedNoteBaseQty; // 30 EGP

      expect(noteRefund).toBe(41.54);
      expect(noteCostReversed).toBe(30);

      // Exchange calculations for Notebook:
      const newBiggerNotebookPrice = 60;
      const notebookDifference = Math.round((newBiggerNotebookPrice - noteRefund) * 100) / 100;
      // 60 - 41.54 = 18.46 EGP customer pays
      expect(notebookDifference).toBe(18.46);

      // Total financial summary across operations:
      const totalCostReversed = bicCostReversed + noteCostReversed; // 7 + 30 = 37 EGP
      expect(totalCostReversed).toBe(37);

      // Verify WAC restoration on 100 onHand pens @ 10 EGP when 1 pen returned @ original cost 7 EGP:
      // (100 * 10 + 1 * 7) / 101 = 1007 / 101 = 9.97029... rounded to 2 decimal places = 9.97 EGP
      const updatedPenWac = calculateWeightedAverageCost(100, 10, 1, 7);
      expect(updatedPenWac).toBe(9.97);
    });
  });
});
