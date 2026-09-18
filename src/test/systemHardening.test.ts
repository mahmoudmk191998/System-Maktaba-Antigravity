import { describe, it, expect } from 'vitest';

import {
  OUTBOX_MAX_ATTEMPTS,
  OUTBOX_BASE_BACKOFF_SECONDS,
  OUTBOX_LEASE_DURATION_MS,
  calculateNextRetryAfter,
  buildAccountingEventDocId,
} from '../services/accounting/outboxProcessor.service';

import {
  validateBusinessSettings,
  validatePricingSettings,
  validateInventorySettings,
} from '../services/governance/settingsGovernance.service';

import {
  DEFAULT_APPROVAL_THRESHOLDS,
} from '../services/governance/approvalEngine.service';

import {
  DEFAULT_FEATURE_FLAGS,
} from '../services/governance/featureFlags.service';

import {
  MAX_ATTACHMENT_SIZE_BYTES,
  validateAttachmentFile,
} from '../services/documents/attachments.service';

import {
  parseCsvText,
} from '../services/dataCenter/importExport.service';

import {
  PERMISSION_CATEGORIES,
  ALL_PERMISSION_IDS,
  ROLE_TEMPLATES,
} from '../lib/permissionsModel';

import {
  AppError,
  normalizeError,
  generateCorrelationId,
} from '../lib/errorHandler';

import {
  redactSensitiveData,
} from '../lib/logger';

describe('Phase 11: Governance, System Hardening, Legacy Cleanup & Production Readiness', () => {

  // =========================================================================
  // MANDATORY AUDIT 2: Transactional Outbox Hardening (Lease & Dead-Letter)
  // =========================================================================
  describe('Mandatory Audit 2: Outbox Processor Lease Locking & Dead-Letter Routing', () => {
    it('calculates exponential backoff with ceiling', () => {
      const now = new Date('2026-09-17T12:00:00Z');
      
      // Attempt 1: 2^1 * 30 = 60s
      const retry1 = calculateNextRetryAfter(1, 30, now);
      expect(new Date(retry1).getTime() - now.getTime()).toBe(60 * 1000);

      // Attempt 2: 2^2 * 30 = 120s
      const retry2 = calculateNextRetryAfter(2, 30, now);
      expect(new Date(retry2).getTime() - now.getTime()).toBe(120 * 1000);

      // Attempt 3: 2^3 * 30 = 240s
      const retry3 = calculateNextRetryAfter(3, 30, now);
      expect(new Date(retry3).getTime() - now.getTime()).toBe(240 * 1000);

      // High attempt capped at 2^6 * 30 = 1920s
      const retryHigh = calculateNextRetryAfter(10, 30, now);
      expect(new Date(retryHigh).getTime() - now.getTime()).toBe(64 * 30 * 1000);
    });

    it('enforces dead-letter queue transition constants', () => {
      expect(OUTBOX_MAX_ATTEMPTS).toBe(5);
      expect(OUTBOX_BASE_BACKOFF_SECONDS).toBe(30);
      expect(OUTBOX_LEASE_DURATION_MS).toBe(120000); // 2 minutes
    });

    it('generates consistent doc ID for deduplication', () => {
      const id1 = buildAccountingEventDocId('tenant_alwan', 'sale', 'inv_1001');
      const id2 = buildAccountingEventDocId('tenant_alwan', 'sale', 'inv_1001');
      expect(id1).toBe(id2);
      expect(id1).toBe('tenant_alwan___sale___inv_1001');
    });
  });

  // =========================================================================
  // UNIFIED GOVERNANCE & APPROVAL ENGINE
  // =========================================================================
  describe('Unified Governance & Approval Engine', () => {
    it('enforces default enterprise thresholds and disallows self-approval by default', () => {
      expect(DEFAULT_APPROVAL_THRESHOLDS.purchaseApprovalThreshold).toBe(10000);
      expect(DEFAULT_APPROVAL_THRESHOLDS.refundApprovalThreshold).toBe(500);
      expect(DEFAULT_APPROVAL_THRESHOLDS.discountApprovalThreshold).toBe(300);
      expect(DEFAULT_APPROVAL_THRESHOLDS.inventoryAdjustmentThreshold).toBe(1000);
      expect(DEFAULT_APPROVAL_THRESHOLDS.paymentApprovalThreshold).toBe(25000);
      expect(DEFAULT_APPROVAL_THRESHOLDS.allowSelfApproval).toBe(false);
    });

    it('identifies self-approval violation invariant', () => {
      const requesterId = 'user_requester_123';
      const actorId = 'user_requester_123';
      const allowSelfApproval = false;
      const action = 'approve';

      const isViolation = action === 'approve' && !allowSelfApproval && requesterId === actorId;
      expect(isViolation).toBe(true);
    });
  });

  // =========================================================================
  // MANDATORY AUDIT 3 & 4: Settings Governance & Central Validation
  // =========================================================================
  describe('Settings Governance & Central Validators', () => {
    it('validates business settings correctly and flags violations', () => {
      const valid = validateBusinessSettings({
        businessName: 'مكتبة ألوان الحديثة',
        taxNumber: '300123456700003',
      });
      expect(valid.isValid).toBe(true);
      expect(valid.errors.length).toBe(0);

      const invalid = validateBusinessSettings({
        businessName: '',
        taxNumber: 'INVALID_TAX_$$$',
      });
      expect(invalid.isValid).toBe(false);
      expect(invalid.errors.length).toBeGreaterThanOrEqual(1);
    });

    it('validates pricing settings boundaries', () => {
      const valid = validatePricingSettings({
        taxPercent: 15,
        creditTermsDaysDefault: 30,
        maxDiscountPercentAllowed: 25,
      });
      expect(valid.isValid).toBe(true);

      const invalid = validatePricingSettings({
        taxPercent: 150, // Cannot exceed 100
        creditTermsDaysDefault: 500, // Cannot exceed 365
        maxDiscountPercentAllowed: -5,
      });
      expect(invalid.isValid).toBe(false);
      expect(invalid.errors.length).toBe(3);
    });

    it('validates inventory thresholds and stock count tolerances', () => {
      const valid = validateInventorySettings({
        defaultLeadTimeDays: 7,
        defaultSafetyStockDays: 14,
        deadStockThresholdDays: 90,
      });
      expect(valid.isValid).toBe(true);

      const invalid = validateInventorySettings({
        defaultLeadTimeDays: -5,
        deadStockThresholdDays: 10, // Cannot be less than 30
      });
      expect(invalid.isValid).toBe(false);
      expect(invalid.errors.length).toBe(2);
    });
  });

  // =========================================================================
  // FORMAL FEATURE FLAGS REGISTRY
  // =========================================================================
  describe('Formal Feature Flags Registry', () => {
    it('registers all required enterprise retail flags with safe defaults', () => {
      expect(DEFAULT_FEATURE_FLAGS.enableAccounting).toBe(true);
      expect(DEFAULT_FEATURE_FLAGS.enableAnalytics).toBe(true);
      expect(DEFAULT_FEATURE_FLAGS.enableWholesale).toBe(true);
      expect(DEFAULT_FEATURE_FLAGS.enableCreditSales).toBe(true);
      expect(DEFAULT_FEATURE_FLAGS.enablePurchaseApprovals).toBe(true);
      expect(DEFAULT_FEATURE_FLAGS.enableReturns).toBe(true);
      expect(DEFAULT_FEATURE_FLAGS.enableStrictNegativeStockBlock).toBe(true);
    });
  });

  // =========================================================================
  // DOCUMENT MANAGEMENT & ATTACHMENT VALIDATION
  // =========================================================================
  describe('Document Management Foundation & Security', () => {
    it('accepts valid PDF and image documents under 10MB', () => {
      const validPdf = validateAttachmentFile('invoice_2026.pdf', 1024 * 500, 'application/pdf');
      expect(validPdf.isValid).toBe(true);

      const validPng = validateAttachmentFile('damaged_book_cover.png', 1024 * 1024 * 2, 'image/png');
      expect(validPng.isValid).toBe(true);
    });

    it('strictly rejects forbidden MIME types (executables, scripts, HTML)', () => {
      const exeFile = validateAttachmentFile('malware.exe', 1024, 'application/x-msdownload');
      expect(exeFile.isValid).toBe(false);
      expect(exeFile.error).toContain('تنفيذية');

      const jsFile = validateAttachmentFile('hack.js', 500, 'application/javascript');
      expect(jsFile.isValid).toBe(false);
    });

    it('rejects files exceeding maximum size limit', () => {
      const oversizedFile = validateAttachmentFile('huge_catalog.pdf', MAX_ATTACHMENT_SIZE_BYTES + 1024, 'application/pdf');
      expect(oversizedFile.isValid).toBe(false);
      expect(oversizedFile.error).toContain('يتجاوز الحد الأقصى');
    });
  });

  // =========================================================================
  // DATA CENTER: CSV PARSER
  // =========================================================================
  describe('Data Center CSV Parser', () => {
    it('parses CSV strings correctly with header mapping', () => {
      const csv = `الاسم,الباركود,SKU,سعر البيع,التكلفة,المخزون\nدفتر سلك 100 ورقة,6281001,NOTE-100,15.50,10.00,50\nقلم جاف أزرق روكو,6281002,PEN-BL-01,2.00,1.20,200`;
      const rows = parseCsvText(csv);

      expect(rows.length).toBe(2);
      expect(rows[0]['الاسم']).toBe('دفتر سلك 100 ورقة');
      expect(rows[0]['SKU']).toBe('NOTE-100');
      expect(rows[1]['الباركود']).toBe('6281002');
    });
  });

  // =========================================================================
  // MANDATORY AUDIT 5: Permissions Registry Consistency
  // =========================================================================
  describe('Mandatory Audit 5: Permissions Registry Zero-Inconsistency & Role Completeness', () => {
    it('guarantees 0 unregistered permissions in ALL_PERMISSION_IDS', () => {
      const allCategoryPermIds = PERMISSION_CATEGORIES.flatMap((c) => c.permissions.map((p) => p.id));
      const registeredIdsSet = new Set(ALL_PERMISSION_IDS);

      // Every permission in category must be in ALL_PERMISSION_IDS
      for (const permId of allCategoryPermIds) {
        expect(registeredIdsSet.has(permId)).toBe(true);
      }
      expect(allCategoryPermIds.length).toBe(ALL_PERMISSION_IDS.length);
    });

    it('guarantees no duplicated permission IDs across categories', () => {
      const seen = new Set<string>();
      const duplicates: string[] = [];

      for (const category of PERMISSION_CATEGORIES) {
        for (const p of category.permissions) {
          if (seen.has(p.id)) {
            duplicates.push(p.id);
          }
          seen.add(p.id);
        }
      }

      // No duplicates
      expect(duplicates).toEqual([]);
    });

    it('verifies owner and super_admin have wildcard ["*"] access', () => {
      expect(ROLE_TEMPLATES.owner.permissions).toEqual(['*']);
      expect(ROLE_TEMPLATES.super_admin.permissions).toEqual(['*']);
    });

    it('verifies admin role template contains all defined permissions', () => {
      const adminPerms = new Set(ROLE_TEMPLATES.admin.permissions);
      expect(adminPerms.size).toBe(ALL_PERMISSION_IDS.length);
      for (const p of ALL_PERMISSION_IDS) {
        expect(adminPerms.has(p)).toBe(true);
      }
    });

    it('verifies governance permissions are registered in categories', () => {
      const governanceCategory = PERMISSION_CATEGORIES.find((c) => c.id === 'governance');
      expect(governanceCategory).toBeDefined();
      const ids = governanceCategory?.permissions.map((p) => p.id) || [];
      expect(ids).toContain('approvals.view');
      expect(ids).toContain('approvals.action');
      expect(ids).toContain('datacenter.view');
      expect(ids).toContain('datacenter.import');
      expect(ids).toContain('system_health.view');
      expect(ids).toContain('attachments.manage');
    });
  });

  // =========================================================================
  // MANDATORY AUDIT 7 & 8: Error Taxonomy, Correlation IDs & Redaction
  // =========================================================================
  describe('Mandatory Audit 7 & 8: Observability, Error Handling & Redaction', () => {
    it('generates unique correlation IDs matching standard format ERR-XXXXXXXX', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();

      expect(id1).toMatch(/^ERR-[A-Z0-9]{8}$/);
      expect(id2).toMatch(/^ERR-[A-Z0-9]{8}$/);
      expect(id1).not.toBe(id2);
    });

    it('creates structured AppError instances with category and message', () => {
      const err = new AppError({
        category: 'VALIDATION',
        messageAr: 'فشل التحقق من صحة رصيد العميل',
        messageEn: 'Customer balance validation failed',
        technicalDetails: { customerId: 'cust_001', balance: -50 },
      });

      expect(err.name).toBe('AppError');
      expect(err.category).toBe('VALIDATION');
      expect(err.messageAr).toBe('فشل التحقق من صحة رصيد العميل');
      expect(err.messageEn).toBe('Customer balance validation failed');
      expect(err.correlationId).toMatch(/^ERR-[A-Z0-9]{8}$/);
      expect(err.technicalDetails?.customerId).toBe('cust_001');
    });

    it('normalizes unknown exceptions into AppError', () => {
      const standardError = new Error('Database disconnected');
      const normalized = normalizeError(standardError);

      expect(normalized instanceof AppError).toBe(true);
      expect(normalized.messageEn).toBe('Database disconnected');
      expect(normalized.correlationId).toBeDefined();

      const rawStringError = 'Direct string thrown';
      const normalizedStr = normalizeError(rawStringError);
      expect(normalizedStr.messageEn).toBe('Direct string thrown');
    });

    it('redacts sensitive fields (passwords, tokens, pins, secrets) in logs', () => {
      const sensitiveData = {
        username: 'cashier1',
        password: 'SuperSecretPassword123!',
        token: 'eyJhGciOiJIUzI1NiIsInR5cCI...',
        pin: '1234',
        apiKey: 'secret_key_prod_xyz',
        amount: 250.0,
        nested: {
          secret_key: 'topsecret',
          publicInfo: 'Alwan Bookstore',
        },
      };

      const redacted = redactSensitiveData(sensitiveData);

      expect(redacted.username).toBe('cashier1');
      expect(redacted.amount).toBe(250.0);
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.token).toBe('[REDACTED]');
      expect(redacted.pin).toBe('[REDACTED]');
      expect(redacted.apiKey).toBe('[REDACTED]');
      expect(redacted.nested.secret_key).toBe('[REDACTED]');
      expect(redacted.nested.publicInfo).toBe('Alwan Bookstore');
    });
  });

});
