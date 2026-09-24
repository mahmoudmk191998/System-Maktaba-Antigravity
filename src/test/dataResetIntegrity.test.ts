import { describe, expect, it } from 'vitest';
import {
  RESET_PRESERVED_COLLECTIONS,
  TENANT_COLLECTIONS_TO_WIPE,
} from '@/services/admin/dataReset.service';

describe('Strict tenant data reset registry', () => {
  it('covers collections that previously survived reset or repopulated reports', () => {
    const wipe = new Set(TENANT_COLLECTIONS_TO_WIPE);

    [
      'sales',
      'orders',
      'invoices',
      'order_items',
      'sale_items',
      'sale_returns',
      'sales_returns',
      'stats_daily',
      'stats_monthly',
      'daily_analytics_metrics',
      'system_migrations',
      'product_skus',
      'product_barcodes',
      'journal_entries',
      'journal_lines',
      'sequence_counters',
      'branch_counters',
    ].forEach((collectionName) => {
      expect(wipe.has(collectionName), `missing reset collection: ${collectionName}`).toBe(true);
    });
  });

  it('preserves account identity and tenant access records', () => {
    const preserved = new Set(RESET_PRESERVED_COLLECTIONS);

    ['tenants', 'branches', 'profiles', 'user_roles', 'user_permissions'].forEach(
      (collectionName) => {
        expect(preserved.has(collectionName)).toBe(true);
        expect(TENANT_COLLECTIONS_TO_WIPE).not.toContain(collectionName);
      }
    );
  });

  it('contains no duplicate wipe collection names', () => {
    expect(new Set(TENANT_COLLECTIONS_TO_WIPE).size).toBe(
      TENANT_COLLECTIONS_TO_WIPE.length
    );
  });
});
