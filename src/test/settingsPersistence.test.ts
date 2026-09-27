import { describe, expect, it } from 'vitest';
import {
  buildBranchDocument,
  getBranchTenantId,
  isBranchOwnedByTenant,
} from '@/services/settings/settingsPersistence.service';

describe('Settings branch recovery helpers', () => {
  it('supports both historical tenant field conventions', () => {
    expect(getBranchTenantId({ tenantId: 'tenant-a' })).toBe('tenant-a');
    expect(getBranchTenantId({ tenant_id: 'tenant-b' })).toBe('tenant-b');
  });

  it('never treats another tenant branch as owned by the current tenant', () => {
    expect(isBranchOwnedByTenant({ tenantId: 'tenant-b' }, 'tenant-a')).toBe(false);
    expect(isBranchOwnedByTenant({ tenant_id: 'tenant-a' }, 'tenant-a')).toBe(true);
  });

  it('builds self-healing branch payloads with both tenant keys', () => {
    const payload = buildBranchDocument('tenant-a', {
      name: ' فرع مدينة نصر ',
      phone: '01000000000',
      address: 'القاهرة',
      opening_time: '09:00',
      closing_time: '22:00',
    });

    expect(payload.tenantId).toBe('tenant-a');
    expect(payload.tenant_id).toBe('tenant-a');
    expect(payload.name).toBe('فرع مدينة نصر');
    expect(payload.opening_time).toBe('09:00');
    expect(payload.closing_time).toBe('22:00');
    expect(payload.is_active).toBe(true);
  });

  it('accepts legacy branch data without tenant fields for immediate backfill', () => {
    expect(isBranchOwnedByTenant({ name: 'فرع قديم' }, 'tenant-a')).toBe(true);
  });
});
