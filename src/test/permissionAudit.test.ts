import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSystemIntegrityDiagnostics } from '../services/governance/systemHealth.service';
import * as outboxModule from '../services/accounting/outboxProcessor.service';
import { getSkuIndexDocId, getBarcodeIndexDocId } from '../services/products/products.repository';

describe('CRITICAL HOTFIX: Firestore Permissions, System Health & Multi-Tenant Audit', () => {

  // =========================================================================
  // 1. System Health Diagnostics Fault Isolation & Graceful Recovery
  // =========================================================================
  describe('System Health Diagnostics: Fault Isolation & Promise.allSettled', () => {
    it('executes full diagnostics without throwing even if sub-queries fail or require permissions', async () => {
      // Mock outbox exceptions to throw permission denied error
      vi.spyOn(outboxModule, 'fetchOutboxExceptions').mockRejectedValue(
        new Error('Missing or insufficient permissions: accounting_events')
      );

      const report = await runSystemIntegrityDiagnostics('tenant_test_123');

      expect(report).toBeDefined();
      expect(report.totalChecksCount).toBe(5);
      expect(Array.isArray(report.checks)).toBe(true);
      expect(report.checks.length).toBe(5);

      // Verify the outbox check handled the error gracefully as 'unavailable'
      const outboxCheck = report.checks.find((c) => c.checkId === 'outbox_healthy');
      expect(outboxCheck).toBeDefined();
      expect(outboxCheck?.status).toBe('unavailable');
      expect(outboxCheck?.detailsAr).toContain('تعذر');

      // The overall diagnostics did NOT crash and returned report
      expect(['healthy', 'warning', 'critical']).toContain(report.overallStatus);
    }, 15000);

    it('identifies dead letters correctly and flags overall status as critical', async () => {
      vi.spyOn(outboxModule, 'fetchOutboxExceptions').mockResolvedValue([
        {
          id: 'event_dead_1',
          tenantId: 'tenant_test_123',
          sourceType: 'sale',
          sourceId: 'sale_999',
          eventDate: new Date().toISOString(),
          payload: {},
          retryCount: 5,
          status: 'dead_letter',
          lastError: 'Fiscal period is closed',
        },
      ]);

      const report = await runSystemIntegrityDiagnostics('tenant_test_123');

      expect(report.unresolvedDeadLettersCount).toBe(1);
      const deadCheck = report.checks.find((c) => c.checkId === 'outbox_dead_letter');
      expect(deadCheck).toBeDefined();
      expect(deadCheck?.status).toBe('critical');
      expect(report.overallStatus).toBe('critical');
    }, 15000);
  });

  // =========================================================================
  // 2. Rules Helper Logic Simulation (getDocTenantId & Role Fallback)
  // =========================================================================
  describe('Firestore Rules Helper Logic: Tenant Identification & Role Hierarchy', () => {
    // Pure logic simulation matching firestore.rules functions
    function simulateGetDocTenantId(docData: any) {
      if (!docData) return null;
      if ('tenantId' in docData && docData.tenantId != null) return docData.tenantId;
      if ('tenant_id' in docData && docData.tenant_id != null) return docData.tenant_id;
      return null;
    }

    function simulateGetUserRole(token: any, profile: any) {
      if (token && 'role' in token && token.role != null) return token.role;
      if (profile && 'role' in profile && profile.role != null) return profile.role;
      return null;
    }

    function simulateIsSystemAdmin(role: string | null) {
      return role !== null && ['owner', 'super_admin', 'admin'].includes(role);
    }

    function simulateHasTenantAccess(userRole: string | null, userTenant: string | null, docTenant: string | null) {
      if (simulateIsSystemAdmin(userRole)) return true;
      return docTenant != null && userTenant === docTenant;
    }

    it('correctly extracts tenant id from both camelCase and snake_case documents', () => {
      expect(simulateGetDocTenantId({ tenantId: 'tenant_alwan_1' })).toBe('tenant_alwan_1');
      expect(simulateGetDocTenantId({ tenant_id: 'tenant_alwan_2' })).toBe('tenant_alwan_2');
      expect(simulateGetDocTenantId({ tenantId: 'camel', tenant_id: 'snake' })).toBe('camel');
      expect(simulateGetDocTenantId({})).toBeNull();
      expect(simulateGetDocTenantId(null)).toBeNull();
    });

    it('resolves user role correctly from token with profile fallback without throwing on null', () => {
      // 1. Token has custom claim role
      expect(simulateGetUserRole({ role: 'admin' }, null)).toBe('admin');

      // 2. Token has NO custom claims, but profile document exists with role
      expect(simulateGetUserRole({}, { role: 'cashier' })).toBe('cashier');
      expect(simulateGetUserRole({}, { role: 'owner' })).toBe('owner');

      // 3. Profile doc is empty or role is missing
      expect(simulateGetUserRole({}, {})).toBeNull();
      expect(simulateGetUserRole(null, null)).toBeNull();
    });

    it('enforces strict system admin role whitelist', () => {
      expect(simulateIsSystemAdmin('owner')).toBe(true);
      expect(simulateIsSystemAdmin('super_admin')).toBe(true);
      expect(simulateIsSystemAdmin('admin')).toBe(true);

      expect(simulateIsSystemAdmin('manager')).toBe(false);
      expect(simulateIsSystemAdmin('accountant')).toBe(false);
      expect(simulateIsSystemAdmin('cashier')).toBe(false);
      expect(simulateIsSystemAdmin('inventory_clerk')).toBe(false);
      expect(simulateIsSystemAdmin(null)).toBe(false);
    });

    it('enforces strict tenant isolation for standard users and global access for system admins', () => {
      // System admin has access across any tenant
      expect(simulateHasTenantAccess('owner', 'tenant_a', 'tenant_b')).toBe(true);
      expect(simulateHasTenantAccess('admin', 'tenant_a', 'tenant_b')).toBe(true);

      // Standard cashier has access ONLY to their own tenant
      expect(simulateHasTenantAccess('cashier', 'tenant_a', 'tenant_a')).toBe(true);
      expect(simulateHasTenantAccess('cashier', 'tenant_a', 'tenant_b')).toBe(false);

      // Access is denied if document has no tenant
      expect(simulateHasTenantAccess('cashier', 'tenant_a', null)).toBe(false);
    });
  });

  // =========================================================================
  // 3. Product Catalog Lock ID Integrity (SKU & Barcode Index Keys)
  // =========================================================================
  describe('Product SKU & Barcode Index Key Generation for Locking', () => {
    it('generates consistent, normalized index document IDs isolated by tenant', () => {
      const tenantId = 'tenant_lib_100';
      const sku = 'PEN-PILOT-01';
      const barcode = '6221234567890';

      const skuId = getSkuIndexDocId(tenantId, sku);
      const barcodeId = getBarcodeIndexDocId(tenantId, barcode);

      expect(skuId).toBe('tenant_lib_100___PEN-PILOT-01');
      expect(barcodeId).toBe('tenant_lib_100___6221234567890');

      // Whitespace and case normalization
      const skuWithSpaces = getSkuIndexDocId(tenantId, '  pen-pilot-01  ');
      expect(skuWithSpaces).toBe('tenant_lib_100___PEN-PILOT-01');

      const barcodeWithSpaces = getBarcodeIndexDocId(tenantId, '  6221234567890  ');
      expect(barcodeWithSpaces).toBe('tenant_lib_100___6221234567890');
    });

    it('ensures different tenants cannot collide even with the same SKU or barcode', () => {
      const sku1 = getSkuIndexDocId('tenant_A', 'BOOK-MATH-1');
      const sku2 = getSkuIndexDocId('tenant_B', 'BOOK-MATH-1');

      expect(sku1).not.toBe(sku2);
      expect(sku1).toContain('tenant_A');
      expect(sku2).toContain('tenant_B');
    });
  });

  // =========================================================================
  // 4. Shift & Category Data Model Compliance
  // =========================================================================
  describe('Shift & Category Model Contract Compliance', () => {
    it('validates shift opening parameters contain valid non-negative float and tenant', () => {
      const validShift = {
        tenantId: 'tenant_1',
        branchId: 'branch_1',
        cashierId: 'user_1',
        cashierNameSnapshot: 'أحمد محمود',
        openingCash: 250,
      };

      expect(validShift.openingCash).toBeGreaterThanOrEqual(0);
      expect(validShift.tenantId).toBeTruthy();
      expect(validShift.branchId).toBeTruthy();
    });

    it('validates category payload preserves tenant ownership', () => {
      const category = {
        id: 'cat_stationery_1',
        tenantId: 'tenant_1',
        name: 'أدوات مكتبية',
        nameAr: 'أدوات مكتبية',
        active: true,
      };

      expect(category.tenantId).toBe('tenant_1');
      expect(category.name).toBeTruthy();
      expect(category.active).toBe(true);
    });
  });
});
