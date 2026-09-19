import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  DEFAULT_STANDARD_UNITS, 
  TENANT_COLLECTIONS_TO_WIPE, 
  wipeAndReinitializeTenantData 
} from '../services/admin/dataReset.service';

describe('Data Reset and Re-initialization Service', () => {
  it('should include all required bookstore and retail collections in purge list', () => {
    const essentialCollections = [
      'products',
      'categories',
      'brands',
      'units',
      'sales',
      'sale_returns',
      'branch_stock',
      'stock_movements',
      'purchases',
      'purchase_orders',
      'goods_receipts',
      'purchase_returns',
      'suppliers',
      'supplier_ledger',
      'supplier_payments',
      'customers',
      'customer_ledger',
      'customer_payments',
      'expenses',
      'employees',
      'attendance',
      'payrolls',
      'stats_daily',
      'stats_monthly',
      'sequence_counters',
      'branch_counters',
      'sale_idempotency',
      'return_idempotency',
      'purchase_idempotency',
      'customer_idempotency'
    ];

    essentialCollections.forEach(col => {
      expect(TENANT_COLLECTIONS_TO_WIPE).toContain(col);
    });
  });

  it('should define default standard bookstore units', () => {
    expect(DEFAULT_STANDARD_UNITS.length).toBeGreaterThanOrEqual(6);
    const unitNames = DEFAULT_STANDARD_UNITS.map(u => u.name);
    expect(unitNames).toContain('قطعة');
    expect(unitNames).toContain('علبة');
    expect(unitNames).toContain('كرتونة');
    expect(unitNames).toContain('دستة');
    expect(unitNames).toContain('رزمة');
  });

  it('should reject wipe request if tenantId is missing', async () => {
    await expect(wipeAndReinitializeTenantData('', null)).rejects.toThrow('معرف المؤسسة مفقود');
  });
});
