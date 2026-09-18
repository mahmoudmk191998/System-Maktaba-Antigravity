import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  query,
  where,
  getDocs,
  addDoc,
  updateDoc,
  setDoc,
  writeBatch,
  limit as firestoreLimit,
} from 'firebase/firestore';
import type {
  AppNotification,
  UserNotificationContext,
} from '@/types/notifications.types';

const NOTIFICATIONS_COLLECTION = 'notifications';
const NOTIFICATION_READS_COLLECTION = 'notification_reads';

/**
 * Filter notifications in-memory based on RBAC and Branch isolation.
 * Strictly prevents leaking sensitive financial, security, or cross-branch notifications.
 */
export function filterNotificationsForUser(
  notifications: AppNotification[],
  context: UserNotificationContext
): AppNotification[] {
  const { userId, userBranchId, hasPermission, isAdmin, isOwner } = context;

  return notifications.filter((notif) => {
    // 1. Target User check
    if (notif.targetUserId && notif.targetUserId !== userId) {
      return false;
    }

    // 2. Branch Isolation:
    // If notification is branch-scoped and not global ('all'), user must belong to that branch,
    // unless user is Admin or Owner who has global access.
    if (
      notif.branchId &&
      notif.branchId !== 'all' &&
      !isAdmin &&
      !isOwner
    ) {
      if (userBranchId && notif.branchId !== userBranchId) {
        return false;
      }
    }

    // 3. RBAC Permission check:
    // If notification requires a specific permission, user must have it (or be Owner/Admin).
    if (notif.requiredPermission && !isOwner && !isAdmin) {
      if (!hasPermission(notif.requiredPermission)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Publish a notification to Firestore with deduplication support.
 * If an active notification with identical deduplicationKey exists, it skips creation.
 */
export async function publishNotification(
  data: Omit<AppNotification, 'id' | 'createdAt' | 'status'> & {
    status?: 'active' | 'resolved';
  }
): Promise<string | null> {
  try {
    const notifsRef = collection(db, NOTIFICATIONS_COLLECTION);

    // Deduplication check: Do not spam active alerts
    if (data.deduplicationKey) {
      try {
        const q = query(
          notifsRef,
          where('deduplicationKey', '==', data.deduplicationKey),
          where('status', '==', 'active'),
          firestoreLimit(1)
        );
        const existing = await getDocs(q);
        if (!existing.empty) {
          // Already exists as active alert, do not duplicate
          return existing.docs[0].id;
        }
      } catch (dedupErr) {
        // Fallback gracefully if composite index is pending
        console.warn('Notification deduplication query warning:', dedupErr);
      }
    }

    const newDoc: Omit<AppNotification, 'id'> = {
      ...data,
      status: data.status || 'active',
      createdAt: new Date().toISOString(),
    };

    const docRef = await addDoc(notifsRef, newDoc);
    return docRef.id;
  } catch (err) {
    console.error('Failed to publish notification:', err);
    return null;
  }
}

/**
 * Resolve an active notification (e.g. low stock replenished).
 */
export async function resolveNotification(deduplicationKey: string): Promise<boolean> {
  try {
    const notifsRef = collection(db, NOTIFICATIONS_COLLECTION);
    const q = query(
      notifsRef,
      where('deduplicationKey', '==', deduplicationKey),
      where('status', '==', 'active')
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return false;

    const batch = writeBatch(db);
    const resolvedAt = new Date().toISOString();
    snapshot.docs.forEach((d) => {
      batch.update(doc(db, NOTIFICATIONS_COLLECTION, d.id), {
        status: 'resolved',
        resolvedAt,
      });
    });
    await batch.commit();
    return true;
  } catch (err) {
    console.error('Failed to resolve notification:', err);
    return false;
  }
}

/**
 * Mark a single notification as read for a specific user.
 */
export async function markNotificationAsRead(
  userId: string,
  notificationId: string
): Promise<void> {
  if (!userId || !notificationId) return;
  try {
    const readDocId = `${userId}_${notificationId}`;
    const readRef = doc(db, NOTIFICATION_READS_COLLECTION, readDocId);
    await setDoc(readRef, {
      userId,
      notificationId,
      readAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to record notification read:', err);
  }
}

/**
 * Mark multiple notifications as read for a specific user in a batch.
 */
export async function markAllNotificationsAsRead(
  userId: string,
  notificationIds: string[]
): Promise<void> {
  if (!userId || notificationIds.length === 0) return;
  try {
    const batch = writeBatch(db);
    const readAt = new Date().toISOString();

    // Firestore batch limit is 500
    const slice = notificationIds.slice(0, 450);
    slice.forEach((notifId) => {
      const readDocId = `${userId}_${notifId}`;
      const readRef = doc(db, NOTIFICATION_READS_COLLECTION, readDocId);
      batch.set(readRef, {
        userId,
        notificationId: notifId,
        readAt,
      });
    });

    await batch.commit();
  } catch (err) {
    console.error('Failed to batch mark notifications as read:', err);
  }
}

// =========================================================================
// Real-Event Notification Dispatchers
// =========================================================================

/**
 * Triggered when product stock drops below or equal to min_stock_level.
 */
export async function notifyLowStock(
  branchId: string,
  item: { id: string; name: string; min_stock_level: number },
  currentQty: number
) {
  const isCritical = currentQty <= 0;
  return publishNotification({
    type: isCritical ? 'critical' : 'warning',
    category: 'inventory',
    priority: isCritical ? 'critical' : 'high',
    title: isCritical ? 'نفاد تام في المخزون' : 'تنبيه مخزون منخفض',
    message: isCritical
      ? `صنف "${item.name}" نفد تماماً من الفرع (الكمية 0).`
      : `صنف "${item.name}" وصل إلى ${currentQty} فقط (الحد الأدنى ${item.min_stock_level}).`,
    branchId,
    relatedEntityType: 'product',
    relatedEntityId: item.id,
    requiredPermission: 'inventory.view',
    deduplicationKey: `low_stock_${branchId}_${item.id}`,
    actionRoute: '/inventory',
    metadata: { currentQty, minStock: item.min_stock_level },
  });
}

/**
 * Triggered when stock for an item is replenished above min_stock_level.
 */
export async function resolveLowStock(branchId: string, itemId: string) {
  return resolveNotification(`low_stock_${branchId}_${itemId}`);
}

/**
 * Triggered when a new order is successfully submitted.
 */
export async function notifyNewOrder(
  branchId: string,
  orderId: string,
  orderNumber: string | number,
  total: number
) {
  return publishNotification({
    type: 'info',
    category: 'orders',
    priority: 'normal',
    title: 'طلب جديد',
    message: `تم إنشاء طلب جديد #${orderNumber} بإجمالي ${Number(total).toLocaleString()} ج.م`,
    branchId,
    relatedEntityType: 'order',
    relatedEntityId: orderId,
    requiredPermission: 'orders.view',
    actionRoute: '/orders-history',
    deduplicationKey: `order_created_${orderId}`,
    metadata: { orderNumber, total },
  });
}

/**
 * Triggered on salary payment dispatch.
 */
export async function notifySalaryPayment(
  branchId: string,
  employeeName: string,
  amount: number,
  paymentId: string
) {
  return publishNotification({
    type: 'success',
    category: 'payroll',
    priority: 'normal',
    title: 'صرف راتب',
    message: `تم صرف دفعة راتب للموظف ${employeeName} بقيمة ${Number(amount).toLocaleString()} ج.م`,
    branchId,
    relatedEntityType: 'payroll',
    relatedEntityId: paymentId,
    requiredPermission: 'payroll.view',
    actionRoute: '/hr?tab=reports',
    deduplicationKey: `salary_pay_${paymentId}`,
    metadata: { employeeName, amount },
  });
}

/**
 * Triggered when supplier has high outstanding balance.
 */
export async function notifySupplierDue(
  branchId: string,
  supplierName: string,
  balance: number,
  supplierId: string
) {
  return publishNotification({
    type: 'warning',
    category: 'suppliers',
    priority: 'high',
    title: 'مستحقات مورد واجبة السداد',
    message: `المورد "${supplierName}" لديه رصيد مستحق بقيمة ${Number(balance).toLocaleString()} ج.م`,
    branchId,
    relatedEntityType: 'supplier',
    relatedEntityId: supplierId,
    requiredPermission: 'suppliers.view',
    actionRoute: '/suppliers',
    deduplicationKey: `supplier_due_${supplierId}`,
    metadata: { supplierName, balance },
  });
}

/**
 * Triggered when an unusually large expense is recorded.
 */
export async function notifyLargeExpense(
  branchId: string,
  title: string,
  amount: number,
  expenseId: string
) {
  return publishNotification({
    type: 'warning',
    category: 'expenses',
    priority: 'high',
    title: 'مصروف مالي مرتفع',
    message: `تم تسجيل مصروف مرتفع: "${title}" بقيمة ${Number(amount).toLocaleString()} ج.م`,
    branchId,
    relatedEntityType: 'expense',
    relatedEntityId: expenseId,
    requiredPermission: 'expenses.view',
    actionRoute: '/expenses',
    deduplicationKey: `expense_large_${expenseId}`,
    metadata: { title, amount },
  });
}

/**
 * Triggered on attendance manual correction or late checkout.
 */
export async function notifyAttendanceCorrection(
  branchId: string,
  employeeName: string,
  date: string
) {
  return publishNotification({
    type: 'info',
    category: 'attendance',
    priority: 'normal',
    title: 'تعديل يدوي في سجل الحضور',
    message: `تم إجراء تعديل يدوي في سجل حضور الموظف ${employeeName} لتاريخ ${date}`,
    branchId,
    relatedEntityType: 'employee',
    requiredPermission: 'attendance.view',
    actionRoute: '/hr?tab=attendance',
    deduplicationKey: `att_corr_${employeeName}_${date}`,
    metadata: { employeeName, date },
  });
}

/**
 * Triggered on role or security permission modifications.
 */
export async function notifySecurityRoleChanged(
  adminName: string,
  targetUserName: string,
  newRole: string
) {
  return publishNotification({
    type: 'critical',
    category: 'security',
    priority: 'critical',
    title: 'تعديل أمني في صلاحيات المستخدمين',
    message: `قام ${adminName} بتغيير دور المستخدم "${targetUserName}" إلى "${newRole}".`,
    branchId: 'all',
    relatedEntityType: 'user',
    requiredPermission: 'permissions.manage',
    actionRoute: '/permissions',
    deduplicationKey: `sec_role_${targetUserName}_${Date.now()}`,
    metadata: { adminName, targetUserName, newRole },
  });
}

/**
 * Triggered when an accounting event permanently fails into dead-letter queue.
 */
export async function notifyOutboxDeadLetter(
  tenantId: string,
  eventId: string,
  sourceType: string,
  errorMsg: string
) {
  return publishNotification({
    type: 'critical',
    category: 'system',
    priority: 'critical',
    title: 'فشل ترحيل قيد محاسبي (Dead Letter Alert)',
    message: `تعذر ترحيل القيد المحاسبي للعملية (${sourceType} - ${eventId}) بعد عدة محاولات: ${errorMsg}`,
    branchId: 'all',
    relatedEntityType: 'accounting_event',
    relatedEntityId: eventId,
    requiredPermission: 'accounting.view',
    actionRoute: '/system-health',
    deduplicationKey: `dead_letter_${eventId}`,
    metadata: { tenantId, eventId, sourceType, errorMsg },
  });
}

/**
 * Triggered when a backup or restore job fails.
 */
export async function notifyBackupFailure(tenantId: string, errorMsg: string) {
  return publishNotification({
    type: 'critical',
    category: 'system',
    priority: 'critical',
    title: 'فشل عملية النسخ الاحتياطي للنظام',
    message: `حدث خطأ أثناء إجراء النسخة الاحتياطية للمنشأة: ${errorMsg}`,
    branchId: 'all',
    relatedEntityType: 'backup',
    requiredPermission: 'backup.view',
    actionRoute: '/backup',
    deduplicationKey: `backup_fail_${new Date().toISOString().slice(0, 10)}`,
    metadata: { tenantId, errorMsg },
  });
}

/**
 * Triggered when a pending approval request is created.
 */
export async function notifyApprovalRequired(
  tenantId: string,
  requestId: string,
  workflowTitle: string,
  amount?: number
) {
  return publishNotification({
    type: 'warning',
    category: 'governance',
    priority: 'high',
    title: 'طلب اعتماد بانتظار المراجعة',
    message: `يتطلب ${workflowTitle} ${amount ? `بقيمة ${amount} ج.م` : ''} اعتمادك للمتابعة`,
    branchId: 'all',
    relatedEntityType: 'approval_request',
    relatedEntityId: requestId,
    requiredPermission: 'approvals.manage',
    actionRoute: '/approvals',
    deduplicationKey: `approval_req_${requestId}`,
    metadata: { tenantId, requestId, workflowTitle, amount },
  });
}

/**
 * Triggered on data integrity reconciliation mismatches.
 */
export async function notifySystemIntegrityMismatch(tenantId: string, issueTitle: string) {
  return publishNotification({
    type: 'critical',
    category: 'system',
    priority: 'critical',
    title: 'تنبيه عدم تطابق محاسبي أو مخزني',
    message: `تم رصد فارق في مطابقة النظام: ${issueTitle}. يرجى فحص مركز سلامة النظام.`,
    branchId: 'all',
    relatedEntityType: 'system_health',
    requiredPermission: 'accounting.reconcile',
    actionRoute: '/system-health',
    deduplicationKey: `integrity_${new Date().toISOString().slice(0, 10)}`,
    metadata: { tenantId, issueTitle },
  });
}

