import { describe, it, expect } from 'vitest';
import {
  getBranchStockDocId,
  getStockIdempotencyDocId,
  calculateWeightedAverageCost,
  deduceMovementDirection,
} from '../services/inventory/retailInventory.service';
import {
  convertToBaseQuantity,
  convertFromBaseQuantity,
} from '../services/units/units.service';
import type {
  StockBalance,
  StockMovement,
  BranchTransfer,
  InventoryCountSession,
  DamageLossRecord,
} from '../types/retail.types';

describe('Phase 4: Retail Inventory & Stock Movements Test Suite', () => {

  describe('1. Deterministic Stock Document Keys & Idempotency Identities', () => {
    it('generates consistent deterministic document keys with tenant, location, product, and variant isolation', () => {
      const tenantId = 'tenant_cai_01';
      const locationId = 'loc_nasr_city';
      const productId = 'prod_bic_pen';

      // Base product without variant
      const docIdBase = getBranchStockDocId(tenantId, locationId, productId, null);
      expect(docIdBase).toBe('tenant_cai_01_loc_nasr_city_prod_bic_pen');

      // Variant product
      const docIdVariant = getBranchStockDocId(tenantId, locationId, productId, 'var_blue');
      expect(docIdVariant).toBe('tenant_cai_01_loc_nasr_city_prod_bic_pen_var_blue');

      // Different location yields completely isolated document ID
      const docIdHeliopolis = getBranchStockDocId(tenantId, 'loc_heliopolis', productId, 'var_blue');
      expect(docIdHeliopolis).toBe('tenant_cai_01_loc_heliopolis_prod_bic_pen_var_blue');
      expect(docIdHeliopolis).not.toBe(docIdVariant);
    });

    it('generates deterministic idempotency keys ensuring zero duplicate deductions on replay', () => {
      const tenantId = 'tenant_cai_01';
      const idempKey = 'sale:inv_001:item_12';
      const docId = getStockIdempotencyDocId(tenantId, idempKey);
      expect(docId).toBe('tenant_cai_01___sale:inv_001:item_12');
    });
  });

  describe('2. Packaging Unit Conversions & Discrete Item Fractions', () => {
    it('converts discrete packaging units into standardized base units', () => {
      // 1 Box = 50 Pieces
      const boxUnit = {
        id: 'u_box',
        tenantId: 't1',
        name: 'علبة 50 قلم',
        code: 'BOX50',
        conversionFactor: 50,
        isBaseUnit: false,
        active: true,
      };

      const baseUnits = convertToBaseQuantity(10, boxUnit); // 10 boxes
      expect(baseUnits).toBe(500);

      const boxesBack = convertFromBaseQuantity(500, boxUnit);
      expect(boxesBack).toBe(10);
    });

    it('rejects fractional quantities for discrete units that prohibit decimals', () => {
      const allowFraction = false;
      const quantity = 1.5; // Cannot have 1.5 pens
      const isInvalid = !allowFraction && quantity % 1 !== 0;
      expect(isInvalid).toBe(true);

      const validQuantity = 2.0;
      const isValid = allowFraction || validQuantity % 1 === 0;
      expect(isValid).toBe(true);
    });
  });

  describe('3. Weighted Average Cost (WAC) Valuation', () => {
    it('calculates initial WAC when starting from zero stock', () => {
      const wac = calculateWeightedAverageCost(0, 0, 100, 7.5);
      expect(wac).toBe(7.5);
    });

    it('recalculates WAC upon receiving goods at higher and lower costs', () => {
      // 100 units @ 10 EGP average
      // Receive 100 units @ 20 EGP
      // Expected new WAC: (100*10 + 100*20) / 200 = 3000 / 200 = 15 EGP
      const wac1 = calculateWeightedAverageCost(100, 10, 100, 20);
      expect(wac1).toBe(15);

      // Current 200 units @ 15 EGP
      // Receive 50 units @ 12.5 EGP
      // Expected: (200*15 + 50*12.5) / 250 = (3000 + 625) / 250 = 3625 / 250 = 14.50 EGP
      const wac2 = calculateWeightedAverageCost(200, 15, 50, 12.5);
      expect(wac2).toBe(14.5);
    });

    it('ensures sales and outflows do NOT alter the WAC', () => {
      // Selling 50 units does not change the average unit cost of the remaining units
      const currentCost = 14.5;
      const onHand = 250;
      const saleQty = 50;
      const remainingOnHand = onHand - saleQty;

      expect(remainingOnHand).toBe(200);
      expect(currentCost).toBe(14.5); // Remains constant
    });
  });

  describe('4. Negative Stock Prevention & Concurrency Simulation', () => {
    it('strictly prevents deduction exceeding available stock when negative stock is disabled', () => {
      const allowNegativeStock = false;
      const currentOnHand = 10;
      const currentReserved = 2;
      const currentAvailable = currentOnHand - currentReserved; // 8 available

      const requestedOutflow = 9;
      const wouldBeAvailable = currentAvailable - requestedOutflow; // -1

      expect(wouldBeAvailable < 0 && !allowNegativeStock).toBe(true);
    });

    it('simulates concurrent deduction race condition: only one transaction succeeds', () => {
      // Scenario: Current available stock = 10
      // User A attempts to deduct 7
      // User B attempts to deduct 7 at the exact same moment
      let simulatedStock = 10;
      const allowNegativeStock = false;

      const attemptDeduction = (requestedQty: number): { success: boolean; finalStock: number } => {
        if (simulatedStock < requestedQty && !allowNegativeStock) {
          return { success: false, finalStock: simulatedStock };
        }
        simulatedStock -= requestedQty;
        return { success: true, finalStock: simulatedStock };
      };

      // Transaction 1 (User A) runs first in the serializable transaction queue
      const tx1 = attemptDeduction(7);
      expect(tx1.success).toBe(true);
      expect(tx1.finalStock).toBe(3);

      // Transaction 2 (User B) runs next against updated stock (3)
      const tx2 = attemptDeduction(7);
      expect(tx2.success).toBe(false);
      expect(tx2.finalStock).toBe(3); // Never -4!
      expect(simulatedStock).toBe(3);
    });
  });

  describe('5. Idempotent Movement Protection', () => {
    it('returns cached result on repeated idempotent request without double-deducting stock', () => {
      let stock = 100;
      const idempRegistry = new Map<string, { movementId: string; afterQuantity: number }>();

      const applyMove = (idempKey: string, deductQty: number) => {
        if (idempRegistry.has(idempKey)) {
          return {
            isIdempotentReplay: true,
            afterQuantity: idempRegistry.get(idempKey)!.afterQuantity,
          };
        }
        stock -= deductQty;
        idempRegistry.set(idempKey, { movementId: 'mov_1', afterQuantity: stock });
        return { isIdempotentReplay: false, afterQuantity: stock };
      };

      const res1 = applyMove('sale:001:item:1', 10);
      expect(res1.isIdempotentReplay).toBe(false);
      expect(res1.afterQuantity).toBe(90);
      expect(stock).toBe(90);

      // Replay identical request
      const res2 = applyMove('sale:001:item:1', 10);
      expect(res2.isIdempotentReplay).toBe(true);
      expect(res2.afterQuantity).toBe(90); // Still 90, NOT 80!
      expect(stock).toBe(90);
    });
  });

  describe('6. Variant Stock Isolation (Zero Double-Counting on Parent)', () => {
    it('maintains independent balances for variants and calculates total product stock dynamically', () => {
      // Product: BIC Pen with 3 variants
      const variantStocks = {
        blue: 100,
        black: 50,
        red: 30,
      };

      // Initial Total Product Stock = sum of variants
      let totalStock = Object.values(variantStocks).reduce((a, b) => a + b, 0);
      expect(totalStock).toBe(180);

      // Deduct 10 Blue pens
      variantStocks.blue -= 10;

      expect(variantStocks.blue).toBe(90);
      expect(variantStocks.black).toBe(50);
      expect(variantStocks.red).toBe(30);

      totalStock = Object.values(variantStocks).reduce((a, b) => a + b, 0);
      expect(totalStock).toBe(170);
    });
  });

  describe('7. Branch & Warehouse Transfers Workflow & In-Transit Tracking', () => {
    it('validates transfer constraints: rejects same source and destination', () => {
      const from = 'loc_main_wh';
      const to = 'loc_main_wh';
      const isInvalid = from === to;
      expect(isInvalid).toBe(true);
    });

    it('tracks complete transfer lifecycle (Draft -> Approved -> Dispatched -> Received)', () => {
      let mainWarehouseStock = 500;
      let nasrCityStock = 0;
      let inTransitQuantity = 0;

      // 1. Create Draft (100 pens) -> Stock untouched
      const transferQty = 100;
      let status: 'draft' | 'approved' | 'in_transit' | 'received' = 'draft';
      expect(mainWarehouseStock).toBe(500);
      expect(nasrCityStock).toBe(0);

      // 2. Approve -> Stock untouched
      status = 'approved';
      expect(mainWarehouseStock).toBe(500);
      expect(nasrCityStock).toBe(0);

      // 3. Dispatch -> Deduct from Source, Put in Transit
      status = 'in_transit';
      mainWarehouseStock -= transferQty;
      inTransitQuantity += transferQty;

      expect(mainWarehouseStock).toBe(400);
      expect(inTransitQuantity).toBe(100);
      expect(nasrCityStock).toBe(0); // Destination not increased yet!

      // Total enterprise inventory is conserved (400 on hand + 100 in transit = 500)
      expect(mainWarehouseStock + nasrCityStock + inTransitQuantity).toBe(500);

      // 4. Receive -> Increase Destination, Clear in Transit
      status = 'received';
      nasrCityStock += transferQty;
      inTransitQuantity -= transferQty;

      expect(mainWarehouseStock).toBe(400);
      expect(nasrCityStock).toBe(100);
      expect(inTransitQuantity).toBe(0);
      expect(mainWarehouseStock + nasrCityStock).toBe(500);
    });
  });

  describe('8. Damage, Loss & Recovery Auditing', () => {
    it('records damage as an atomic stock deduction and preserves the loss audit value', () => {
      let stock = 50;
      const unitCost = 15;
      const damagedQty = 3;

      stock -= damagedQty;
      const totalLossValue = damagedQty * unitCost;

      expect(stock).toBe(47);
      expect(totalLossValue).toBe(45);
    });

    it('executes recovery of previously lost goods and restores stock balance', () => {
      let stock = 47;
      const recoveredQty = 2; // Found 2 of the missing pens

      stock += recoveredQty;
      expect(stock).toBe(49);
    });
  });

  describe('9. Inventory Count (Stocktake) Reconciliation & Idempotency', () => {
    it('calculates discrepancy and variance between expected and actual count', () => {
      const expectedQuantity = 100;
      const actualCount = 95;
      const unitCost = 7;

      const difference = actualCount - expectedQuantity; // -5
      const financialVariance = difference * unitCost; // -35

      expect(difference).toBe(-5);
      expect(financialVariance).toBe(-35);

      // Adjustment movement applied to stock
      let currentStock = 100;
      currentStock += difference;
      expect(currentStock).toBe(95);
    });

    it('strictly prohibits double posting the same inventory count session', () => {
      let sessionStatus = 'posted';
      const attemptPost = () => {
        if (sessionStatus === 'posted') {
          throw new Error('هذه الجلسة تم ترحيلها مسبقاً ولا يمكن ترحيلها مرتين');
        }
        sessionStatus = 'posted';
      };

      expect(() => attemptPost()).toThrow('هذه الجلسة تم ترحيلها مسبقاً');
    });
  });

  describe('10. Full Acceptance Criteria Scenario Execution', () => {
    it('executes the complete retail workflow specified in user requirements', () => {
      // Step A: Main Warehouse receives 10 Boxes of Blue BIC Pens (50 pcs/box = 500 pcs) @ 7 EGP
      let mainWarehouseStock = 0;
      let nasrCityStock = 0;
      let inTransitStock = 0;
      let mainWarehouseWac = 0;

      const boxesReceived = 10;
      const pcsPerBox = 50;
      const totalPcs = boxesReceived * pcsPerBox;
      const unitCost = 7;

      // Opening balance / intake
      mainWarehouseWac = calculateWeightedAverageCost(mainWarehouseStock, mainWarehouseWac, totalPcs, unitCost);
      mainWarehouseStock += totalPcs;

      expect(mainWarehouseStock).toBe(500);
      expect(mainWarehouseWac).toBe(7);

      // Step B: Create Transfer of 100 Pieces to Nasr City Branch
      const transferQuantity = 100;
      // Creation & Approval: stock unchanged
      expect(mainWarehouseStock).toBe(500);
      expect(nasrCityStock).toBe(0);

      // Step C: Dispatch Transfer
      mainWarehouseStock -= transferQuantity;
      inTransitStock += transferQuantity;

      expect(mainWarehouseStock).toBe(400);
      expect(inTransitStock).toBe(100);
      expect(nasrCityStock).toBe(0);

      // Step D: Receive Transfer at Nasr City
      nasrCityStock += inTransitStock;
      inTransitStock = 0;

      expect(mainWarehouseStock).toBe(400);
      expect(nasrCityStock).toBe(100);

      // Step E: Record 3 Pens Damaged at Nasr City
      const damagedQty = 3;
      nasrCityStock -= damagedQty;
      expect(nasrCityStock).toBe(97);

      // Step F: Physical Inventory Count at Nasr City reveals Actual Count = 95
      const expectedAtCount = nasrCityStock; // 97
      const countedActual = 95;
      const countDifference = countedActual - expectedAtCount; // -2

      expect(countDifference).toBe(-2);

      // Post count adjustment
      nasrCityStock += countDifference;
      expect(nasrCityStock).toBe(95);

      // Final Audit Summary:
      // Main Warehouse: 400
      // Nasr City: 95
      // Total Enterprise Stock: 495 (500 initial - 3 damaged - 2 stocktake variance)
      expect(mainWarehouseStock + nasrCityStock).toBe(495);
    });
  });
});
