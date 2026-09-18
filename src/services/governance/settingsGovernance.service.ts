/**
 * Settings Governance & Central Validation Service
 * Validates sensitive settings mutations and logs changes into `settings_audit_log`.
 */

import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, limit as fsLimit } from 'firebase/firestore';

export interface SettingsAuditRecord {
  id?: string;
  tenantId: string;
  category: string;
  changedByUserId: string;
  changedByUserName: string;
  timestamp: string;
  beforeSnapshot: Record<string, any>;
  afterSnapshot: Record<string, any>;
  changedKeys: string[];
}

export interface SettingsValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate Business & Legal Settings
 */
export function validateBusinessSettings(settings: {
  businessName?: string;
  taxNumber?: string;
  commercialRegistration?: string;
  phone?: string;
}): SettingsValidationResult {
  const errors: string[] = [];
  if (!settings.businessName || settings.businessName.trim() === '') {
    errors.push('اسم المنشأة التجاري مطلوب ولا يمكن تركه فارغاً');
  }
  if (settings.taxNumber && !/^[0-9\-]+$/.test(settings.taxNumber.trim())) {
    errors.push('الرقم الضريبي يحتوي على صيغة غير صالحة');
  }
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate Pricing, Credit & Tax Settings
 */
export function validatePricingSettings(settings: {
  taxPercent?: number;
  creditTermsDaysDefault?: number;
  maxDiscountPercentAllowed?: number;
}): SettingsValidationResult {
  const errors: string[] = [];
  if (settings.taxPercent !== undefined) {
    if (settings.taxPercent < 0 || settings.taxPercent > 100) {
      errors.push('نسبة الضريبة يجب أن تكون بين 0% و 100%');
    }
  }
  if (settings.creditTermsDaysDefault !== undefined) {
    if (settings.creditTermsDaysDefault < 0 || settings.creditTermsDaysDefault > 365) {
      errors.push('فترة الائتمان يجب أن تكون رقماً موجباً لا يتجاوز 365 يوماً');
    }
  }
  if (settings.maxDiscountPercentAllowed !== undefined) {
    if (settings.maxDiscountPercentAllowed < 0 || settings.maxDiscountPercentAllowed > 100) {
      errors.push('الحد الأقصى للخصم يجب أن يكون بين 0% و 100%');
    }
  }
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validate Inventory & Reorder Settings
 */
export function validateInventorySettings(settings: {
  defaultLeadTimeDays?: number;
  defaultSafetyStockDays?: number;
  deadStockThresholdDays?: number;
}): SettingsValidationResult {
  const errors: string[] = [];
  if (settings.defaultLeadTimeDays !== undefined && settings.defaultLeadTimeDays < 0) {
    errors.push('مدة التوريد الافتراضية يجب أن تكون رقماً موجباً');
  }
  if (settings.defaultSafetyStockDays !== undefined && settings.defaultSafetyStockDays < 0) {
    errors.push('أيام مخزون الأمان يجب أن تكون رقماً موجباً');
  }
  if (settings.deadStockThresholdDays !== undefined && settings.deadStockThresholdDays < 30) {
    errors.push('حد الركود المخزني يجب ألا يقل عن 30 يوماً');
  }
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Log Settings Changes to Audit Log
 */
export async function recordSettingsAudit(
  tenantId: string,
  category: string,
  before: Record<string, any>,
  after: Record<string, any>,
  user: { uid: string; name: string }
): Promise<string> {
  const changedKeys = Object.keys(after).filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])
  );

  const record: SettingsAuditRecord = {
    tenantId,
    category,
    changedByUserId: user.uid,
    changedByUserName: user.name,
    timestamp: new Date().toISOString(),
    beforeSnapshot: before,
    afterSnapshot: after,
    changedKeys,
  };

  const docRef = await addDoc(collection(db, 'settings_audit_log'), record);
  return docRef.id;
}

/**
 * Fetch Settings Audit History
 */
export async function fetchSettingsAuditHistory(
  tenantId: string,
  category?: string
): Promise<SettingsAuditRecord[]> {
  const ref = collection(db, 'settings_audit_log');
  let q = query(ref, where('tenantId', '==', tenantId), fsLimit(50));
  if (category) {
    q = query(q, where('category', '==', category));
  }
  const snap = await getDocs(q);
  const records: SettingsAuditRecord[] = [];
  snap.forEach((d) => records.push({ id: d.id, ...d.data() } as SettingsAuditRecord));
  return records.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
