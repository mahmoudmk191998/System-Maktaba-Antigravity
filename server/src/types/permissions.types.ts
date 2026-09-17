export const API_PERMISSIONS = [
  'menu:read',
  'offers:read',
  'branches:read',
  'delivery:read',
  'orders:create',
  'orders:read',
  'orders:update',
  'orders:update_status',
  'webhooks:manage',
  'api_clients:manage',
  'customers:read',
  'reservations:create',
  'reservations:read',
  'attendance:manage',
  'attendance:read',
  'settings:read',
  'settings:manage',
  'payroll:read',
  'payroll:pay',
  'payroll:void',
  'expenses:read',
  'expenses:manage',
  'inventory:read',
  'inventory:manage',
  'suppliers:read',
  'suppliers:pay',
  'permissions:manage',
] as const;

export type ApiPermission = (typeof API_PERMISSIONS)[number];

export function isValidPermission(permission: string): permission is ApiPermission {
  return API_PERMISSIONS.includes(permission as ApiPermission);
}

/**
 * Bidirectional typed mapping layer between frontend dot-notation permissions
 * and backend colon-notation permissions to prevent authorization gaps.
 */
export const PERMISSION_MAPPINGS: Record<string, string> = {
  // Settings
  'settings.view': 'settings:read',
  'settings.manage': 'settings:manage',
  'settings:read': 'settings.view',
  'settings:manage': 'settings.manage',

  // Orders
  'orders.view': 'orders:read',
  'orders.manage': 'orders:update',
  'pos.create_order': 'orders:create',
  'pos.view': 'orders:read',
  'orders:create': 'pos.create_order',
  'orders:read': 'orders.view',
  'orders:update': 'orders.manage',
  'orders:update_status': 'orders.manage',

  // Menu / Catalog
  'menu.view': 'menu:read',
  'menu.manage': 'menu:manage',
  'menu:read': 'menu.view',
  'menu:manage': 'menu.manage',

  // Attendance
  'attendance.view': 'attendance:read',
  'attendance.manage': 'attendance:manage',
  'attendance.correct': 'attendance:manage',
  'attendance:read': 'attendance.view',
  'attendance:manage': 'attendance.manage',

  // Branches
  'branches.view': 'branches:read',
  'branches:read': 'branches.view',

  // Delivery
  'delivery.view': 'delivery:read',
  'delivery.manage': 'delivery:manage',
  'delivery:read': 'delivery.view',

  // Customers
  'customers.view': 'customers:read',
  'customers.manage': 'customers:manage',
  'customers:read': 'customers.view',

  // Finance / Payroll
  'payroll.view': 'payroll:read',
  'payroll.pay': 'payroll:pay',
  'payroll.void': 'payroll:void',
  'payroll:read': 'payroll.view',
  'payroll:pay': 'payroll.pay',
  'payroll:void': 'payroll.void',

  // Expenses
  'expenses.view': 'expenses:read',
  'expenses.manage': 'expenses:manage',
  'expenses:read': 'expenses.view',

  // Inventory
  'inventory.view': 'inventory:read',
  'inventory.adjust': 'inventory:manage',
  'inventory:read': 'inventory.view',

  // Suppliers
  'suppliers.view': 'suppliers:read',
  'suppliers.pay': 'suppliers:pay',
  'suppliers:read': 'suppliers.view',

  // Security / Permissions
  'permissions.manage': 'permissions:manage',
  'permissions:manage': 'permissions.manage',
};

/**
 * Normalizes and matches user permissions against required permission.
 * Handles wildcard (*), direct match, mapped aliases, and dot/colon conversion.
 */
export function hasPermissionMatch(clientPerms: string[], required: string): boolean {
  if (!clientPerms || clientPerms.length === 0) return false;
  if (clientPerms.includes('*')) return true;
  if (clientPerms.includes(required)) return true;

  // Check mapped equivalent
  const mapped = PERMISSION_MAPPINGS[required];
  if (mapped && clientPerms.includes(mapped)) return true;

  // Check generic dot <-> colon conversion
  const colonForm = required.replace('.', ':');
  const dotForm = required.replace(':', '.');
  if (clientPerms.includes(colonForm) || clientPerms.includes(dotForm)) return true;

  return false;
}
