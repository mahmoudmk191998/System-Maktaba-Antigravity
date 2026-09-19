/**
 * Reporting Timezone & Date Utilities
 * 
 * Ensures all financial partitions (YYYY-MM-DD and YYYY-MM) are determined 
 * strictly according to the Tenant's business timezone (default: Africa/Cairo),
 * completely preventing edge-case bugs around midnight boundaries.
 */

export const DEFAULT_BUSINESS_TIMEZONE = 'Africa/Cairo';

/**
 * Universal Date Parser: accepts Firestore Timestamp ({ seconds }), ISO string, timestamp number, Date object
 */
export function parseToTenantDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    if (!isNaN(parsed)) return new Date(parsed);
    // Support YYYY-MM-DD directly
    const parts = val.split('-');
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10) - 1;
      const d = parseInt(parts[2], 10);
      return new Date(y, m, d, 12, 0, 0);
    }
  }
  return null;
}

/**
 * Formats a Date/Timestamp into YYYY-MM-DD partition in business timezone
 */
export function getTenantDateString(
  dateInput?: any,
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE
): string {
  const d = parseToTenantDate(dateInput) || new Date();
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || DEFAULT_BUSINESS_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(d); // en-CA produces YYYY-MM-DD
  } catch {
    return d.toISOString().split('T')[0];
  }
}

/**
 * Formats a Date/Timestamp into YYYY-MM partition in business timezone
 */
export function getTenantMonthString(
  dateInput?: any,
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE
): string {
  const dayStr = getTenantDateString(dateInput, timeZone);
  return dayStr.substring(0, 7); // YYYY-MM
}

/**
 * Gets yesterday's YYYY-MM-DD string in business timezone
 */
export function getTenantYesterdayString(
  dateInput?: any,
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE
): string {
  const d = parseToTenantDate(dateInput) || new Date();
  const yesterday = new Date(d);
  yesterday.setDate(yesterday.getDate() - 1);
  return getTenantDateString(yesterday, timeZone);
}
