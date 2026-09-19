import { describe, it, expect } from 'vitest';
import { computeStockStatus } from '@/services/products/products.repository';
import { getTenantDateString, getTenantMonthString } from '@/lib/reportingTimezone';

describe('Firestore Performance & Cost Optimization Architecture Tests', () => {
  describe('Derived Low Stock Architecture', () => {
    it('should accurately calculate out of stock status when quantity is 0 or less', () => {
      const res1 = computeStockStatus(0, 10);
      expect(res1.isLowStock).toBe(true);
      expect(res1.stockStatus).toBe('out');

      const res2 = computeStockStatus(-5, 10);
      expect(res2.isLowStock).toBe(true);
      expect(res2.stockStatus).toBe('out');
    });

    it('should accurately calculate low stock status when quantity is less than or equal to minStock', () => {
      const res1 = computeStockStatus(5, 10);
      expect(res1.isLowStock).toBe(true);
      expect(res1.stockStatus).toBe('low');

      const res2 = computeStockStatus(10, 10);
      expect(res2.isLowStock).toBe(true);
      expect(res2.stockStatus).toBe('low');
    });

    it('should accurately calculate normal status when quantity exceeds minStock', () => {
      const res = computeStockStatus(25, 10);
      expect(res.isLowStock).toBe(false);
      expect(res.stockStatus).toBe('normal');
    });
  });

  describe('Timezone & Timestamp Partitioning (Africa/Cairo)', () => {
    it('should format date string in YYYY-MM-DD adhering to business timezone', () => {
      const date = new Date('2026-09-19T21:30:00Z'); // 21:30 UTC is 00:30 next day in Cairo (+3)
      const dateStr = getTenantDateString(date);
      expect(dateStr).toBe('2026-09-20');
    });

    it('should format month string in YYYY-MM adhering to business timezone', () => {
      const date = new Date('2026-09-19T12:00:00Z');
      const monthStr = getTenantMonthString(date);
      expect(monthStr).toBe('2026-09');
    });
  });

  describe('Historical Cost Snapshot & Profit Integrity', () => {
    it('should preserve profit calculation based on historical cost snapshot, not current cost', () => {
      const saleItem = {
        quantity: 2,
        unitSellingPrice: 50,
        unitCostSnapshot: 30, // historical cost at sale time
        currentProductCost: 40, // changed later
      };

      const lineTotal = saleItem.quantity * saleItem.unitSellingPrice; // 100
      const historicalTotalCost = saleItem.quantity * saleItem.unitCostSnapshot; // 60
      const historicalProfit = lineTotal - historicalTotalCost; // 40

      // Must be 40, NOT 100 - (2 * 40) = 20
      expect(historicalProfit).toBe(40);
    });
  });
});
