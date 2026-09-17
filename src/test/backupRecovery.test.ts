import { describe, it, expect } from 'vitest';
import {
  canonicalJsonStringify,
  calculateSHA256,
  verifyChecksum,
  performRestoreDryRun,
  executeSafeRestore,
  CURRENT_SCHEMA_VERSION,
  ALL_AUDITED_COLLECTIONS,
  MODULE_COLLECTION_MAP,
} from '../services/backup.service';
import type { BackupPayload, BackupManifest } from '../types/backup.types';
import { ROLE_TEMPLATES, calculateEffectivePermissions } from '../lib/permissionsModel';

describe('Backup & Disaster Recovery Subsystem Tests (Zero Regression & Strict Safety)', () => {
  const sampleData: Record<string, any[]> = {
    employees: [
      { _id: 'emp_1', id: 'emp_1', name: 'أحمد محمود', role: 'كاشير', tenant_id: 'tenant_mk' },
      { _id: 'emp_2', id: 'emp_2', name: 'سارة علي', role: 'محاسب', tenant_id: 'tenant_mk' },
    ],
    suppliers: [
      { _id: 'sup_1', id: 'sup_1', name: 'شركة اللحوم', tenant_id: 'tenant_mk' },
    ],
    payrolls: [
      { _id: 'pay_1', id: 'pay_1', employeeId: 'emp_1', netSalary: 6000, tenant_id: 'tenant_mk' },
    ],
    orders: [
      { _id: 'ord_1', id: 'ord_1', total_amount: 350, payment_method: 'cash', tenant_id: 'tenant_mk' },
    ],
    expenses: [
      { _id: 'exp_1', id: 'exp_1', amount: 150, category: 'نظافة', tenant_id: 'tenant_mk' },
    ],
  };

  const createSampleManifest = (overrides?: Partial<BackupManifest>): BackupManifest => {
    return {
      backupId: 'backup_tenant_mk_2026-09-16T08-00-00-000Z',
      version: 1,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      tenantId: 'tenant_mk',
      branchIds: ['branch_main'],
      createdAt: '2026-09-16T08:00:00.000Z',
      createdBy: 'admin_user',
      backupType: 'full',
      collectionsIncluded: ['employees', 'suppliers', 'payrolls', 'orders', 'expenses'],
      documentsCount: 6,
      sizeBytes: 1024,
      checksum: '',
      status: 'completed',
      appVersion: '2.4.0',
      collectionCounts: { employees: 2, suppliers: 1, payrolls: 1, orders: 1, expenses: 1 },
      hasSensitiveData: true,
      fileReferencesOnly: true,
      ...overrides,
    };
  };

  describe('1. Cryptographic Checksum & Deterministic Integrity', () => {
    it('generates consistent SHA-256 hash regardless of object key order', async () => {
      const obj1 = { b: 2, a: 1, c: { y: 20, x: 10 } };
      const obj2 = { a: 1, c: { x: 10, y: 20 }, b: 2 };

      const str1 = canonicalJsonStringify(obj1);
      const str2 = canonicalJsonStringify(obj2);

      expect(str1).toBe(str2);

      const hash1 = await calculateSHA256(str1);
      const hash2 = await calculateSHA256(str2);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
    });

    it('verifies valid checksum matches and detects even a single character alteration', async () => {
      const canonicalData = canonicalJsonStringify(sampleData);
      const validHash = await calculateSHA256(canonicalData);

      // Verify matching
      const checkValid = await verifyChecksum(sampleData, validHash);
      expect(checkValid.valid).toBe(true);

      // Tampered data
      const tamperedData = JSON.parse(JSON.stringify(sampleData));
      tamperedData.orders[0].total_amount = 99999; // Attacker modified total

      const checkTampered = await verifyChecksum(tamperedData, validHash);
      expect(checkTampered.valid).toBe(false);
      expect(checkTampered.calculatedChecksum).not.toBe(validHash);
    });
  });

  describe('2. Multi-Step Dry Run Safety & Isolation Verification', () => {
    it('Dry Run succeeds for valid, untampered tenant backup with 0 writes', async () => {
      const canonicalData = canonicalJsonStringify(sampleData);
      const checksum = await calculateSHA256(canonicalData);
      const manifest = createSampleManifest({ checksum });
      const payload: BackupPayload = { manifest, data: sampleData };

      const dryRun = await performRestoreDryRun(payload, 'tenant_mk');

      expect(dryRun.canRestore).toBe(true);
      expect(dryRun.checksumValid).toBe(true);
      expect(dryRun.tenantMatch).toBe(true);
      expect(dryRun.schemaSupported).toBe(true);
      expect(dryRun.errors.length).toBe(0);
      expect(dryRun.financialChecksPassed).toBe(true);
      expect(dryRun.collectionsSummary.orders.count).toBe(1);
      expect(dryRun.collectionsSummary.employees.count).toBe(2);
    });

    it('Dry Run strictly rejects Cross-Tenant restore attempts', async () => {
      const canonicalData = canonicalJsonStringify(sampleData);
      const checksum = await calculateSHA256(canonicalData);
      // Manifest belongs to tenant_A
      const manifest = createSampleManifest({ tenantId: 'tenant_A', checksum });
      const payload: BackupPayload = { manifest, data: sampleData };

      // Attempting to restore into tenant_B
      const dryRun = await performRestoreDryRun(payload, 'tenant_B');

      expect(dryRun.canRestore).toBe(false);
      expect(dryRun.tenantMatch).toBe(false);
      expect(dryRun.errors.some((e) => e.includes('Cross-Tenant Rejected'))).toBe(true);
    });

    it('Dry Run flags missing referential foreign keys (e.g. payroll referencing deleted employee)', async () => {
      const invalidData = JSON.parse(JSON.stringify(sampleData));
      // Point payroll to non-existent employee emp_deleted
      invalidData.payrolls[0].employeeId = 'emp_deleted';

      const canonicalData = canonicalJsonStringify(invalidData);
      const checksum = await calculateSHA256(canonicalData);
      const manifest = createSampleManifest({ checksum });
      const payload: BackupPayload = { manifest, data: invalidData };

      const dryRun = await performRestoreDryRun(payload, 'tenant_mk');

      expect(dryRun.missingForeignKeys.length).toBeGreaterThan(0);
      expect(dryRun.missingForeignKeys[0]).toContain('payroll -> employee: emp_deleted');
      expect(dryRun.collectionsSummary.payrolls.status).toBe('warning');
    });

    it('Dry Run flags malformed or negative financial amounts', async () => {
      const badFinancialData = JSON.parse(JSON.stringify(sampleData));
      badFinancialData.orders[0].total_amount = -500; // Invalid negative total

      const canonicalData = canonicalJsonStringify(badFinancialData);
      const checksum = await calculateSHA256(canonicalData);
      const manifest = createSampleManifest({ checksum });
      const payload: BackupPayload = { manifest, data: badFinancialData };

      const dryRun = await performRestoreDryRun(payload, 'tenant_mk');

      expect(dryRun.canRestore).toBe(false);
      expect(dryRun.financialChecksPassed).toBe(false);
      expect(
        dryRun.errors.some(
          (e) => e.includes('قيمة مالية غير صالحة') || e.includes('إجمالي مالي غير صالح')
        )
      ).toBe(true);
    });

    it('Dry Run rejects future unsupported schema versions', async () => {
      const canonicalData = canonicalJsonStringify(sampleData);
      const checksum = await calculateSHA256(canonicalData);
      const manifest = createSampleManifest({ schemaVersion: CURRENT_SCHEMA_VERSION + 5, checksum });
      const payload: BackupPayload = { manifest, data: sampleData };

      const dryRun = await performRestoreDryRun(payload, 'tenant_mk');

      expect(dryRun.canRestore).toBe(false);
      expect(dryRun.schemaSupported).toBe(false);
      expect(dryRun.errors.some((e) => e.includes('أحدث من الإصدار المدعوم'))).toBe(true);
    });
  });

  describe('3. Restore Execution Guardrails', () => {
    it('rejects execution if confirmation phrase is missing or incorrect', async () => {
      const canonicalData = canonicalJsonStringify(sampleData);
      const checksum = await calculateSHA256(canonicalData);
      const manifest = createSampleManifest({ checksum });
      const payload: BackupPayload = { manifest, data: sampleData };

      await expect(
        executeSafeRestore(payload, {
          tenantId: 'tenant_mk',
          mode: 'merge',
          confirmedBy: 'admin',
          confirmationPhrase: 'yes', // Invalid phrase
        })
      ).rejects.toThrow('عبارة التأكيد غير صحيحة');
    });

    it('rejects execution if tenant ID does not match target tenant', async () => {
      const canonicalData = canonicalJsonStringify(sampleData);
      const checksum = await calculateSHA256(canonicalData);
      const manifest = createSampleManifest({ tenantId: 'tenant_other', checksum });
      const payload: BackupPayload = { manifest, data: sampleData };

      await expect(
        executeSafeRestore(payload, {
          tenantId: 'tenant_mk',
          mode: 'merge',
          confirmedBy: 'admin',
          confirmationPhrase: 'استعادة',
        })
      ).rejects.toThrow('لا يمكن استعادة بيانات منشأة داخل منشأة أخرى');
    });
  });

  describe('4. Strict Secrets Exclusion & Scope Auditing', () => {
    it('verifies that sensitive server-only collections are strictly excluded from backup collections', () => {
      const forbiddenCollections = [
        'api_clients',
        'integrations',
        'api_client_audit_logs',
        'api_usage_events',
        'webhook_endpoints',
        'webhook_events',
        'webhook_delivery_attempts',
        'webhook_dead_letters',
        'branch_counters',
        'orderCounters',
        'idempotency_records',
      ];

      for (const forbidden of forbiddenCollections) {
        expect(ALL_AUDITED_COLLECTIONS).not.toContain(forbidden);
        Object.values(MODULE_COLLECTION_MAP).forEach((colls) => {
          expect(colls).not.toContain(forbidden);
        });
      }
    });

    it('verifies all expected business collections are covered across modules', () => {
      const expectedCore = [
        'employees',
        'attendance',
        'payrolls',
        'advances',
        'orders',
        'expenses',
        'inventory_items',
        'suppliers',
        'daily_closings',
      ];

      for (const core of expectedCore) {
        expect(ALL_AUDITED_COLLECTIONS).toContain(core);
      }
    });
  });

  describe('5. RBAC Security & Restore Privilege Restrictions', () => {
    it('grants full backup & restore permissions to Owner and Admin', () => {
      expect(calculateEffectivePermissions('owner')).toContain('*');
      expect(ROLE_TEMPLATES.admin.permissions).toContain('backup.view');
      expect(ROLE_TEMPLATES.admin.permissions).toContain('backup.create');
      expect(ROLE_TEMPLATES.admin.permissions).toContain('backup.download');
      expect(ROLE_TEMPLATES.admin.permissions).toContain('backup.restore');
      expect(ROLE_TEMPLATES.admin.permissions).toContain('backup.delete');
    });

    it('strictly denies backup.restore to Manager, Accountant, Cashier, Kitchen', () => {
      const nonAdmins = ['manager', 'accountant', 'cashier', 'kitchen', 'hr', 'inventory'];

      for (const role of nonAdmins) {
        const perms = ROLE_TEMPLATES[role]?.permissions || [];
        expect(perms).not.toContain('backup.restore');
        expect(perms).not.toContain('backup.delete');
        expect(calculateEffectivePermissions(role)).not.toContain('backup.restore');
      }
    });
  });
});
