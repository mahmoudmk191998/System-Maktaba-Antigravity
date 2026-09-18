export type NotificationType = 'info' | 'success' | 'warning' | 'critical';

export type NotificationCategory =
  | 'orders'
  | 'sales'
  | 'inventory'
  | 'purchases'
  | 'suppliers'
  | 'customers'
  | 'transfers'
  | 'waste'
  | 'expenses'
  | 'hr'
  | 'attendance'
  | 'payroll'
  | 'advances'
  | 'leaves'
  | 'security'
  | 'settings'
  | 'system';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

export type NotificationStatus = 'active' | 'resolved';

export interface AppNotification {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  branchId?: string | 'all';
  tenantId?: string;
  relatedEntityType?: 'product' | 'sale' | 'purchase' | 'order' | 'payroll' | 'expense' | 'supplier' | 'customer' | 'transfer' | 'employee' | 'user' | 'setting';
  relatedEntityId?: string;
  requiredPermission?: string;
  targetUserId?: string;
  targetRoles?: string[];
  createdAt: string; // ISO 8601 string
  createdBy?: string;
  deduplicationKey?: string;
  actionRoute?: string;
  status: NotificationStatus;
  resolvedAt?: string;
  metadata?: Record<string, any>;
  read?: boolean; // dynamic field attached on read
}

export interface NotificationReadRecord {
  id?: string;
  userId: string;
  notificationId: string;
  readAt: string;
}

export interface UserNotificationContext {
  userId: string;
  role?: string;
  userBranchId?: string | null;
  hasPermission: (permissionId: string) => boolean;
  isAdmin?: boolean;
  isOwner?: boolean;
}
