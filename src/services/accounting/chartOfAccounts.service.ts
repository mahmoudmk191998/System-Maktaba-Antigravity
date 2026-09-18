/**
 * Chart of Accounts Service (Phase 9)
 * Manages the hierarchical chart of accounts, standard retail bookstore templates,
 * account code uniqueness, and system account protections.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  runTransaction,
  writeBatch,
} from 'firebase/firestore';
import type { ChartAccount, AccountType, NormalBalance } from '@/types/retail.types';

export interface CreateAccountInput {
  tenantId: string;
  accountCode: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  accountType: AccountType;
  parentId?: string | null;
  normalBalance?: NormalBalance;
  allowPosting?: boolean;
  systemAccount?: boolean;
  systemMappingKey?: string | null;
  description?: string;
}

export interface DefaultAccountTemplate {
  accountCode: string;
  name: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  level: number;
  allowPosting: boolean;
  systemAccount: boolean;
  systemMappingKey?: string;
  parentCode?: string;
}

/**
 * Standard Bookstore & Retail Stationery Chart of Accounts Template
 */
export const DEFAULT_RETAIL_CHART_OF_ACCOUNTS: DefaultAccountTemplate[] = [
  // 1000 - ASSETS
  { accountCode: '1000', name: 'الأصول (Assets)', accountType: 'asset', normalBalance: 'debit', level: 1, allowPosting: false, systemAccount: true },
  { accountCode: '1100', name: 'الأصول المتداولة (Current Assets)', accountType: 'asset', normalBalance: 'debit', level: 2, allowPosting: false, systemAccount: true, parentCode: '1000' },
  { accountCode: '1110', name: 'النقدية وما في حكمها (Cash & Treasury)', accountType: 'asset', normalBalance: 'debit', level: 3, allowPosting: false, systemAccount: true, parentCode: '1100' },
  { accountCode: '1111', name: 'الخزينة الرئيسية (Main Treasury)', accountType: 'asset', normalBalance: 'debit', level: 4, allowPosting: true, systemAccount: true, systemMappingKey: 'defaultCash', parentCode: '1110' },
  { accountCode: '1112', name: 'درج كاشير نقطة البيع (Cash Register)', accountType: 'asset', normalBalance: 'debit', level: 4, allowPosting: true, systemAccount: true, systemMappingKey: 'posCashRegister', parentCode: '1110' },
  { accountCode: '1120', name: 'الحسابات البنكية ومقاصة البطاقات (Bank Accounts & Clearing)', accountType: 'asset', normalBalance: 'debit', level: 3, allowPosting: true, systemAccount: true, systemMappingKey: 'bankClearing', parentCode: '1100' },
  { accountCode: '1130', name: 'المدينون وحسابات العملاء (Accounts Receivable Control)', accountType: 'asset', normalBalance: 'debit', level: 3, allowPosting: true, systemAccount: true, systemMappingKey: 'accountsReceivable', parentCode: '1100' },
  { accountCode: '1140', name: 'مخزون الكتب والأدوات المكتبية (Inventory Control)', accountType: 'asset', normalBalance: 'debit', level: 3, allowPosting: true, systemAccount: true, systemMappingKey: 'inventory', parentCode: '1100' },
  { accountCode: '1150', name: 'سلف وعهد الموظفين (Employee Advances Receivable)', accountType: 'asset', normalBalance: 'debit', level: 3, allowPosting: true, systemAccount: true, systemMappingKey: 'employeeAdvances', parentCode: '1100' },
  { accountCode: '1160', name: 'ضريبة القيمة المضافة المستردة (Recoverable VAT / Input Tax)', accountType: 'asset', normalBalance: 'debit', level: 3, allowPosting: true, systemAccount: true, systemMappingKey: 'taxReceivable', parentCode: '1100' },

  // 2000 - LIABILITIES
  { accountCode: '2000', name: 'الالتزامات (Liabilities)', accountType: 'liability', normalBalance: 'credit', level: 1, allowPosting: false, systemAccount: true },
  { accountCode: '2100', name: 'الالتزامات المتداولة (Current Liabilities)', accountType: 'liability', normalBalance: 'credit', level: 2, allowPosting: false, systemAccount: true, parentCode: '2000' },
  { accountCode: '2110', name: 'الموردون ودور النشر (Accounts Payable Control)', accountType: 'liability', normalBalance: 'credit', level: 3, allowPosting: true, systemAccount: true, systemMappingKey: 'accountsPayable', parentCode: '2100' },
  { accountCode: '2120', name: 'الدفعات المقدمة من العملاء (Customer Advances / Credit Notes)', accountType: 'liability', normalBalance: 'credit', level: 3, allowPosting: true, systemAccount: true, systemMappingKey: 'customerAdvancesLiability', parentCode: '2100' },
  { accountCode: '2130', name: 'ضريبة القيمة المضافة المستحقة (VAT Payable / Output Tax)', accountType: 'liability', normalBalance: 'credit', level: 3, allowPosting: true, systemAccount: true, systemMappingKey: 'taxPayable', parentCode: '2100' },
  { accountCode: '2140', name: 'مستحقات الرواتب والأجور (Payroll Liabilities Payable)', accountType: 'liability', normalBalance: 'credit', level: 3, allowPosting: true, systemAccount: true, systemMappingKey: 'payrollPayable', parentCode: '2100' },

  // 3000 - EQUITY
  { accountCode: '3000', name: 'حقوق الملكية (Equity)', accountType: 'equity', normalBalance: 'credit', level: 1, allowPosting: false, systemAccount: true },
  { accountCode: '3100', name: 'رأس مال المالك / الشركاء (Owner Capital)', accountType: 'equity', normalBalance: 'credit', level: 2, allowPosting: true, systemAccount: true, systemMappingKey: 'ownerCapital', parentCode: '3000' },
  { accountCode: '3200', name: 'الأرباح المحتجزة / المدورة (Retained Earnings)', accountType: 'equity', normalBalance: 'credit', level: 2, allowPosting: true, systemAccount: true, systemMappingKey: 'retainedEarnings', parentCode: '3000' },
  { accountCode: '3300', name: 'رصيد التسوية الافتتاحي (Opening Equity Balance)', accountType: 'equity', normalBalance: 'credit', level: 2, allowPosting: true, systemAccount: true, systemMappingKey: 'openingEquity', parentCode: '3000' },

  // 4000 - REVENUE
  { accountCode: '4000', name: 'الإيرادات والمبيعات (Sales Revenue)', accountType: 'revenue', normalBalance: 'credit', level: 1, allowPosting: false, systemAccount: true },
  { accountCode: '4100', name: 'إيراد مبيعات التجزئة (Retail Sales Revenue)', accountType: 'revenue', normalBalance: 'credit', level: 2, allowPosting: true, systemAccount: true, systemMappingKey: 'retailSalesRevenue', parentCode: '4000' },
  { accountCode: '4200', name: 'إيراد مبيعات الجملة والمدارس (Wholesale Sales Revenue)', accountType: 'revenue', normalBalance: 'credit', level: 2, allowPosting: true, systemAccount: true, systemMappingKey: 'wholesaleSalesRevenue', parentCode: '4000' },
  { accountCode: '4900', name: 'مردودات وخصومات المبيعات (Sales Returns & Allowances)', accountType: 'contra_revenue', normalBalance: 'debit', level: 2, allowPosting: true, systemAccount: true, systemMappingKey: 'salesReturns', parentCode: '4000' },

  // 5000 - COST OF GOODS SOLD
  { accountCode: '5000', name: 'تكلفة المبيعات (Cost of Goods Sold)', accountType: 'cost_of_goods_sold', normalBalance: 'debit', level: 1, allowPosting: false, systemAccount: true },
  { accountCode: '5100', name: 'تكلفة البضاعة المباعة (COGS Control)', accountType: 'cost_of_goods_sold', normalBalance: 'debit', level: 2, allowPosting: true, systemAccount: true, systemMappingKey: 'cogs', parentCode: '5000' },
  { accountCode: '5200', name: 'فروق تكلفة مرتجعات المشتريات (Purchase Return Cost Variance)', accountType: 'cost_of_goods_sold', normalBalance: 'debit', level: 2, allowPosting: true, systemAccount: true, systemMappingKey: 'purchaseReturnVariance', parentCode: '5000' },

  // 6000 - OPERATING EXPENSES
  { accountCode: '6000', name: 'المصروفات التشغيلية والعمومية (Operating Expenses)', accountType: 'expense', normalBalance: 'debit', level: 1, allowPosting: false, systemAccount: true },
  { accountCode: '6100', name: 'مصروفات الرواتب والأجور (Salaries & Wages Expense)', accountType: 'expense', normalBalance: 'debit', level: 2, allowPosting: true, systemAccount: true, systemMappingKey: 'salaryExpense', parentCode: '6000' },
  { accountCode: '6200', name: 'مصروف الإيجار (Rent Expense)', accountType: 'expense', normalBalance: 'debit', level: 2, allowPosting: true, systemAccount: false, parentCode: '6000' },
  { accountCode: '6300', name: 'المرافق والكهرباء والمياه (Utilities Expense)', accountType: 'expense', normalBalance: 'debit', level: 2, allowPosting: true, systemAccount: false, parentCode: '6000' },
  { accountCode: '6400', name: 'مصروفات الصيانة والنظافة (Maintenance Expense)', accountType: 'expense', normalBalance: 'debit', level: 2, allowPosting: true, systemAccount: false, parentCode: '6000' },
  { accountCode: '6500', name: 'مصروفات النقل والشحن (Shipping & Transportation)', accountType: 'expense', normalBalance: 'debit', level: 2, allowPosting: true, systemAccount: false, parentCode: '6000' },
  { accountCode: '6600', name: 'التسويق والإعلان (Marketing & Advertising)', accountType: 'expense', normalBalance: 'debit', level: 2, allowPosting: true, systemAccount: false, parentCode: '6000' },
  { accountCode: '6700', name: 'مصروفات الهالك وتالف الكتب والمستلزمات (Inventory Damage/Loss Expense)', accountType: 'expense', normalBalance: 'debit', level: 2, allowPosting: true, systemAccount: true, systemMappingKey: 'inventoryDamageExpense', parentCode: '6000' },
  { accountCode: '6800', name: 'مصروف عجز الجرد المخزني (Inventory Shrinkage Expense)', accountType: 'expense', normalBalance: 'debit', level: 2, allowPosting: true, systemAccount: true, systemMappingKey: 'inventoryShrinkageExpense', parentCode: '6000' },
  { accountCode: '6900', name: 'مصروفات عمومية وإدارية أخرى (Other Operating Expenses)', accountType: 'expense', normalBalance: 'debit', level: 2, allowPosting: true, systemAccount: false, parentCode: '6000' },

  // 7000 - OTHER INCOME & GAINS
  { accountCode: '7000', name: 'إيرادات وأرباح أخرى (Other Income & Gains)', accountType: 'revenue', normalBalance: 'credit', level: 1, allowPosting: false, systemAccount: true },
  { accountCode: '7100', name: 'أرباح تسوية زيادة الجرد (Inventory Count Gain / Adjustment Income)', accountType: 'revenue', normalBalance: 'credit', level: 2, allowPosting: true, systemAccount: true, systemMappingKey: 'inventoryGain', parentCode: '7000' },
  { accountCode: '7200', name: 'فروق وفواكه تقريب العملات (Currency Rounding Adjustments)', accountType: 'revenue', normalBalance: 'credit', level: 2, allowPosting: true, systemAccount: true, systemMappingKey: 'roundingAccount', parentCode: '7000' },
];

/**
 * Returns default normal balance for an account type.
 */
export function getDefaultNormalBalance(accountType: AccountType): NormalBalance {
  switch (accountType) {
    case 'asset':
    case 'expense':
    case 'cost_of_goods_sold':
    case 'contra_revenue':
      return 'debit';
    case 'liability':
    case 'equity':
    case 'revenue':
    case 'contra_asset':
    default:
      return 'credit';
  }
}

/**
 * Deterministic account code document lock ID
 */
export function getAccountCodeIndexDocId(tenantId: string, accountCode: string): string {
  return `${tenantId}___${accountCode.trim()}`;
}

/**
 * Seeds the standard bookstore Chart of Accounts for a tenant if not already present.
 */
export async function seedDefaultChartOfAccounts(tenantId: string): Promise<{ createdCount: number }> {
  if (!tenantId) throw new Error('Tenant ID required to seed chart of accounts');

  // Check if tenant already has chart of accounts
  const existingSnap = await getDocs(
    query(collection(db, 'chart_of_accounts'), where('tenantId', '==', tenantId))
  );
  if (!existingSnap.empty) {
    return { createdCount: 0 };
  }

  const batch = writeBatch(db);
  const now = new Date().toISOString();
  let createdCount = 0;

  // First pass: generate IDs mapped by code
  const codeToIdMap: Record<string, string> = {};
  for (const item of DEFAULT_RETAIL_CHART_OF_ACCOUNTS) {
    const docRef = doc(collection(db, 'chart_of_accounts'));
    codeToIdMap[item.accountCode] = docRef.id;
  }

  // Second pass: insert with proper parentId
  for (const item of DEFAULT_RETAIL_CHART_OF_ACCOUNTS) {
    const docId = codeToIdMap[item.accountCode];
    const parentId = item.parentCode ? (codeToIdMap[item.parentCode] || null) : null;
    const docRef = doc(db, 'chart_of_accounts', docId);

    const accountDoc: ChartAccount = {
      id: docId,
      tenantId,
      accountCode: item.accountCode,
      name: item.name,
      accountType: item.accountType,
      parentId,
      normalBalance: item.normalBalance,
      level: item.level,
      allowPosting: item.allowPosting,
      systemAccount: item.systemAccount,
      systemMappingKey: item.systemMappingKey || null,
      active: true,
      currentBalance: 0,
      createdAt: now,
      updatedAt: now,
    };

    batch.set(docRef, accountDoc);

    // Index lock document for unique code enforcement
    const indexRef = doc(db, 'account_code_index', getAccountCodeIndexDocId(tenantId, item.accountCode));
    batch.set(indexRef, {
      tenantId,
      accountCode: item.accountCode,
      accountId: docId,
      createdAt: now,
    });

    createdCount++;
  }

  await batch.commit();
  return { createdCount };
}

/**
 * Fetches the entire Chart of Accounts for a tenant, ordered by accountCode ascending.
 */
export async function getChartOfAccounts(tenantId: string): Promise<ChartAccount[]> {
  if (!tenantId) return [];

  const q = query(
    collection(db, 'chart_of_accounts'),
    where('tenantId', '==', tenantId),
    orderBy('accountCode', 'asc')
  );

  const snap = await getDocs(q);
  if (snap.empty) {
    // If empty, auto-seed defaults and re-fetch
    await seedDefaultChartOfAccounts(tenantId);
    const snap2 = await getDocs(q);
    return snap2.docs.map((d) => d.data() as ChartAccount);
  }

  return snap.docs.map((d) => d.data() as ChartAccount);
}

/**
 * Creates a new account in the Chart of Accounts with strict code uniqueness.
 */
export async function createAccount(input: CreateAccountInput): Promise<ChartAccount> {
  const {
    tenantId,
    accountCode,
    name,
    nameAr,
    nameEn,
    accountType,
    parentId = null,
    normalBalance = getDefaultNormalBalance(accountType),
    allowPosting = true,
    systemAccount = false,
    systemMappingKey = null,
    description,
  } = input;

  if (!tenantId || !accountCode || !name || !accountType) {
    throw new Error('كود الحساب واسم الحساب ونوعه ومُعرّف المنشأة حقول إلزامية');
  }

  const cleanCode = accountCode.trim();
  const indexDocId = getAccountCodeIndexDocId(tenantId, cleanCode);
  const indexRef = doc(db, 'account_code_index', indexDocId);
  const accountRef = doc(collection(db, 'chart_of_accounts'));
  const now = new Date().toISOString();

  return await runTransaction(db, async (tx) => {
    // 1. Verify code uniqueness
    const indexSnap = await tx.get(indexRef);
    if (indexSnap.exists()) {
      throw new Error(`كود الحساب (${cleanCode}) مستخدم مسبقاً في هذه المنشأة`);
    }

    // 2. Check parent level if parentId provided
    let level = 1;
    if (parentId) {
      const parentRef = doc(db, 'chart_of_accounts', parentId);
      const parentSnap = await tx.get(parentRef);
      if (parentSnap.exists()) {
        const parentData = parentSnap.data() as ChartAccount;
        level = (parentData.level || 1) + 1;
      }
    }

    const newAccount: ChartAccount = {
      id: accountRef.id,
      tenantId,
      accountCode: cleanCode,
      name: name.trim(),
      nameAr: nameAr?.trim() || name.trim(),
      nameEn: nameEn?.trim() || '',
      accountType,
      parentId: parentId || null,
      normalBalance,
      level,
      allowPosting,
      systemAccount: !!systemAccount,
      systemMappingKey: systemMappingKey || null,
      active: true,
      description: description?.trim() || '',
      currentBalance: 0,
      createdAt: now,
      updatedAt: now,
    };

    tx.set(accountRef, newAccount);
    tx.set(indexRef, {
      tenantId,
      accountCode: cleanCode,
      accountId: accountRef.id,
      createdAt: now,
    });

    return newAccount;
  });
}

/**
 * Updates an account's name or metadata. Protects system accounts from breaking mappings.
 */
export async function updateAccount(
  accountId: string,
  tenantId: string,
  updates: Partial<Pick<ChartAccount, 'name' | 'nameAr' | 'nameEn' | 'description' | 'allowPosting' | 'active'>>
): Promise<void> {
  const accountRef = doc(db, 'chart_of_accounts', accountId);
  const snap = await getDoc(accountRef);
  if (!snap.exists()) throw new Error('الحساب غير موجود');

  const acc = snap.data() as ChartAccount;
  if (acc.tenantId !== tenantId) throw new Error('غير مصرح بتعديل هذا الحساب');

  if (acc.systemAccount && updates.active === false) {
    throw new Error('لا يمكن تعطيل حساب نظام أساسي مرتبط بقواعد الترحيل الآلي');
  }

  const safeUpdates: Record<string, any> = {
    updatedAt: new Date().toISOString(),
  };

  if (updates.name !== undefined) safeUpdates.name = updates.name.trim();
  if (updates.nameAr !== undefined) safeUpdates.nameAr = updates.nameAr.trim();
  if (updates.nameEn !== undefined) safeUpdates.nameEn = updates.nameEn.trim();
  if (updates.description !== undefined) safeUpdates.description = updates.description.trim();
  if (updates.allowPosting !== undefined) safeUpdates.allowPosting = !!updates.allowPosting;
  if (updates.active !== undefined) safeUpdates.active = !!updates.active;

  await runTransaction(db, async (tx) => {
    tx.update(accountRef, safeUpdates);
  });
}

/**
 * Safely deletes an account only if it has NO sub-accounts, NO journal lines, and is NOT a system account.
 */
export async function safeDeleteAccount(accountId: string, tenantId: string): Promise<void> {
  const accountRef = doc(db, 'chart_of_accounts', accountId);
  const snap = await getDoc(accountRef);
  if (!snap.exists()) throw new Error('الحساب غير موجود');

  const acc = snap.data() as ChartAccount;
  if (acc.tenantId !== tenantId) throw new Error('غير مصرح بحذف هذا الحساب');

  if (acc.systemAccount) {
    throw new Error('لا يمكن حذف حساب نظام أساسي مرتبط بقواعد الترحيل الآلي للقيود');
  }

  // Check for child accounts
  const childrenSnap = await getDocs(
    query(collection(db, 'chart_of_accounts'), where('tenantId', '==', tenantId), where('parentId', '==', accountId))
  );
  if (!childrenSnap.empty) {
    throw new Error('لا يمكن حذف حساب رئيسي يحتوي على حسابات فرعية تحته؛ احذف الحسابات الفرعية أولاً');
  }

  // Check for journal lines
  const linesSnap = await getDocs(
    query(collection(db, 'journal_lines'), where('accountId', '==', accountId))
  );
  if (!linesSnap.empty) {
    throw new Error('لا يمكن حذف حساب مالي تم تقييد حركات وقيود يومية عليه مسبقاً؛ يمكنك تعطيله فقط للحفاظ على النزاهة المحاسبية');
  }

  const indexRef = doc(db, 'account_code_index', getAccountCodeIndexDocId(tenantId, acc.accountCode));

  await runTransaction(db, async (tx) => {
    tx.delete(accountRef);
    tx.delete(indexRef);
  });
}

/**
 * Finds a system account by its mapping key (e.g. 'accountsReceivable', 'inventory', 'cogs').
 */
export async function getSystemAccountByMappingKey(
  tenantId: string,
  mappingKey: string
): Promise<ChartAccount | null> {
  const q = query(
    collection(db, 'chart_of_accounts'),
    where('tenantId', '==', tenantId),
    where('systemMappingKey', '==', mappingKey),
    where('active', '==', true)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as ChartAccount;
}

export const createChartAccount = createAccount;
