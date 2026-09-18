/**
 * System Health & Data Integrity Diagnostics Service (Phase 11 - Hardened)
 * Automated audit of ledger reconciliation, outbox exceptions, duplicate keys,
 * and cross-module integrity with robust isolated fault tolerance.
 */

import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, limit as fsLimit } from 'firebase/firestore';
import { fetchOutboxExceptions, AccountingEventPayload } from '../accounting/outboxProcessor.service';
import { generateFinancialBIMetrics } from '../analytics/financialBI.service';
import { getDateRangeFromPreset } from '../analytics/reportingTimezone';

export interface IntegrityCheckResult {
  checkId: string;
  nameAr: string;
  nameEn: string;
  category: 'accounting' | 'inventory' | 'sales' | 'partners' | 'outbox' | 'system';
  status: 'healthy' | 'warning' | 'critical' | 'unavailable';
  detailsAr: string;
  detailsEn: string;
  metrics?: Record<string, number | string>;
  canSafeRepair?: boolean;
  repairActionId?: string;
}

export interface SystemHealthReport {
  overallStatus: 'healthy' | 'warning' | 'critical';
  timestamp: string;
  checks: IntegrityCheckResult[];
  unresolvedDeadLettersCount: number;
  totalChecksCount: number;
  warningsCount: number;
  criticalCount: number;
}

/**
 * 1. Check Outbox Dead-Letter & Failure Health
 */
async function checkOutboxHealth(tenantId: string): Promise<{ check: IntegrityCheckResult; deadLettersCount: number }> {
  try {
    const exceptions = await fetchOutboxExceptions(tenantId);
    const deadLetters = exceptions.filter((e) => e.status === 'dead_letter');
    const failedEvents = exceptions.filter((e) => e.status === 'failed');

    if (deadLetters.length > 0) {
      return {
        check: {
          checkId: 'outbox_dead_letter',
          nameAr: 'صندوق القيود المحاسبية المعطلة (Dead-Letter Queue)',
          nameEn: 'Accounting Outbox Dead-Letter Queue',
          category: 'outbox',
          status: 'critical',
          detailsAr: `تم رصد ${deadLetters.length} قيد محاسبي فشل بشكل دائم ويحتاج لتدخل المحاسب لإعادة الترحيل.`,
          detailsEn: `${deadLetters.length} permanent accounting outbox failures detected.`,
          metrics: { deadLettersCount: deadLetters.length, failedCount: failedEvents.length },
          canSafeRepair: true,
          repairActionId: 'retry_outbox',
        },
        deadLettersCount: deadLetters.length,
      };
    }

    if (failedEvents.length > 0) {
      return {
        check: {
          checkId: 'outbox_failed_transient',
          nameAr: 'أحداث محاسبية قيد إعادة المحاولة التلقائية',
          nameEn: 'Accounting Outbox Retries in Progress',
          category: 'outbox',
          status: 'warning',
          detailsAr: `يوجد ${failedEvents.length} حدث محاسبي يمر بفترة التراجع الزمني لإعادة المحاولة (Exponential Backoff).`,
          detailsEn: `${failedEvents.length} accounting events currently in retry backoff.`,
          metrics: { failedCount: failedEvents.length },
        },
        deadLettersCount: 0,
      };
    }

    return {
      check: {
        checkId: 'outbox_healthy',
        nameAr: 'صندوق الصادر المحاسبي (Outbox Processor)',
        nameEn: 'Accounting Outbox Health',
        category: 'outbox',
        status: 'healthy',
        detailsAr: 'كافة القيود المحاسبية مرحلة بدقة وبدون أي تراكمات أو أخطاء معلقة.',
        detailsEn: 'All accounting outbox events processed successfully.',
      },
      deadLettersCount: 0,
    };
  } catch (err: any) {
    console.warn('SystemHealth: Outbox check failed:', err);
    return {
      check: {
        checkId: 'outbox_healthy',
        nameAr: 'صندوق الصادر المحاسبي (Outbox Processor)',
        nameEn: 'Accounting Outbox Health',
        category: 'outbox',
        status: 'unavailable',
        detailsAr: 'تعذر الاتصال بسجل أحداث الصندوق المحاسبي حالياً (قد يتطلب أذونات محاسبية).',
        detailsEn: 'Unable to query accounting outbox events at this time.',
      },
      deadLettersCount: 0,
    };
  }
}

/**
 * 2. Check Customer Ledger Reconciliation
 */
async function checkCustomerLedgerHealth(tenantId: string): Promise<IntegrityCheckResult> {
  try {
    const custSnap = await getDocs(query(collection(db, 'customers'), where('tenantId', '==', tenantId)));
    const ledgerSnap = await getDocs(query(collection(db, 'customer_ledger'), where('tenantId', '==', tenantId)));

    const ledgerBalMap = new Map<string, number>();
    ledgerSnap.forEach((d) => {
      const entry = d.data();
      const cid = entry.customerId;
      if (cid) {
        const debit = Number(entry.debit || 0);
        const credit = Number(entry.credit || 0);
        ledgerBalMap.set(cid, (ledgerBalMap.get(cid) || 0) + (debit - credit));
      }
    });

    let custMismatches = 0;
    custSnap.forEach((d) => {
      const cust = d.data();
      const statedBal = Number(cust.currentBalance || 0);
      const calculatedBal = Number((ledgerBalMap.get(d.id) || 0).toFixed(2));
      if (Math.abs(statedBal - calculatedBal) > 0.1) {
        custMismatches++;
      }
    });

    if (custMismatches > 0) {
      return {
        checkId: 'customer_ledger_reconciliation',
        nameAr: 'مطابقة أرصدة العملاء مع دفتر أستاذ العملاء',
        nameEn: 'Customer Balance vs Customer Ledger',
        category: 'partners',
        status: 'warning',
        detailsAr: `تم رصد فارق في مطابقة الرصيد لـ ${custMismatches} عميل مقارنة بحركات دفتر الأستاذ.`,
        detailsEn: `Discrepancy found between customer balance and ledger entries for ${custMismatches} customers.`,
        metrics: { mismatchedCustomers: custMismatches },
      };
    }

    return {
      checkId: 'customer_ledger_reconciliation',
      nameAr: 'مطابقة أرصدة العملاء مع دفتر أستاذ العملاء',
      nameEn: 'Customer Balance vs Customer Ledger',
      category: 'partners',
      status: 'healthy',
      detailsAr: 'تطابق تام بين أرصدة العملاء وسجل حركات دفتر أستاذ العملاء.',
      detailsEn: '100% match between customer balances and customer ledger.',
    };
  } catch (err: any) {
    console.warn('SystemHealth: Customer ledger check error:', err);
    return {
      checkId: 'customer_ledger_reconciliation',
      nameAr: 'مطابقة أرصدة العملاء مع دفتر أستاذ العملاء',
      nameEn: 'Customer Balance vs Customer Ledger',
      category: 'partners',
      status: 'unavailable',
      detailsAr: 'تعذر مطابقة سجلات العملاء ودفتر الأستاذ في الوقت الحالي.',
      detailsEn: 'Customer ledger reconciliation check unavailable.',
    };
  }
}

/**
 * 3. Check Supplier Ledger Reconciliation
 */
async function checkSupplierLedgerHealth(tenantId: string): Promise<IntegrityCheckResult> {
  try {
    const supSnap = await getDocs(query(collection(db, 'suppliers'), where('tenantId', '==', tenantId)));
    const sLedgerSnap = await getDocs(query(collection(db, 'supplier_ledger'), where('tenantId', '==', tenantId)));

    const sLedgerBalMap = new Map<string, number>();
    sLedgerSnap.forEach((d) => {
      const entry = d.data();
      const sid = entry.supplierId;
      if (sid) {
        const debit = Number(entry.debit || 0);
        const credit = Number(entry.credit || 0);
        // Suppliers normal balance is credit (we owe them)
        sLedgerBalMap.set(sid, (sLedgerBalMap.get(sid) || 0) + (credit - debit));
      }
    });

    let supMismatches = 0;
    supSnap.forEach((d) => {
      const sup = d.data();
      const statedBal = Number(sup.currentBalance || 0);
      const calculatedBal = Number((sLedgerBalMap.get(d.id) || 0).toFixed(2));
      if (Math.abs(statedBal - calculatedBal) > 0.1) {
        supMismatches++;
      }
    });

    if (supMismatches > 0) {
      return {
        checkId: 'supplier_ledger_reconciliation',
        nameAr: 'مطابقة أرصدة الموردين مع دفتر أستاذ الموردين',
        nameEn: 'Supplier Balance vs Supplier Ledger',
        category: 'partners',
        status: 'warning',
        detailsAr: `تم رصد فارق في مطابقة الرصيد لـ ${supMismatches} مورد مقارنة بدفتر أستاذ الموردين.`,
        detailsEn: `Discrepancy found between supplier balance and ledger entries for ${supMismatches} suppliers.`,
        metrics: { mismatchedSuppliers: supMismatches },
      };
    }

    return {
      checkId: 'supplier_ledger_reconciliation',
      nameAr: 'مطابقة أرصدة الموردين مع دفتر أستاذ الموردين',
      nameEn: 'Supplier Balance vs Supplier Ledger',
      category: 'partners',
      status: 'healthy',
      detailsAr: 'تطابق تام بين أرصدة الموردين وسجل حركات دفتر أستاذ الموردين.',
      detailsEn: '100% match between supplier balances and supplier ledger.',
    };
  } catch (err: any) {
    console.warn('SystemHealth: Supplier ledger check error:', err);
    return {
      checkId: 'supplier_ledger_reconciliation',
      nameAr: 'مطابقة أرصدة الموردين مع دفتر أستاذ الموردين',
      nameEn: 'Supplier Balance vs Supplier Ledger',
      category: 'partners',
      status: 'unavailable',
      detailsAr: 'تعذر مطابقة سجلات الموردين ودفتر الأستاذ في الوقت الحالي.',
      detailsEn: 'Supplier ledger reconciliation check unavailable.',
    };
  }
}

/**
 * 4. Check Duplicate SKU & Barcode in Catalog
 */
async function checkCatalogDuplicateHealth(tenantId: string): Promise<IntegrityCheckResult> {
  try {
    const prodSnap = await getDocs(query(collection(db, 'products'), where('tenantId', '==', tenantId)));
    const skuMap = new Map<string, number>();
    const barcodeMap = new Map<string, number>();

    prodSnap.forEach((d) => {
      const p = d.data();
      if (p.sku) {
        const s = String(p.sku).trim().toLowerCase();
        skuMap.set(s, (skuMap.get(s) || 0) + 1);
      }
      if (p.barcode) {
        const b = String(p.barcode).trim().toLowerCase();
        barcodeMap.set(b, (barcodeMap.get(b) || 0) + 1);
      }
    });

    const dupSkus = Array.from(skuMap.entries()).filter(([_, count]) => count > 1);
    const dupBars = Array.from(barcodeMap.entries()).filter(([_, count]) => count > 1);

    if (dupSkus.length > 0 || dupBars.length > 0) {
      return {
        checkId: 'duplicate_catalog_identifiers',
        nameAr: 'فحص تكرار الباركود والـ SKU في الفهرس',
        nameEn: 'Catalog Duplicate SKU / Barcode Check',
        category: 'inventory',
        status: 'warning',
        detailsAr: `تم رصد ${dupSkus.length} كود SKU مكرر و ${dupBars.length} باركود مكرر في دليل المنتجات.`,
        detailsEn: `${dupSkus.length} duplicate SKUs and ${dupBars.length} duplicate barcodes detected.`,
        metrics: { duplicateSkusCount: dupSkus.length, duplicateBarcodesCount: dupBars.length },
      };
    }

    return {
      checkId: 'duplicate_catalog_identifiers',
      nameAr: 'فحص تكرار الباركود والـ SKU في الفهرس',
      nameEn: 'Catalog Duplicate SKU / Barcode Check',
      category: 'inventory',
      status: 'healthy',
      detailsAr: 'كافة أكواد SKU والباركود فريدة تماماً ولا توجد تكرارات.',
      detailsEn: 'All product SKUs and barcodes are strictly unique.',
    };
  } catch (err: any) {
    console.warn('SystemHealth: Catalog duplicate check error:', err);
    return {
      checkId: 'duplicate_catalog_identifiers',
      nameAr: 'فحص تكرار الباركود والـ SKU في الفهرس',
      nameEn: 'Catalog Duplicate SKU / Barcode Check',
      category: 'inventory',
      status: 'unavailable',
      detailsAr: 'تعذر فحص تكرار المنتجات في الوقت الحالي.',
      detailsEn: 'Product duplicate check unavailable.',
    };
  }
}

/**
 * 5. Check Financial GL Equilibrium (Balance Sheet Equation)
 */
async function checkGlEquilibriumHealth(tenantId: string): Promise<IntegrityCheckResult> {
  try {
    const range = getDateRangeFromPreset('this_month');
    const fin = await generateFinancialBIMetrics(tenantId, range);

    // Assets == Liabilities + Equity check
    const diff = Math.abs(fin.totalAssets - (fin.totalLiabilities + fin.totalEquity));
    if (diff > 0.1) {
      return {
        checkId: 'gl_accounting_equilibrium',
        nameAr: 'معادلة الميزانية العمومية (الأصول = الالتزامات + حقوق الملكية)',
        nameEn: 'Balance Sheet Accounting Equation Equilibrium',
        category: 'accounting',
        status: 'critical',
        detailsAr: `عدم توازن في معادلة المركز المالي بفارق مقداره ${diff.toFixed(2)} ج.م.`,
        detailsEn: `Balance Sheet out of equilibrium by ${diff.toFixed(2)}.`,
        metrics: { difference: diff },
      };
    }

    return {
      checkId: 'gl_accounting_equilibrium',
      nameAr: 'معادلة الميزانية العمومية (الأصول = الالتزامات + حقوق الملكية)',
      nameEn: 'Balance Sheet Accounting Equation Equilibrium',
      category: 'accounting',
      status: 'healthy',
      detailsAr: 'معادلة المركز المالي متطابقة ومتوازنة محاسبياً بنسبة 100%.',
      detailsEn: 'Balance Sheet equation is perfectly balanced (Assets = Liabilities + Equity).',
    };
  } catch (err: any) {
    console.warn('SystemHealth: Accounting equilibrium check error:', err);
    return {
      checkId: 'gl_accounting_equilibrium',
      nameAr: 'معادلة الميزانية العمومية (الأصول = الالتزامات + حقوق الملكية)',
      nameEn: 'Balance Sheet Accounting Equation Equilibrium',
      category: 'accounting',
      status: 'unavailable',
      detailsAr: 'فحص معادلة الميزانية غير متاح حالياً (يتطلب قيود محاسبية مرحلة أو إعداد دليل الحسابات).',
      detailsEn: 'Balance Sheet equilibrium check unavailable.',
    };
  }
}

/**
 * Execute Full System Integrity Diagnostics
 * Executes all 5 checks with complete fault isolation via Promise.allSettled
 */
export async function runSystemIntegrityDiagnostics(tenantId: string): Promise<SystemHealthReport> {
  const now = new Date().toISOString();

  // Run all checks in parallel with complete isolation
  const [outboxSettled, custSettled, supSettled, catSettled, glSettled] = await Promise.allSettled([
    checkOutboxHealth(tenantId),
    checkCustomerLedgerHealth(tenantId),
    checkSupplierLedgerHealth(tenantId),
    checkCatalogDuplicateHealth(tenantId),
    checkGlEquilibriumHealth(tenantId),
  ]);

  const checks: IntegrityCheckResult[] = [];
  let deadLettersCount = 0;

  if (outboxSettled.status === 'fulfilled') {
    checks.push(outboxSettled.value.check);
    deadLettersCount = outboxSettled.value.deadLettersCount;
  } else {
    checks.push({
      checkId: 'outbox_healthy',
      nameAr: 'صندوق الصادر المحاسبي (Outbox Processor)',
      nameEn: 'Accounting Outbox Health',
      category: 'outbox',
      status: 'unavailable',
      detailsAr: 'تعذر تشغيل فحص صندوق الصادر المحاسبي.',
      detailsEn: 'Outbox check failed.',
    });
  }

  if (custSettled.status === 'fulfilled') {
    checks.push(custSettled.value);
  } else {
    checks.push({
      checkId: 'customer_ledger_reconciliation',
      nameAr: 'مطابقة أرصدة العملاء مع دفتر أستاذ العملاء',
      nameEn: 'Customer Balance vs Customer Ledger',
      category: 'partners',
      status: 'unavailable',
      detailsAr: 'تعذر تشغيل فحص مطابقة أرصدة العملاء.',
      detailsEn: 'Customer ledger check failed.',
    });
  }

  if (supSettled.status === 'fulfilled') {
    checks.push(supSettled.value);
  } else {
    checks.push({
      checkId: 'supplier_ledger_reconciliation',
      nameAr: 'مطابقة أرصدة الموردين مع دفتر أستاذ الموردين',
      nameEn: 'Supplier Balance vs Supplier Ledger',
      category: 'partners',
      status: 'unavailable',
      detailsAr: 'تعذر تشغيل فحص مطابقة أرصدة الموردين.',
      detailsEn: 'Supplier ledger check failed.',
    });
  }

  if (catSettled.status === 'fulfilled') {
    checks.push(catSettled.value);
  } else {
    checks.push({
      checkId: 'duplicate_catalog_identifiers',
      nameAr: 'فحص تكرار الباركود والـ SKU في الفهرس',
      nameEn: 'Catalog Duplicate SKU / Barcode Check',
      category: 'inventory',
      status: 'unavailable',
      detailsAr: 'تعذر تشغيل فحص تكرار بيانات الفهرس.',
      detailsEn: 'Catalog duplicate check failed.',
    });
  }

  if (glSettled.status === 'fulfilled') {
    checks.push(glSettled.value);
  } else {
    checks.push({
      checkId: 'gl_accounting_equilibrium',
      nameAr: 'معادلة الميزانية العمومية (الأصول = الالتزامات + حقوق الملكية)',
      nameEn: 'Balance Sheet Accounting Equation Equilibrium',
      category: 'accounting',
      status: 'unavailable',
      detailsAr: 'تعذر تشغيل فحص توازن الميزانية العمومية.',
      detailsEn: 'GL equilibrium check failed.',
    });
  }

  // Compute summary stats
  const criticalCount = checks.filter((c) => c.status === 'critical').length;
  const warningsCount = checks.filter((c) => c.status === 'warning').length;

  let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
  if (criticalCount > 0) overallStatus = 'critical';
  else if (warningsCount > 0) overallStatus = 'warning';

  return {
    overallStatus,
    timestamp: now,
    checks,
    unresolvedDeadLettersCount: deadLettersCount,
    totalChecksCount: checks.length,
    warningsCount,
    criticalCount,
  };
}
