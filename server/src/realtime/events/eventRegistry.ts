import { ApiPermission } from '../../types/permissions.types.js';
import { StandardRmsEventType } from './event.types.js';

export const EVENT_PERMISSION_MAP: Record<string, ApiPermission | null> = {
  'order.created': 'orders:read',
  'order.updated': 'orders:read',
  'order.status_changed': 'orders:read',
  'order.cancelled': 'orders:read',

  'payment.created': 'orders:read',
  'payment.updated': 'orders:read',
  'payment.completed': 'orders:read',
  'payment.failed': 'orders:read',

  'menu.updated': 'menu:read',
  'product.created': 'menu:read',
  'product.updated': 'menu:read',
  'product.deleted': 'menu:read',

  'branch.created': 'branches:read',
  'branch.updated': 'branches:read',
  'branch.disabled': 'branches:read',

  'delivery.created': 'delivery:read',
  'delivery.updated': 'delivery:read',
  'delivery.status_changed': 'delivery:read',

  'reservation.created': 'reservations:read',
  'reservation.updated': 'reservations:read',
  'reservation.cancelled': 'reservations:read',

  'inventory.updated': 'menu:read',
  'tenant.updated': 'menu:read',
  'integration.updated': 'api_clients:manage',
};

export function getRequiredPermissionForEvent(eventType: string): ApiPermission | null {
  return EVENT_PERMISSION_MAP[eventType] ?? null;
}

export function isAuthorizedForEvent(
  eventType: string,
  clientPermissions: string[]
): boolean {
  const required = getRequiredPermissionForEvent(eventType);
  if (!required) return true;
  return clientPermissions.includes(required);
}
