export type NotificationType = 'info' | 'success' | 'warning' | 'critical';

export type NotificationCategory =
  | 'orders'
  | 'inventory'
  | 'purchases'
  | 'suppliers'
  | 'waste'
  | 'attendance'
  | 'payroll'
  | 'advances'
  | 'expenses'
  | 'security'
  | 'settings';

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
  relatedEntityType?: 'product' | 'order' | 'payroll' | 'expense' | 'supplier' | 'employee' | 'user' | 'setting' | 'purchase';
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
