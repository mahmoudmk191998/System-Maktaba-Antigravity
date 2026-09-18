/**
 * Reporting Timezone & Date Preset Utility
 * Ensures all BI aggregation and period boundaries respect the local timezone (Default: Africa/Cairo)
 * avoiding UTC day-shift errors (e.g., 23:30 Cairo time).
 */

export const DEFAULT_TIMEZONE = 'Africa/Cairo';

export type DatePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_7_days'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year'
  | 'all'
  | 'custom';

export type ComparisonMode = 'none' | 'previous_period' | 'previous_year';

export interface DateRange {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  startIso: string;  // ISO timestamp
  endIso: string;    // ISO timestamp
}

export interface ComparisonRange {
  current: DateRange;
  comparison?: DateRange;
  mode: ComparisonMode;
}

/**
 * Get date parts (year, month 1-12, day, hour, min, sec) in target timezone
 */
export function getZonedParts(date: Date, timeZone: string = DEFAULT_TIMEZONE): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }

  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour === '24' ? '0' : map.hour, 10),
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
  };
}

/**
 * Universally parse any date representation (Date, Firestore Timestamp, ISO string, epoch ms, {seconds})
 */
export function parseToDate(val: any): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val?.toDate === 'function') {
    const d = val.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val?.toMillis === 'function') {
    const d = new Date(val.toMillis());
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'string') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof val === 'object' && typeof val.seconds === 'number') {
    const d = new Date(val.seconds * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Convert timestamp or date to YYYY-MM-DD in given timezone
 */
export function formatZonedDate(date: any, timeZone: string = DEFAULT_TIMEZONE): string {
  const parsed = parseToDate(date);
  if (!parsed) return '';
  const parts = getZonedParts(parsed, timeZone);
  const y = parts.year;
  const m = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Calculate the UTC offset milliseconds for a specific instant in target timezone
 */
export function getTimezoneOffsetMs(date: Date, timeZone: string = DEFAULT_TIMEZONE): number {
  const parts = getZonedParts(date, timeZone);
  // Construct a UTC timestamp representing the zoned wall-clock time
  const utcWall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return utcWall - date.getTime();
}

/**
 * Given a local date string YYYY-MM-DD and time HH:mm:ss, return the precise UTC Date object
 */
export function zonedTimeToUtc(dateStr: string, timeStr: string = '00:00:00', timeZone: string = DEFAULT_TIMEZONE): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm, ss] = timeStr.split(':').map(Number);

  // Initial estimate assuming UTC
  const initialUtc = new Date(Date.UTC(y, m - 1, d, hh || 0, mm || 0, ss || 0));
  const offsetMs = getTimezoneOffsetMs(initialUtc, timeZone);
  return new Date(initialUtc.getTime() - offsetMs);
}

/**
 * Get full day ISO boundaries for a YYYY-MM-DD in the target timezone
 */
export function getZonedDayBounds(dateStr: string, timeZone: string = DEFAULT_TIMEZONE): { startIso: string; endIso: string } {
  const start = zonedTimeToUtc(dateStr, '00:00:00', timeZone);
  const end = zonedTimeToUtc(dateStr, '23:59:59', timeZone);
  // add 999 ms to end
  const endWithMs = new Date(end.getTime() + 999);
  return {
    startIso: start.toISOString(),
    endIso: endWithMs.toISOString(),
  };
}

/**
 * Compute DateRange for a given preset in target timezone
 */
export function getDateRangeFromPreset(
  preset: DatePreset,
  customStart?: string,
  customEnd?: string,
  timeZone: string = DEFAULT_TIMEZONE,
  referenceDate: Date = new Date()
): DateRange {
  const zonedNow = getZonedParts(referenceDate, timeZone);
  const todayStr = `${zonedNow.year}-${String(zonedNow.month).padStart(2, '0')}-${String(zonedNow.day).padStart(2, '0')}`;

  if (preset === 'custom') {
    const s = customStart || todayStr;
    const e = customEnd || todayStr;
    const startBounds = getZonedDayBounds(s, timeZone);
    const endBounds = getZonedDayBounds(e, timeZone);
    return {
      startDate: s,
      endDate: e,
      startIso: startBounds.startIso,
      endIso: endBounds.endIso,
    };
  }

  // Helper to shift days in timezone
  const shiftDays = (days: number, fromDateStr: string = todayStr): string => {
    const [y, m, d] = fromDateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
    return formatZonedDate(dateObj, timeZone);
  };

  let startDateStr = todayStr;
  let endDateStr = todayStr;

  switch (preset) {
    case 'today':
      startDateStr = todayStr;
      endDateStr = todayStr;
      break;
    case 'yesterday': {
      const yStr = shiftDays(-1);
      startDateStr = yStr;
      endDateStr = yStr;
      break;
    }
    case 'last_7_days': {
      startDateStr = shiftDays(-6);
      endDateStr = todayStr;
      break;
    }
    case 'this_week': {
      // Saturday is first day of week in Egypt/MENA, or Sunday/Monday. Let's use 7-day rolling or week starting Saturday
      // For general retail, last 7 days or start of week (Sunday/Saturday). Let's do start of current week (Saturday = 6 in JS or Sunday = 0)
      const refDay = new Date(Date.UTC(zonedNow.year, zonedNow.month - 1, zonedNow.day, 12, 0, 0));
      const dayOfWeek = refDay.getUTCDay(); // 0 is Sun, 6 is Sat
      const daysSinceSaturday = (dayOfWeek + 1) % 7;
      startDateStr = shiftDays(-daysSinceSaturday);
      endDateStr = todayStr;
      break;
    }
    case 'this_month': {
      startDateStr = `${zonedNow.year}-${String(zonedNow.month).padStart(2, '0')}-01`;
      endDateStr = todayStr;
      break;
    }
    case 'last_month': {
      let prevM = zonedNow.month - 1;
      let prevY = zonedNow.year;
      if (prevM === 0) {
        prevM = 12;
        prevY -= 1;
      }
      const daysInPrevMonth = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
      startDateStr = `${prevY}-${String(prevM).padStart(2, '0')}-01`;
      endDateStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(daysInPrevMonth).padStart(2, '0')}`;
      break;
    }
    case 'this_quarter': {
      const quarter = Math.floor((zonedNow.month - 1) / 3);
      const startQuarterMonth = quarter * 3 + 1;
      startDateStr = `${zonedNow.year}-${String(startQuarterMonth).padStart(2, '0')}-01`;
      endDateStr = todayStr;
      break;
    }
    case 'this_year': {
      startDateStr = `${zonedNow.year}-01-01`;
      endDateStr = todayStr;
      break;
    }
    case 'all': {
      startDateStr = '2020-01-01';
      endDateStr = todayStr;
      return {
        startDate: '2020-01-01',
        endDate: todayStr,
        startIso: '2020-01-01T00:00:00.000Z',
        endIso: getZonedDayBounds(todayStr, timeZone).endIso,
      };
    }
  }

  const startBounds = getZonedDayBounds(startDateStr, timeZone);
  const endBounds = getZonedDayBounds(endDateStr, timeZone);

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    startIso: startBounds.startIso,
    endIso: endBounds.endIso,
  };
}

/**
 * Calculate the comparison date range (previous period or previous year)
 */
export function getComparisonRange(
  currentRange: DateRange,
  mode: ComparisonMode,
  timeZone: string = DEFAULT_TIMEZONE
): ComparisonRange {
  if (mode === 'none') {
    return { current: currentRange, mode };
  }

  const startUtc = new Date(currentRange.startIso);
  const endUtc = new Date(currentRange.endIso);
  const durationMs = endUtc.getTime() - startUtc.getTime();

  let compStartIso: string;
  let compEndIso: string;
  let compStartStr: string;
  let compEndStr: string;

  if (mode === 'previous_period') {
    // Exactly same duration immediately preceding
    const prevEnd = new Date(startUtc.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs + 1);
    compStartIso = prevStart.toISOString();
    compEndIso = prevEnd.toISOString();
    compStartStr = formatZonedDate(prevStart, timeZone);
    compEndStr = formatZonedDate(prevEnd, timeZone);
  } else {
    // previous_year: same dates last year
    const [sy, sm, sd] = currentRange.startDate.split('-').map(Number);
    const [ey, em, ed] = currentRange.endDate.split('-').map(Number);
    compStartStr = `${sy - 1}-${String(sm).padStart(2, '0')}-${String(sd).padStart(2, '0')}`;
    compEndStr = `${ey - 1}-${String(em).padStart(2, '0')}-${String(ed).padStart(2, '0')}`;
    const startBounds = getZonedDayBounds(compStartStr, timeZone);
    const endBounds = getZonedDayBounds(compEndStr, timeZone);
    compStartIso = startBounds.startIso;
    compEndIso = endBounds.endIso;
  }

  return {
    current: currentRange,
    comparison: {
      startDate: compStartStr,
      endDate: compEndStr,
      startIso: compStartIso,
      endIso: compEndIso,
    },
    mode,
  };
}
