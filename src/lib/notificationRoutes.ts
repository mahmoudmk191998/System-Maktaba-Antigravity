import type { AppNotification } from '@/types/notifications.types';

// Map of legacy or alias routes to actual registered routes in App.tsx
export const ROUTE_ALIASES: Record<string, string> = {
  '/payroll': '/hr?tab=reports',
  '/advances': '/hr?tab=reports&section=advances',
  '/attendance': '/hr?tab=attendance',
  '/leaves': '/hr?tab=leaves',
};

// Map of notification categories to real application routes
export const CATEGORY_DEFAULT_ROUTES: Record<string, string> = {
  loan: '/loans',
  overdue: '/loans?status=overdue',
  reservation: '/holds',
  fine: '/fines',
  membership: '/members',
  inventory: '/inventory',
  acquisition: '/acquisitions',
  transfer: '/transfers',
  hr: '/hr',
  attendance: '/hr?tab=attendance',
  payroll: '/hr?tab=reports',
  advances: '/hr?tab=reports&section=advances',
  leave: '/hr?tab=leaves',
  leaves: '/hr?tab=leaves',
  system: '/settings',
  // Legacy aliases for backward-compatibility
  orders: '/loans',
  purchases: '/acquisitions',
  suppliers: '/suppliers',
  expenses: '/expenses',
  security: '/permissions',
  settings: '/settings',
  waste: '/lost-damaged',
};

// Whitelist of valid relative route prefixes registered in App.tsx
export const VALID_ROUTE_PREFIXES = [
  '/',
  '/circulation',
  '/loans',
  '/books',
  '/copies',
  '/members',
  '/holds',
  '/fines',
  '/acquisitions',
  '/transfers',
  '/inventory',
  '/lost-damaged',
  '/pos',
  '/orders-history',
  '/kitchen',
  '/tables',
  '/menu',
  '/purchasing',
  '/production',
  '/delivery',
  '/customers',
  '/promotions',
  '/hr',
  '/reports',
  '/settings',
  '/audit',
  '/integrations',
  '/developer/playground',
  '/playground',
  '/permissions',
  '/docs',
  '/expenses',
  '/suppliers',
  '/waste',
  '/shifts',
  '/maintenance',
  '/accounting',
  '/callcenter',
  '/notifications',
  '/executive',
  '/backup',
  // Redirect routes:
  '/payroll',
  '/advances',
  '/leaves',
];

export interface NotificationRouteInput {
  actionRoute?: string;
  category?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

/**
 * Resolves any notification (new, legacy, or imported) to a guaranteed valid client-side route.
 * Rejects malicious schemes (javascript:, data:, external URLs).
 * Maps legacy routes (such as `/payroll` -> `/hr?tab=reports`).
 * Provides safe category-based fallback if route is missing or invalid.
 */
export function resolveNotificationRoute(notification?: NotificationRouteInput | AppNotification | null): string {
  if (!notification) return '/';

  let target = (notification.actionRoute || '').trim();

  // Security check: Reject javascript:, data:, vbscript:, and external protocols
  if (
    target.startsWith('javascript:') ||
    target.startsWith('data:') ||
    target.startsWith('vbscript:') ||
    target.startsWith('//') ||
    /^https?:\/\//i.test(target)
  ) {
    console.warn('Blocked potentially unsafe or external notification route:', target);
    if (notification.category && CATEGORY_DEFAULT_ROUTES[notification.category]) {
      return CATEGORY_DEFAULT_ROUTES[notification.category];
    }
    return '/';
  }

  // 1. Direct alias match (e.g. '/payroll' -> '/hr?tab=reports')
  if (ROUTE_ALIASES[target]) {
    return ROUTE_ALIASES[target];
  }

  // Check prefix alias with query or hash (e.g. '/payroll?period=2026-09')
  for (const [alias, replacement] of Object.entries(ROUTE_ALIASES)) {
    if (target.startsWith(alias + '?')) {
      const queryString = target.slice(alias.length + 1);
      const joinChar = replacement.includes('?') ? '&' : '?';
      return `${replacement}${joinChar}${queryString}`;
    }
    if (target.startsWith(alias + '#')) {
      return target.replace(alias, replacement);
    }
  }

  // 2. If target is empty or dummy hash, resolve by category
  if (!target || target === '#' || target === '/') {
    if (notification.category && CATEGORY_DEFAULT_ROUTES[notification.category]) {
      return CATEGORY_DEFAULT_ROUTES[notification.category];
    }
    return '/';
  }

  // 3. Ensure target is a relative path starting with /
  if (!target.startsWith('/')) {
    target = '/' + target;
  }

  // 4. Validate against registered routes whitelist
  const pathWithoutQuery = target.split('?')[0].split('#')[0];
  const isValidRoute = VALID_ROUTE_PREFIXES.some(
    (prefix) => pathWithoutQuery === prefix || (prefix !== '/' && pathWithoutQuery.startsWith(prefix + '/'))
  );

  if (isValidRoute) {
    return target;
  }

  // Fallback to category route if available, otherwise root '/'
  if (notification.category && CATEGORY_DEFAULT_ROUTES[notification.category]) {
    return CATEGORY_DEFAULT_ROUTES[notification.category];
  }

  return '/';
}
