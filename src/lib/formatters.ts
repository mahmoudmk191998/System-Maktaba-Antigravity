import { useAppStore } from './store';

// تحويل الأرقام إلى العربية الهندية
const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export function toArabicNumerals(num: number | string): string {
  return String(num).replace(/[0-9]/g, (d) => arabicNumerals[parseInt(d)]);
}

// تنسيق العملة
export function formatCurrency(
  amount: number,
  useArabicNumerals: boolean = false
): string {
  const formatter = new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  
  let formatted = formatter.format(amount);
  
  if (useArabicNumerals) {
    formatted = toArabicNumerals(formatted);
  }
  
  return formatted;
}

// تنسيق الأرقام
export function formatNumber(
  num: number,
  useArabicNumerals: boolean = false,
  decimals: number = 0
): string {
  const formatter = new Intl.NumberFormat('ar-EG', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  
  let formatted = formatter.format(num);
  
  if (useArabicNumerals) {
    formatted = toArabicNumerals(formatted);
  }
  
  return formatted;
}

// تنسيق التاريخ
export function formatDate(
  date: Date | string,
  useHijri: boolean = false,
  format: 'full' | 'short' | 'time' | 'datetime' = 'short'
): string {
  const d = new Date(date);
  
  const calendar = useHijri ? 'islamic-umalqura' : 'gregory';
  
  let options: Intl.DateTimeFormatOptions = {};
  
  switch (format) {
    case 'full':
      options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        calendar,
      };
      break;
    case 'short':
      options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        calendar,
      };
      break;
    case 'time':
      options = {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      };
      break;
    case 'datetime':
      options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        calendar,
      };
      break;
  }
  
  return new Intl.DateTimeFormat('ar-EG', {
    ...options,
    timeZone: 'Africa/Cairo',
  }).format(d);
}

// تنسيق الوقت النسبي
export function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'الآن';
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays < 7) return `منذ ${diffDays} يوم`;
  
  return formatDate(d, false, 'short');
}

// تنسيق رقم الهاتف المصري
export function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    return `${cleaned.slice(0, 3)} ${cleaned.slice(3, 7)} ${cleaned.slice(7)}`;
  }
  
  if (cleaned.length === 12 && cleaned.startsWith('20')) {
    return `+${cleaned.slice(0, 2)} ${cleaned.slice(2, 5)} ${cleaned.slice(5, 9)} ${cleaned.slice(9)}`;
  }
  
  return phone;
}

// تنسيق النسبة المئوية
export function formatPercentage(
  value: number,
  useArabicNumerals: boolean = false
): string {
  const formatted = `${value.toFixed(1)}%`;
  return useArabicNumerals ? toArabicNumerals(formatted) : formatted;
}

// Hook للتنسيق مع الإعدادات الحالية
export function useFormatters() {
  const settings = useAppStore((state) => state.settings);
  
  return {
    currency: (amount: number) => formatCurrency(amount, settings.useArabicNumerals),
    number: (num: number, decimals?: number) => formatNumber(num, settings.useArabicNumerals, decimals),
    date: (date: Date | string, format?: 'full' | 'short' | 'time' | 'datetime') =>
      formatDate(date, settings.useHijriCalendar, format),
    percentage: (value: number) => formatPercentage(value, settings.useArabicNumerals),
    phone: formatPhoneNumber,
    relativeTime: formatRelativeTime,
  };
}
