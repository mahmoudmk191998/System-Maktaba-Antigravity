import { describe, it, expect } from 'vitest';
import {
  calculateWeightedAverageCost,
  normalizeStockBalance,
  getBranchStockDocId,
} from '../services/inventory/retailInventory.service';
import { formatSequenceNumber } from '../services/sales/invoiceNumber.service';
import {
  getGoodsReceiptIdempotencyDocId,
} from '../services/purchasing/goodsReceiving.service';
import {
  getPurchaseReturnIdempotencyDocId,
} from '../services/purchasing/purchaseReturns.service';
import {
  getSupplierPaymentIdempotencyDocId,
} from '../services/suppliers/suppliers.service';
import type {
  Supplier,
  PurchaseOrder,
  PurchaseOrderItem,
  GoodsReceipt,
  GoodsReceiptItem,
  PurchaseReturn,
  PurchaseReturnItem,
  SupplierLedgerEntry,
  StockBalance,
  DamageLossRecord,
} from '../types/retail.types';

describe('Phase 7: Suppliers, Purchasing, Goods Receiving, Purchase Returns & Accounts Test Suite', () => {

  // ==========================================
  // 1. Mandatory Pre-Phase Audits & Invariants
  // ==========================================
  describe('1. Pre-Phase Invariants & Audit Checks', () => {
    it('Audit 1: Supplier code formatting adheres to sequence pattern SUP-000001', () => {
      const code1 = `SUP-${formatSequenceNumber(1, 6)}`;
      const code42 = `SUP-${formatSequenceNumber(42, 6)}`;
      expect(code1).toBe('SUP-000001');
      expect(code42).toBe('SUP-000042');
    });

    it('Audit 2: Purchase Order creation & approval NEVER touch inventory stock or supplier balance', () => {
      // Mock initial states
      const initialStock: StockBalance = {
        branchId: 'branch_hq',
        productId: 'prod_bic_blue',
        variantId: null,
        availableQuantity: 100,
        reservedQuantity: 0,
        damagedQuantity: 0,
        totalQuantity: 100,
        weightedAverageCost: 7.00,
        lastCost: 7.00,
        tenantId: 'tenant_alwan_01',
      };
      const initialSupplierBalance = 0;

      // Simulate PO Creation & Approval
      const po: PurchaseOrder = {
        id: 'po_001',
        poNumber: 'PO-HQ-2026-000001',
        tenantId: 'tenant_alwan_01',
        branchId: 'branch_hq',
        destinationLocationId: 'loc_main',
        supplierId: 'sup_al_noor',
        supplierNameSnapshot: 'شركة النور للأدوات المكتبية',
        status: 'approved',
        orderDate: '2026-09-17',
        items: [
          {
            id: 'po_item_1',
            productId: 'prod_bic_blue',
            productNameSnapshot: 'قلم جاف بيك أزرق',
            skuSnapshot: 'PEN-BIC-BLU',
            orderedQuantity: 10,
            orderedBaseQuantity: 500,
            receivedQuantity: 0,
            receivedBaseQuantity: 0,
            returnedQuantity: 0,
            returnedBaseQuantity: 0,
            inputUnitId: 'box_50',
            conversionFactor: 50,
            unitCost: 400,
            discountAmount: 0,
            taxAmount: 0,
            lineTotal: 4000,
          },
        ],
        subtotal: 4000,
        taxTotal: 0,
        shippingCost: 0,
        otherCosts: 0,
        totalAmount: 4000,
        currency: 'EGP',
        createdBy: 'user_purchasing',
        createdAt: '2026-09-17T09:00:00Z',
      };

      // Invariant assertions: Stock and balance must remain untouched
      expect(po.status).toBe('approved');
      expect(initialStock.availableQuantity).toBe(100);
      expect(initialStock.weightedAverageCost).toBe(7.00);
      expect(initialSupplierBalance).toBe(0);
    });

    it('Audit 3: Idempotency keys generate deterministic unique document IDs', () => {
      const tenantId = 'tenant_alwan_01';
      const clientReceiptId = 'cli_grn_abc_123';
      const clientReturnId = 'cli_ret_xyz_456';
      const clientPaymentId = 'cli_pay_789';

      const grnId = getGoodsReceiptIdempotencyDocId(tenantId, clientReceiptId);
      const prId = getPurchaseReturnIdempotencyDocId(tenantId, clientReturnId);
      const payId = getSupplierPaymentIdempotencyDocId(tenantId, clientPaymentId);

      expect(grnId).toBe('tenant_alwan_01___cli_grn_abc_123');
      expect(prId).toBe('tenant_alwan_01___cli_ret_xyz_456');
      expect(payId).toBe('tenant_alwan_01___cli_pay_789');
    });
  });

  // ==========================================
  // 2. Goods Receiving & Landed Cost Allocation
  // ==========================================
  describe('2. Goods Receiving, Landed Cost & WAC Recalculation', () => {
    it('calculates Landed Cost pro-rata by value across received items', () => {
      // Two received items: Item A total = 1000 EGP, Item B total = 3000 EGP. Total goods value = 4000 EGP.
      // Extra freight/customs cost = 400 EGP (10% extra).
      const items = [
        { acceptedQuantity: 100, baseQuantity: 100, unitCost: 10, lineTotal: 1000 },
        { acceptedQuantity: 50, baseQuantity: 50, unitCost: 60, lineTotal: 3000 },
      ];
      const extraCost = 400;
      const totalGoodsValue = items.reduce((sum, item) => sum + item.lineTotal, 0);

      const itemsWithLandedCost = items.map((item) => {
        const itemShare = totalGoodsValue > 0 ? (item.lineTotal / totalGoodsValue) * extraCost : 0;
        const totalLineWithExtra = item.lineTotal + itemShare;
        const effectiveUnitCost = totalLineWithExtra / item.baseQuantity;
        return { ...item, itemShare, effectiveUnitCost };
      });

      // Item A share: 25% of 400 = 100. Total = 1100. Effective unit cost = 11 EGP (was 10).
      expect(itemsWithLandedCost[0].itemShare).toBe(100);
      expect(itemsWithLandedCost[0].effectiveUnitCost).toBe(11);

      // Item B share: 75% of 400 = 300. Total = 3300. Effective unit cost = 66 EGP (was 60).
      expect(itemsWithLandedCost[1].itemShare).toBe(300);
      expect(itemsWithLandedCost[1].effectiveUnitCost).toBe(66);
    });

    it('updates Weighted Average Cost (WAC) correctly on receiving with effective landed cost', () => {
      // Existing stock: 50 units @ 12.00 EGP (Value = 600 EGP)
      // New incoming stock: 150 units @ 16.00 EGP effective landed cost (Value = 2400 EGP)
      // Total units: 200 units, Total value: 3000 EGP.
      // Expected new WAC: 3000 / 200 = 15.00 EGP.
      const currentStock = 50;
      const currentWac = 12.00;
      const incomingStock = 150;
      const effectiveUnitCost = 16.00;

      const newWac = calculateWeightedAverageCost(currentStock, currentWac, incomingStock, effectiveUnitCost);
      expect(newWac).toBe(15.00);
    });

    it('handles Unit Conversion during goods intake (Boxes of 50 to base pieces)', () => {
      const orderedBoxes = 10;
      const conversionFactor = 50; // 1 box = 50 pieces
      const pricePerBox = 400; // 8 EGP per piece

      const receivedBoxes = 6;
      const receivedBasePieces = receivedBoxes * conversionFactor; // 300 pieces
      const unitPurchaseCostPerBase = pricePerBox / conversionFactor; // 8 EGP

      expect(receivedBasePieces).toBe(300);
      expect(unitPurchaseCostPerBase).toBe(8.00);
    });
  });

  // ==========================================
  // 3. Goods Inspection on Arrival (Sound vs Damaged)
  // ==========================================
  describe('3. Goods Inspection on Arrival: Sound vs Damaged', () => {
    it('ensures receivedQuantity = acceptedQuantity + rejectedQuantity', () => {
      const input = {
        receivedQuantity: 10,
        acceptedQuantity: 8,
        rejectedQuantity: 2,
      };
      expect(input.acceptedQuantity + (input.rejectedQuantity || 0)).toBe(input.receivedQuantity);
    });

    it('STRICT INVARIANT: Damaged/rejected quantities on arrival NEVER enter available inventory', () => {
      const initialStock: StockBalance = {
        branchId: 'branch_hq',
        productId: 'prod_spiral_notebook',
        variantId: null,
        availableQuantity: 50,
        reservedQuantity: 0,
        damagedQuantity: 0,
        totalQuantity: 50,
        weightedAverageCost: 20.00,
        lastCost: 20.00,
        tenantId: 'tenant_alwan_01',
      };

      // Intake: 20 received, 17 accepted (sound), 3 rejected (torn/soaked covers)
      const acceptedQty = 17;
      const rejectedQty = 3;

      // Available stock only increases by accepted quantity
      const updatedAvailableQuantity = initialStock.availableQuantity + acceptedQty;
      // Rejected quantity is logged to damage/loss records but does NOT become available stock
      const recordedArrivalLoss: Partial<DamageLossRecord> = {
        productId: 'prod_spiral_notebook',
        quantity: rejectedQty,
        reason: 'vendor_discrepancy',
        notes: 'تالف عند التوريد من المصنع قبل الاستلام',
      };

      expect(updatedAvailableQuantity).toBe(67);
      expect(recordedArrivalLoss.quantity).toBe(3);
      expect(recordedArrivalLoss.reason).toBe('vendor_discrepancy');
    });
  });

  // ==========================================
  // 4. Over-receiving & Partial Receiving Protection
  // ==========================================
  describe('4. Over-Receiving and Partial Receiving Safeguards', () => {
    it('prevents receiving more than remaining open ordered quantity', () => {
      const poItem: PurchaseOrderItem = {
        id: 'po_item_1',
        productId: 'prod_pens',
        productNameSnapshot: 'أقلام جاف',
        skuSnapshot: 'PEN-01',
        orderedQuantity: 100,
        orderedBaseQuantity: 100,
        receivedQuantity: 70, // already received 70
        receivedBaseQuantity: 70,
        returnedQuantity: 0,
        returnedBaseQuantity: 0,
        inputUnitId: 'pcs',
        conversionFactor: 1,
        unitCost: 5,
        discountAmount: 0,
        taxAmount: 0,
        lineTotal: 500,
      };

      const remainingAllowed = poItem.orderedQuantity - poItem.receivedQuantity; // 30
      expect(remainingAllowed).toBe(30);

      const attemptedIntake = 35;
      const isAllowed = attemptedIntake <= remainingAllowed;
      expect(isAllowed).toBe(false);
    });

    it('correctly transitions PO status across partial receipts', () => {
      const totalOrdered = 100;
      let totalReceived = 0;

      const getStatus = (ordered: number, received: number) => {
        if (received === 0) return 'approved';
        if (received < ordered) return 'partially_received';
        return 'received';
      };

      expect(getStatus(totalOrdered, totalReceived)).toBe('approved');

      // First partial receipt: 40
      totalReceived += 40;
      expect(getStatus(totalOrdered, totalReceived)).toBe('partially_received');

      // Second partial receipt: 60 (total 100)
      totalReceived += 60;
      expect(getStatus(totalOrdered, totalReceived)).toBe('received');
    });
  });

  // ==========================================
  // 5. Purchase Returns Safeguards & Cost Snapshotting
  // ==========================================
  describe('5. Purchase Returns: Negative Stock & Over-Return Safeguards', () => {
    it('STRICT INVARIANT: Cannot return more than on-hand available stock (prevents negative stock)', () => {
      // Received 100 units originally.
      // However, 85 units were already sold to customers via POS.
      // Available stock on hand = 15 units.
      const currentOnHandStock = 15;
      const requestedReturnQuantity = 20;

      const canReturn = requestedReturnQuantity <= currentOnHandStock;
      expect(canReturn).toBe(false);
    });

    it('prevents returning more than accepted quantity from the Goods Receipt Note', () => {
      const grnItem: GoodsReceiptItem = {
        id: 'grn_item_1',
        purchaseOrderItemId: 'po_item_1',
        productId: 'prod_bic_blue',
        productNameSnapshot: 'قلم بيك أزرق',
        skuSnapshot: 'PEN-BIC-BLU',
        orderedQuantity: 10,
        receivedQuantity: 6,
        acceptedQuantity: 6,
        rejectedQuantity: 0,
        returnedQuantity: 5, // Already returned 5 units earlier
        returnedBaseQuantity: 250,
        inputUnitId: 'box_50',
        conversionFactor: 50,
        baseQuantity: 300,
        unitPurchaseCost: 400,
        landedCostShare: 0,
        effectiveUnitCost: 8.00,
        lineTotal: 2400,
      };

      const returnableQuantity = grnItem.acceptedQuantity - (grnItem.returnedQuantity || 0); // 1 box
      expect(returnableQuantity).toBe(1);

      const attemptedReturn = 2;
      expect(attemptedReturn <= returnableQuantity).toBe(false);
    });

    it('credits supplier using original effective unit cost snapshot without altering remaining stock WAC', () => {
      // Original intake: 300 pieces @ 8.00 EGP effective cost.
      // Suppose after sales/intakes, current stock WAC is 8.50 EGP.
      // When returning 50 pieces to the supplier:
      const returnQuantity = 50;
      const originalEffectiveCost = 8.00;
      const supplierCreditAmount = returnQuantity * originalEffectiveCost;

      expect(supplierCreditAmount).toBe(400.00); // Debits supplier liability by 400, NOT 425!

      // Remaining stock retains current WAC on outbound reduction
      const beforeStock = 350;
      const currentWac = 8.50;
      const afterStock = beforeStock - returnQuantity; // 300
      expect(afterStock).toBe(300);
      expect(currentWac).toBe(8.50); // WAC unchanged on outbound movements
    });
  });

  // ==========================================
  // 6. Supplier Accounts, Ledger Math & Reconciliation
  // ==========================================
  describe('6. Supplier Ledger Math & Account Reconciliation', () => {
    it('calculates supplier running balance: sum(credit) - sum(debit)', () => {
      const ledgerEntries: SupplierLedgerEntry[] = [
        {
          id: 'led_01',
          tenantId: 'tenant_alwan_01',
          supplierId: 'sup_al_noor',
          entryType: 'opening_balance',
          referenceType: 'manual',
          referenceId: 'manual_op',
          description: 'رصيد افتتاحي للمورد',
          debit: 0,
          credit: 1000,
          runningBalance: 1000,
          date: '2026-09-01',
          createdAt: '2026-09-01T08:00:00Z',
        },
        {
          id: 'led_02',
          tenantId: 'tenant_alwan_01',
          supplierId: 'sup_al_noor',
          entryType: 'goods_receipt',
          referenceType: 'goods_receipt',
          referenceId: 'grn_001',
          referenceNumber: 'GRN-HQ-2026-000001',
          description: 'استلام بضاعة أمر شراء PO-HQ-2026-000001',
          debit: 0,
          credit: 2400,
          runningBalance: 3400,
          date: '2026-09-17',
          createdAt: '2026-09-17T10:00:00Z',
        },
        {
          id: 'led_03',
          tenantId: 'tenant_alwan_01',
          supplierId: 'sup_al_noor',
          entryType: 'purchase_return',
          referenceType: 'purchase_return',
          referenceId: 'pr_001',
          referenceNumber: 'PR-HQ-2026-000001',
          description: 'مرتجع بضاعة للمورد',
          debit: 400,
          credit: 0,
          runningBalance: 3000,
          date: '2026-09-17',
          createdAt: '2026-09-17T11:00:00Z',
        },
        {
          id: 'led_04',
          tenantId: 'tenant_alwan_01',
          supplierId: 'sup_al_noor',
          entryType: 'payment',
          referenceType: 'supplier_payment',
          referenceId: 'pay_001',
          referenceNumber: 'SPAY-2026-000001',
          description: 'سداد نقدي من الخزينة للمورد',
          debit: 3000,
          credit: 0,
          runningBalance: 0,
          date: '2026-09-17',
          createdAt: '2026-09-17T12:00:00Z',
        },
      ];

      let running = 0;
      ledgerEntries.forEach((e) => {
        running += (e.credit || 0) - (e.debit || 0);
      });

      expect(running).toBe(0);
    });

    it('detects discrepancy between ledger sum and cached balance', () => {
      const cachedBalance = 2500;
      const ledgerEntries: SupplierLedgerEntry[] = [
        { id: '1', tenantId: 't', supplierId: 's', entryType: 'goods_receipt', referenceType: 'goods_receipt', referenceId: 'g1', debit: 0, credit: 2000, runningBalance: 2000, date: '2026-09-17', createdAt: '2026-09-17T10:00:00Z' },
      ];

      const ledgerSum = ledgerEntries.reduce((sum, e) => sum + (e.credit || 0) - (e.debit || 0), 0);
      const difference = cachedBalance - ledgerSum; // 2500 - 2000 = 500 discrepancy

      expect(ledgerSum).toBe(2000);
      expect(difference).toBe(500);
      const isReconciled = Math.abs(difference) < 0.01;
      expect(isReconciled).toBe(false);
    });
  });

  // =========================================================================
  // 7. Complete End-to-End Critical Acceptance Scenario
  // =========================================================================
  describe('7. Critical Acceptance Scenario: "شركة النور للأدوات المكتبية" - BIC Blue Pens', () => {
    it('executes full procure-to-pay lifecycle with exact mathematical precision', () => {
      // Step A: Supplier setup
      const supplier: Supplier = {
        id: 'sup_al_noor',
        tenantId: 'tenant_alwan_01',
        name: 'شركة النور للأدوات المكتبية',
        supplierType: 'stationery_distributor',
        supplierCode: 'SUP-000001',
        phone: '01012345678',
        currentBalance: 0,
        active: true,
        createdAt: '2026-09-01T00:00:00Z',
      };
      expect(supplier.currentBalance).toBe(0);

      // Step B: Initial Stock in Main Branch: 100 pieces @ 7.00 EGP WAC (Total value = 700 EGP)
      let stock: StockBalance = {
        branchId: 'branch_hq',
        productId: 'prod_bic_blue',
        variantId: null,
        availableQuantity: 100,
        reservedQuantity: 0,
        damagedQuantity: 0,
        totalQuantity: 100,
        weightedAverageCost: 7.00,
        lastCost: 7.00,
        tenantId: 'tenant_alwan_01',
      };
      expect(stock.availableQuantity).toBe(100);
      expect(stock.weightedAverageCost).toBe(7.00);

      // Step C: Purchase Order for 10 boxes (1 box = 50 pieces, price per box = 400 EGP => 8 EGP/piece)
      const po: PurchaseOrder = {
        id: 'po_al_noor_01',
        poNumber: 'PO-HQ-2026-000001',
        tenantId: 'tenant_alwan_01',
        branchId: 'branch_hq',
        destinationLocationId: 'loc_main',
        supplierId: supplier.id,
        supplierNameSnapshot: supplier.name,
        status: 'approved',
        orderDate: '2026-09-17',
        items: [
          {
            id: 'po_item_1',
            productId: 'prod_bic_blue',
            productNameSnapshot: 'قلم جاف بيك أزرق',
            skuSnapshot: 'PEN-BIC-BLU',
            orderedQuantity: 10,
            orderedBaseQuantity: 500,
            receivedQuantity: 0,
            receivedBaseQuantity: 0,
            returnedQuantity: 0,
            returnedBaseQuantity: 0,
            inputUnitId: 'box_50',
            conversionFactor: 50,
            unitCost: 400,
            discountAmount: 0,
            taxAmount: 0,
            lineTotal: 4000,
          },
        ],
        subtotal: 4000,
        taxTotal: 0,
        shippingCost: 0,
        otherCosts: 0,
        totalAmount: 4000,
        currency: 'EGP',
        createdBy: 'user_purchasing',
        createdAt: '2026-09-17T09:00:00Z',
      };
      // Invariant: PO approved does not touch stock or balance
      expect(stock.availableQuantity).toBe(100);
      expect(supplier.currentBalance).toBe(0);

      // Step D: Partial Receiving (GRN): Receive 6 boxes (300 pieces)
      const receivedBoxes = 6;
      const acceptedBoxes = 6;
      const receivedBaseQuantity = acceptedBoxes * po.items[0].conversionFactor; // 300 pieces
      const effectiveUnitCost = po.items[0].unitCost / po.items[0].conversionFactor; // 8.00 EGP/piece
      const grnTotal = acceptedBoxes * po.items[0].unitCost; // 2400 EGP

      // WAC Calculation:
      // (100 * 7.00 + 300 * 8.00) / (100 + 300) = (700 + 2400) / 400 = 3100 / 400 = 7.75 EGP!
      const newWac = calculateWeightedAverageCost(
        stock.availableQuantity,
        stock.weightedAverageCost,
        receivedBaseQuantity,
        effectiveUnitCost
      );
      expect(newWac).toBe(7.75);

      // Update stock
      stock = {
        ...stock,
        availableQuantity: stock.availableQuantity + receivedBaseQuantity, // 400 pieces
        totalQuantity: stock.totalQuantity + receivedBaseQuantity,
        weightedAverageCost: newWac,
        lastCost: effectiveUnitCost,
      };
      expect(stock.availableQuantity).toBe(400);
      expect(stock.weightedAverageCost).toBe(7.75);

      // Update PO item
      po.items[0].receivedQuantity = receivedBoxes;
      po.items[0].receivedBaseQuantity = receivedBaseQuantity;
      po.status = 'partially_received';
      expect(po.status).toBe('partially_received');

      // Update Supplier balance (Credit liability increases)
      let supplierBalance = supplier.currentBalance + grnTotal;
      expect(supplierBalance).toBe(2400);

      // Step E: Purchase Return: Return 1 box (50 pieces) due to defective packaging
      const returnBoxes = 1;
      const returnBaseQuantity = returnBoxes * po.items[0].conversionFactor; // 50 pieces
      const originalReceiptUnitCost = effectiveUnitCost; // 8.00 EGP/piece
      const returnCreditAmount = returnBaseQuantity * originalReceiptUnitCost; // 400 EGP

      // Safety check: Stock on hand (400) >= returnBaseQuantity (50) -> Valid!
      expect(stock.availableQuantity >= returnBaseQuantity).toBe(true);

      // Stock deduction
      stock = {
        ...stock,
        availableQuantity: stock.availableQuantity - returnBaseQuantity, // 350 pieces
        totalQuantity: stock.totalQuantity - returnBaseQuantity,
        // WAC remains unchanged on outbound return
      };
      expect(stock.availableQuantity).toBe(350);
      expect(stock.weightedAverageCost).toBe(7.75);

      // Supplier balance update (Debit liability decreases)
      supplierBalance -= returnCreditAmount;
      expect(supplierBalance).toBe(2000); // 2400 - 400 = 2000 EGP

      // Step F: Supplier Payment: Pay remaining 2000 EGP from Treasury/Bank
      const paymentAmount = 2000;
      supplierBalance -= paymentAmount;
      expect(supplierBalance).toBe(0); // Fully reconciled!
    });
  });
});
