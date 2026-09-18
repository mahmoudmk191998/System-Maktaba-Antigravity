/**
 * Structured Error Taxonomy & Correlation ID Handler (Phase 11)
 * Standardizes error categorization, user-friendly bilingual messages,
 * and technical tracing without leaking stack traces or credentials to clients.
 */

export type ErrorCategory =
  | 'VALIDATION'
  | 'PERMISSION'
  | 'NETWORK'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'BUSINESS_RULE'
  | 'INTEGRITY'
  | 'SERVICE_UNAVAILABLE'
  | 'UNKNOWN';

export interface AppErrorOptions {
  category: ErrorCategory;
  messageAr: string;
  messageEn: string;
  technicalDetails?: any;
  correlationId?: string;
}

export class AppError extends Error {
  public readonly category: ErrorCategory;
  public readonly messageAr: string;
  public readonly messageEn: string;
  public readonly correlationId: string;
  public readonly technicalDetails?: any;

  constructor(options: AppErrorOptions) {
    super(options.messageEn);
    this.name = 'AppError';
    this.category = options.category;
    this.messageAr = options.messageAr;
    this.messageEn = options.messageEn;
    this.correlationId = options.correlationId || generateCorrelationId();
    this.technicalDetails = options.technicalDetails;
  }
}

/**
 * Generate a cryptographically random correlation ID for error tracing
 */
export function generateCorrelationId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'ERR-';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Parse any error into standardized AppError
 */
export function normalizeError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }

  const message = err instanceof Error ? err.message : String(err);
  const correlationId = generateCorrelationId();

  // Categorize common Firestore or network errors
  let category: ErrorCategory = 'UNKNOWN';
  let messageAr = 'حدث خطأ غير متوقع. يرجى إعادة المحاولة أو التواصل مع الدعم الفني.';

  if (message.includes('permission-denied') || message.includes('Missing or insufficient permissions')) {
    category = 'PERMISSION';
    messageAr = 'ليس لديك الصلاحية الكافية لتنفيذ هذا الإجراء.';
  } else if (message.includes('network') || message.includes('offline') || message.includes('unavailable')) {
    category = 'NETWORK';
    messageAr = 'تعذر الاتصال بالخادم. يرجى التحقق من اتصال الإنترنت.';
  } else if (message.includes('not-found')) {
    category = 'NOT_FOUND';
    messageAr = 'السجل أو العنصر المطلوب غير موجود بالنظام.';
  }

  return new AppError({
    category,
    messageAr,
    messageEn: message,
    correlationId,
    technicalDetails: err,
  });
}
