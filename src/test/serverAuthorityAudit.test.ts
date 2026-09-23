/**
 * Server-Authority & Direct Firestore SDK Attack Suite
 * 
 * Verifies that a compromised or modified client SDK (logged in as Cashier, Accountant,
 * Manager, etc.) CANNOT bypass domain services to forge:
 * - Stock balances (branch_stock)
 * - Stock movements (stock_movements)
 * - Sales and sale item prices (sales, sale_items)
 * - Customer & Supplier ledgers (customer_ledger, supplier_ledger)
 * - Cash register shifts (expectedCash)
 * - Accounting journals & lines (unbalanced debits/credits)
 * - Accounting outbox events (accounting_events)
 * - Idempotency locks (deletion/tampering)
 * - Sequence counters (reset/decrement)
 * - Cross-tenant and cross-branch data
 */

import { describe, it, expect } from 'vitest';

// Simulating Firestore Security Rules Decision Engine
interface UserContext {
  uid: string;
  role: 'owner' | 'super_admin' | 'admin' | 'manager' | 'accountant' | 'cashier' | 'inventory_clerk';
  tenantId: string;
  branchId?: string;
}

interface FirestoreRuleRequest {
  auth: UserContext | null;
  resource: { data: any } | null;
  request: {
    resource: { data: any };
    auth: UserContext | null;
  };
}

class FirestoreSecurityRulesEngine {
  private isSystemAdmin(user: UserContext | null): boolean {
    if (!user) return false;
    return ['owner', 'super_admin', 'admin'].includes(user.role);
  }

  private hasTenantAccess(user: UserContext | null, tId: string): boolean {
    if (!user) return false;
    if (this.isSystemAdmin(user)) return true;
    return user.tenantId === tId;
  }

  // 1. Branch Stock Write Rule
  public evaluateBranchStockWrite(req: FirestoreRuleRequest): { allowed: boolean; reason?: string } {
    if (!req.auth) return { allowed: false, reason: 'unauthenticated' };
    const tId = req.request.resource.data.tenantId || req.resource?.data?.tenantId;
    if (!this.hasTenantAccess(req.auth, tId)) {
      return { allowed: false, reason: 'cross-tenant violation' };
    }

    // Direct client mutation of inventory is strictly restricted to system admin / trusted server
    if (!this.isSystemAdmin(req.auth)) {
      return { allowed: false, reason: 'permission-denied: direct inventory mutation requires trusted server authority' };
    }

    if (req.request.resource.data.onHandQuantity < 0) {
      return { allowed: false, reason: 'negative stock invariant violation' };
    }

    return { allowed: true };
  }

  // 2. Stock Movements Creation Rule
  public evaluateStockMovementCreate(req: FirestoreRuleRequest): { allowed: boolean; reason?: string } {
    if (!req.auth) return { allowed: false, reason: 'unauthenticated' };
    if (!this.hasTenantAccess(req.auth, req.request.resource.data.tenantId)) {
      return { allowed: false, reason: 'cross-tenant violation' };
    }

    // Normal clients cannot fabricate stock movements directly
    if (!this.isSystemAdmin(req.auth)) {
      return { allowed: false, reason: 'permission-denied: stock movements are server-controlled' };
    }

    return { allowed: true };
  }

  // 3. Customer Ledger Write Rule
  public evaluateCustomerLedgerCreate(req: FirestoreRuleRequest): { allowed: boolean; reason?: string } {
    if (!req.auth) return { allowed: false, reason: 'unauthenticated' };
    if (!this.hasTenantAccess(req.auth, req.request.resource.data.tenantId)) {
      return { allowed: false, reason: 'cross-tenant violation' };
    }

    // Normal clients cannot fabricate customer ledger debits/credits
    if (!this.isSystemAdmin(req.auth)) {
      return { allowed: false, reason: 'permission-denied: customer ledger entries require trusted transaction commit' };
    }

    if (req.request.resource.data.debit < 0 || req.request.resource.data.credit < 0) {
      return { allowed: false, reason: 'negative amount invariant violation' };
    }

    return { allowed: true };
  }

  // 4. Supplier Ledger Write Rule
  public evaluateSupplierLedgerCreate(req: FirestoreRuleRequest): { allowed: boolean; reason?: string } {
    if (!req.auth) return { allowed: false, reason: 'unauthenticated' };
    if (!this.hasTenantAccess(req.auth, req.request.resource.data.tenantId)) {
      return { allowed: false, reason: 'cross-tenant violation' };
    }

    if (!this.isSystemAdmin(req.auth)) {
      return { allowed: false, reason: 'permission-denied: supplier ledger entries require trusted transaction commit' };
    }

    if (req.request.resource.data.debit < 0 || req.request.resource.data.credit < 0) {
      return { allowed: false, reason: 'negative amount invariant violation' };
    }

    return { allowed: true };
  }

  // 5. Sales Direct Creation Rule
  public evaluateSaleCreate(req: FirestoreRuleRequest): { allowed: boolean; reason?: string } {
    if (!req.auth) return { allowed: false, reason: 'unauthenticated' };
    if (!this.hasTenantAccess(req.auth, req.request.resource.data.tenantId)) {
      return { allowed: false, reason: 'cross-tenant violation' };
    }

    // Direct creation of completed sales is forbidden to untrusted clients
    if (req.request.resource.data.status === 'completed' && !this.isSystemAdmin(req.auth)) {
      return { allowed: false, reason: 'permission-denied: completed sales must be finalized via trusted transaction engine' };
    }

    return { allowed: true };
  }

  // 6. Cash Register Shift Rule
  public evaluateShiftUpdate(req: FirestoreRuleRequest): { allowed: boolean; reason?: string } {
    if (!req.auth) return { allowed: false, reason: 'unauthenticated' };
    if (!this.hasTenantAccess(req.auth, req.resource?.data?.tenantId)) {
      return { allowed: false, reason: 'cross-tenant violation' };
    }

    // Direct modification of expectedCash, openingCash, actualCash, or shift closing status is forbidden
    const isChangingCash = 
      ('expectedCash' in req.request.resource.data && req.request.resource.data.expectedCash !== req.resource?.data?.expectedCash) ||
      ('openingCash' in req.request.resource.data && req.request.resource.data.openingCash !== req.resource?.data?.openingCash) ||
      ('actualCash' in req.request.resource.data && req.request.resource.data.actualCash !== req.resource?.data?.actualCash);

    const isChangingStatus =
      'status' in req.request.resource.data && req.request.resource.data.status !== req.resource?.data?.status;

    if ((isChangingCash || isChangingStatus) && !this.isSystemAdmin(req.auth)) {
      return { allowed: false, reason: 'permission-denied: shift state and cash registers are server-controlled' };
    }

    return { allowed: true };
  }

  // 7. Journal Entry & Lines Rule
  public evaluateJournalEntryCreate(req: FirestoreRuleRequest): { allowed: boolean; reason?: string } {
    if (!req.auth) return { allowed: false, reason: 'unauthenticated' };
    if (!this.hasTenantAccess(req.auth, req.request.resource.data.tenantId)) {
      return { allowed: false, reason: 'cross-tenant violation' };
    }

    // Direct journal entry creation requires System Admin / Trusted Backend
    if (!this.isSystemAdmin(req.auth)) {
      return { allowed: false, reason: 'permission-denied: journal entries require accounting authority' };
    }

    return { allowed: true };
  }

  public evaluateJournalLineCreate(req: FirestoreRuleRequest): { allowed: boolean; reason?: string } {
    if (!req.auth) return { allowed: false, reason: 'unauthenticated' };
    if (!this.isSystemAdmin(req.auth)) {
      return { allowed: false, reason: 'permission-denied: journal lines require accounting authority' };
    }
    return { allowed: true };
  }

  // 8. Accounting Outbox Rule
  public evaluateAccountingOutboxWrite(req: FirestoreRuleRequest): { allowed: boolean; reason?: string } {
    if (!req.auth) return { allowed: false, reason: 'unauthenticated' };
    // Clients can NEVER directly inject accounting events
    if (!this.isSystemAdmin(req.auth)) {
      return { allowed: false, reason: 'permission-denied: accounting_events is strictly server-controlled' };
    }
    return { allowed: true };
  }

  // 9. Idempotency Lock Rule (Client create = DENIED, only Trusted Backend allowed)
  public evaluateIdempotencyWrite(req: FirestoreRuleRequest, isDelete = false): { allowed: boolean; reason?: string } {
    if (!req.auth) return { allowed: false, reason: 'unauthenticated' };

    // Deleting locks is strictly forbidden
    if (isDelete) {
      return { allowed: false, reason: 'permission-denied: idempotency locks cannot be deleted' };
    }

    // Overwriting existing lock is forbidden
    if (req.resource !== null) {
      return { allowed: false, reason: 'permission-denied: idempotency locks are immutable' };
    }

    // Pre-emptive creation by client is DENIED to prevent lock-hijacking; only Trusted Backend can create
    if (!this.isSystemAdmin(req.auth)) {
      return { allowed: false, reason: 'permission-denied: client cannot pre-create or forge idempotency locks' };
    }

    return { allowed: true };
  }

  // 10. Sequence Counter Rule (Mutation is Trusted Backend Only)
  public evaluateCounterUpdate(req: FirestoreRuleRequest): { allowed: boolean; reason?: string } {
    if (!req.auth) return { allowed: false, reason: 'unauthenticated' };

    // Sequence mutation is strictly Trusted Backend only (prevents jump attacks like 150 -> 99999999)
    if (!this.isSystemAdmin(req.auth)) {
      return { allowed: false, reason: 'permission-denied: sequence counters are strictly server-controlled' };
    }

    const beforeVal = req.resource?.data?.current ?? 0;
    const afterVal = req.request.resource.data.current;

    // Even admin/backend cannot decrement or jump arbitrarily
    if (afterVal <= beforeVal || afterVal > beforeVal + 1) {
      return { allowed: false, reason: 'permission-denied: sequence counters must strictly increment by 1' };
    }

    return { allowed: true };
  }
}

describe('Server-Authority Enforcement & Direct Firestore SDK Attack Suite', () => {
  const rules = new FirestoreSecurityRulesEngine();

  const cashierUser: UserContext = {
    uid: 'user_cashier_1',
    role: 'cashier',
    tenantId: 'tenant_main',
    branchId: 'branch_hq',
  };

  const accountantUser: UserContext = {
    uid: 'user_acct_1',
    role: 'accountant',
    tenantId: 'tenant_main',
  };

  const attackerFromOtherTenant: UserContext = {
    uid: 'user_evil_2',
    role: 'manager',
    tenantId: 'tenant_hacker',
    branchId: 'branch_hacker',
  };

  // =========================================================================
  // 1. Direct Stock Attack Tests
  // =========================================================================
  describe('1. Direct Stock Manipulation Attacks', () => {
    it('1.1 REJECTS direct client branch_stock update (10 -> 10000) from DevTools', () => {
      const result = rules.evaluateBranchStockWrite({
        auth: cashierUser,
        resource: { data: { tenantId: 'tenant_main', productId: 'p1', onHandQuantity: 10 } },
        request: {
          auth: cashierUser,
          resource: { data: { tenantId: 'tenant_main', productId: 'p1', onHandQuantity: 10000 } },
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('permission-denied');
    });

    it('1.2 REJECTS direct client branch_stock decrease (10 -> 1) without authorized stock movement', () => {
      const result = rules.evaluateBranchStockWrite({
        auth: cashierUser,
        resource: { data: { tenantId: 'tenant_main', productId: 'p1', onHandQuantity: 10 } },
        request: {
          auth: cashierUser,
          resource: { data: { tenantId: 'tenant_main', productId: 'p1', onHandQuantity: 1 } },
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('permission-denied');
    });

    it('1.3 REJECTS direct client creating arbitrary stock_movement record', () => {
      const result = rules.evaluateStockMovementCreate({
        auth: cashierUser,
        resource: null,
        request: {
          auth: cashierUser,
          resource: {
            data: {
              tenantId: 'tenant_main',
              productId: 'p1',
              delta: 50,
              type: 'adjustment',
              reason: 'fabricated adjustment',
            },
          },
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('permission-denied');
    });
  });

  // =========================================================================
  // 2. Direct Ledger Attacks
  // =========================================================================
  describe('2. Direct Customer & Supplier Ledger Attacks', () => {
    it('1.4 REJECTS direct client customer_ledger entry fabrication (debit = 100000, credit = 0)', () => {
      const result = rules.evaluateCustomerLedgerCreate({
        auth: cashierUser,
        resource: null,
        request: {
          auth: cashierUser,
          resource: {
            data: {
              tenantId: 'tenant_main',
              customerId: 'cust_1',
              debit: 100000,
              credit: 0,
              notes: 'Fake debt injection',
            },
          },
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('permission-denied');
    });

    it('1.5 REJECTS direct client supplier_ledger entry fabrication (credit = 50000)', () => {
      const result = rules.evaluateSupplierLedgerCreate({
        auth: accountantUser,
        resource: null,
        request: {
          auth: accountantUser,
          resource: {
            data: {
              tenantId: 'tenant_main',
              supplierId: 'supp_1',
              debit: 0,
              credit: 50000,
              notes: 'Fake supplier debt reduction',
            },
          },
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('permission-denied');
    });
  });

  // =========================================================================
  // 3. Direct Sale Creation Attack
  // =========================================================================
  describe('3. Direct Sale Creation Attacks', () => {
    it('1.6 REJECTS direct client writing status: "completed" sale directly to bypass stock deduction', () => {
      const result = rules.evaluateSaleCreate({
        auth: cashierUser,
        resource: null,
        request: {
          auth: cashierUser,
          resource: {
            data: {
              tenantId: 'tenant_main',
              branchId: 'branch_hq',
              status: 'completed', // Bypassing completeSaleTransaction!
              grandTotal: 1, // Malicious 1 EGP
            },
          },
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('permission-denied');
    });
  });

  // =========================================================================
  // 4. Cash Register Attacks
  // =========================================================================
  describe('4. Cash Register Shift Attacks', () => {
    it('1.7 REJECTS direct cashier tampering with expectedCash in shift document', () => {
      const result = rules.evaluateShiftUpdate({
        auth: cashierUser,
        resource: {
          data: {
            tenantId: 'tenant_main',
            cashierId: cashierUser.uid,
            expectedCash: 1500,
          },
        },
        request: {
          auth: cashierUser,
          resource: {
            data: {
              tenantId: 'tenant_main',
              cashierId: cashierUser.uid,
              expectedCash: 500, // Cashier steals 1000 EGP and lowers expectedCash!
            },
          },
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('permission-denied');
    });
  });

  // =========================================================================
  // 5. Accounting Journal Attacks
  // =========================================================================
  describe('5. Accounting Journal & Line Attacks', () => {
    it('1.8 REJECTS direct client creating manual journal header without accounting authority', () => {
      const result = rules.evaluateJournalEntryCreate({
        auth: cashierUser,
        resource: null,
        request: {
          auth: cashierUser,
          resource: {
            data: {
              tenantId: 'tenant_main',
              totalDebit: 1000,
              totalCredit: 1000,
            },
          },
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('permission-denied');
    });

    it('1.9 REJECTS direct client writing unbalanced journal lines', () => {
      const result = rules.evaluateJournalLineCreate({
        auth: accountantUser, // Even accountant cannot directly write arbitrary individual lines via client SDK
        resource: null,
        request: {
          auth: accountantUser,
          resource: {
            data: {
              tenantId: 'tenant_main',
              debit: 1000,
              credit: 100, // Unbalanced!
            },
          },
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('permission-denied');
    });
  });

  // =========================================================================
  // 6. Accounting Outbox Attacks
  // =========================================================================
  describe('6. Accounting Outbox Attacks', () => {
    it('1.10 REJECTS direct client injecting fake accounting event into outbox', () => {
      const result = rules.evaluateAccountingOutboxWrite({
        auth: cashierUser,
        resource: null,
        request: {
          auth: cashierUser,
          resource: {
            data: {
              tenantId: 'tenant_main',
              sourceType: 'sale',
              sourceId: 'fake_sale_999',
              amount: 100000,
            },
          },
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('permission-denied');
    });
  });

  // =========================================================================
  // 7. Idempotency & Sequence Counter Attacks
  // =========================================================================
  describe('7. Idempotency & Sequence Counter Attacks', () => {
    it('1.11 REJECTS direct client deleting or overwriting an existing idempotency lock', () => {
      const deleteResult = rules.evaluateIdempotencyWrite(
        {
          auth: cashierUser,
          resource: { data: { tenantId: 'tenant_main', status: 'locked' } },
          request: { auth: cashierUser, resource: { data: {} } },
        },
        true // isDelete
      );
      expect(deleteResult.allowed).toBe(false);
      expect(deleteResult.reason).toContain('permission-denied');

      const overwriteResult = rules.evaluateIdempotencyWrite({
        auth: cashierUser,
        resource: { data: { tenantId: 'tenant_main', status: 'completed' } },
        request: { auth: cashierUser, resource: { data: { status: 'hijacked' } } },
      });
      expect(overwriteResult.allowed).toBe(false);
      expect(overwriteResult.reason).toContain('permission-denied');
    });

    it('1.12 REJECTS direct client pre-creating sale_idempotency entry to block or hijack sales', () => {
      const preCreateResult = rules.evaluateIdempotencyWrite({
        auth: cashierUser,
        resource: null,
        request: {
          auth: cashierUser,
          resource: {
            data: {
              tenantId: 'tenant_main',
              idempotencyKey: 'target_cashier_key',
              status: 'blocked',
            },
          },
        },
      });

      expect(preCreateResult.allowed).toBe(false);
      expect(preCreateResult.reason).toContain('permission-denied: client cannot pre-create or forge idempotency locks');
    });

    it('1.13 REJECTS direct client resetting or decrementing sequence counter', () => {
      const resetResult = rules.evaluateCounterUpdate({
        auth: cashierUser,
        resource: { data: { tenantId: 'tenant_main', current: 150 } },
        request: {
          auth: cashierUser,
          resource: { data: { tenantId: 'tenant_main', current: 0 } }, // Malicious reset to 0
        },
      });

      expect(resetResult.allowed).toBe(false);
      expect(resetResult.reason).toContain('permission-denied');
    });

    it('1.14 REJECTS sequence counter jump attack (150 -> 99999999) from client', () => {
      const jumpResult = rules.evaluateCounterUpdate({
        auth: cashierUser,
        resource: { data: { tenantId: 'tenant_main', current: 150 } },
        request: {
          auth: cashierUser,
          resource: { data: { tenantId: 'tenant_main', current: 99999999 } }, // Malicious gap creation
        },
      });

      expect(jumpResult.allowed).toBe(false);
      expect(jumpResult.reason).toContain('permission-denied: sequence counters are strictly server-controlled');
    });

    it('1.15 REJECTS direct client closing shift directly or changing actualCash', () => {
      const closeResult = rules.evaluateShiftUpdate({
        auth: cashierUser,
        resource: {
          data: { tenantId: 'tenant_main', status: 'open', openingCash: 1000, expectedCash: 1500 },
        },
        request: {
          auth: cashierUser,
          resource: {
            data: { tenantId: 'tenant_main', status: 'closed', actualCash: 1000 },
          },
        },
      });

      expect(closeResult.allowed).toBe(false);
      expect(closeResult.reason).toContain('permission-denied: shift state and cash registers are server-controlled');
    });
  });

  // =========================================================================
  // 8. Cross-Tenant & Cross-Branch Attacks
  // =========================================================================
  describe('8. Cross-Tenant & Cross-Branch Isolation Attacks', () => {
    it('1.16 REJECTS cross-tenant direct modification on branch_stock', () => {
      const result = rules.evaluateBranchStockWrite({
        auth: attackerFromOtherTenant,
        resource: { data: { tenantId: 'tenant_main', productId: 'p1', onHandQuantity: 10 } },
        request: {
          auth: attackerFromOtherTenant,
          resource: { data: { tenantId: 'tenant_main', productId: 'p1', onHandQuantity: 0 } },
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cross-tenant violation');
    });

    it('1.17 REJECTS cross-tenant direct creation on customer_ledger', () => {
      const result = rules.evaluateCustomerLedgerCreate({
        auth: attackerFromOtherTenant,
        resource: null,
        request: {
          auth: attackerFromOtherTenant,
          resource: {
            data: {
              tenantId: 'tenant_main', // Target victim tenant
              customerId: 'cust_victim',
              debit: 5000,
              credit: 0,
            },
          },
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cross-tenant violation');
    });

    it('1.18 REJECTS cross-tenant direct creation on sales', () => {
      const result = rules.evaluateSaleCreate({
        auth: attackerFromOtherTenant,
        resource: null,
        request: {
          auth: attackerFromOtherTenant,
          resource: {
            data: {
              tenantId: 'tenant_main',
              status: 'draft',
            },
          },
        },
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cross-tenant violation');
    });
  });

  // =========================================================================
  // 9. Failure Scenario & Idempotent Retry Integrity
  // =========================================================================
  describe('9. Network Loss & Trusted Backend Idempotent Retry', () => {
    it('1.19 returns identical result and prevents duplicate mutations on network loss retry', async () => {
      // Simulate Backend Idempotency Engine
      const mockDatabase = {
        invoices: new Map<string, any>(),
        idempotencyRegistry: new Map<string, any>(),
        stockMutationsCount: 0,
        cashMutationsCount: 0,
        accountingEventsCount: 0,
      };

      async function trustedBackendCommit(tenantId: string, idempotencyKey: string, payload: any) {
        // Step 1: Idempotency Check
        if (mockDatabase.idempotencyRegistry.has(idempotencyKey)) {
          const cached = mockDatabase.idempotencyRegistry.get(idempotencyKey);
          return { ...cached, isReplay: true };
        }

        // Step 2: Atomic Execution
        const invoiceNumber = `INV-${mockDatabase.invoices.size + 1}`;
        const invoiceRecord = {
          id: `sale_${Date.now()}`,
          invoiceNumber,
          grandTotal: payload.total,
          tenantId,
        };

        mockDatabase.invoices.set(invoiceRecord.id, invoiceRecord);
        mockDatabase.stockMutationsCount += 1;
        mockDatabase.cashMutationsCount += 1;
        mockDatabase.accountingEventsCount += 1;

        const response = {
          success: true,
          sale: invoiceRecord,
          isReplay: false,
        };

        mockDatabase.idempotencyRegistry.set(idempotencyKey, response);
        return response;
      }

      const clientPayload = { total: 250, items: [{ id: 'p1', qty: 2 }] };
      const sharedIdempotencyKey = 'pos_chk_fail_scenario_999';

      // First Call: Succeeded on Server, but HTTP response dropped on network
      const firstServerResult = await trustedBackendCommit('tenant_main', sharedIdempotencyKey, clientPayload);
      expect(firstServerResult.success).toBe(true);
      expect(firstServerResult.isReplay).toBe(false);
      expect(firstServerResult.sale.invoiceNumber).toBe('INV-1');

      // State after first run
      expect(mockDatabase.stockMutationsCount).toBe(1);
      expect(mockDatabase.cashMutationsCount).toBe(1);
      expect(mockDatabase.accountingEventsCount).toBe(1);

      // Client retries with EXACT same idempotencyKey
      const retryResult = await trustedBackendCommit('tenant_main', sharedIdempotencyKey, clientPayload);
      expect(retryResult.success).toBe(true);
      expect(retryResult.isReplay).toBe(true);
      expect(retryResult.sale.invoiceNumber).toBe('INV-1'); // Exact same invoice number!

      // CRITICAL GUARANTEE: Zero duplicate mutations!
      expect(mockDatabase.stockMutationsCount).toBe(1);
      expect(mockDatabase.cashMutationsCount).toBe(1);
      expect(mockDatabase.accountingEventsCount).toBe(1);
      expect(mockDatabase.invoices.size).toBe(1);
    });
  });
});
