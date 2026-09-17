import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  where,
  Unsubscribe,
} from 'firebase/firestore';
import type {
  AppNotification,
  NotificationType,
  NotificationCategory,
  NotificationPriority,
  NotificationStatus,
  UserNotificationContext,
} from '@/types/notifications.types';
import {
  publishNotification,
  markNotificationAsRead as persistMarkAsRead,
  markAllNotificationsAsRead as persistMarkAllAsRead,
  filterNotificationsForUser,
} from '@/services/notifications.service';

export type {
  AppNotification,
  NotificationType,
  NotificationCategory,
  NotificationPriority,
  NotificationStatus,
  UserNotificationContext,
};

interface NotificationsState {
  // All notifications fetched from Firestore
  rawNotifications: AppNotification[];
  // User-filtered notifications based on RBAC and branch isolation
  notifications: AppNotification[];
  // Active critical or high priority alerts
  activeAlerts: AppNotification[];
  // IDs of notifications marked as read by current user
  readIds: string[];
  unreadCount: number;
  loading: boolean;
  error: string | null;

  // Real-time listener cleanup
  activeUnsubscribers: Unsubscribe[];

  // Actions
  initNotifications: (context: UserNotificationContext) => () => void;
  addNotification: (
    notification: Omit<AppNotification, 'id' | 'createdAt' | 'status' | 'read'> & {
      status?: NotificationStatus;
    }
  ) => Promise<string | null>;
  markAsRead: (id: string, userId?: string) => Promise<void>;
  markAllAsRead: (userId?: string) => Promise<void>;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => ({
      rawNotifications: [],
      notifications: [],
      activeAlerts: [],
      readIds: [],
      unreadCount: 0,
      loading: false,
      error: null,
      activeUnsubscribers: [],

      initNotifications: (context: UserNotificationContext) => {
        // Clean up previous listeners if any
        const { activeUnsubscribers } = get();
        activeUnsubscribers.forEach((unsub) => {
          try {
            unsub();
          } catch (_) {}
        });

        if (!context?.userId) {
          set({ rawNotifications: [], notifications: [], activeAlerts: [], unreadCount: 0 });
          return () => {};
        }

        set({ loading: true, error: null });

        const unsubs: Unsubscribe[] = [];

        // 1. Listen to user reads from notification_reads collection
        try {
          const readsRef = collection(db, 'notification_reads');
          const readsQuery = query(
            readsRef,
            where('userId', '==', context.userId),
            limit(300)
          );

          const unsubReads = onSnapshot(
            readsQuery,
            (snapshot) => {
              const userReadIds = snapshot.docs.map((d) => d.data().notificationId as string);
              const { rawNotifications } = get();

              // Recompute with new reads
              const merged = rawNotifications.map((n) => ({
                ...n,
                read: userReadIds.includes(n.id),
              }));

              const filtered = filterNotificationsForUser(merged, context);
              const unread = filtered.filter((n) => !n.read).length;
              const alerts = filtered.filter(
                (n) => n.status === 'active' && (n.priority === 'high' || n.priority === 'critical')
              );

              set({
                readIds: userReadIds,
                notifications: filtered,
                unreadCount: unread,
                activeAlerts: alerts,
              });
            },
            (err) => {
              console.warn('notification_reads listener warning:', err);
            }
          );
          unsubs.push(unsubReads);
        } catch (readsErr) {
          console.warn('Failed to attach reads listener:', readsErr);
        }

        // 2. Listen to latest notifications (bounded read: limit 30)
        try {
          const notifsRef = collection(db, 'notifications');
          const notifsQuery = query(
            notifsRef,
            orderBy('createdAt', 'desc'),
            limit(30)
          );

          const unsubNotifs = onSnapshot(
            notifsQuery,
            (snapshot) => {
              const { readIds } = get();
              const items: AppNotification[] = snapshot.docs.map((d) => {
                const data = d.data();
                return {
                  id: d.id,
                  type: data.type || 'info',
                  category: data.category || 'orders',
                  priority: data.priority || 'normal',
                  title: data.title || '',
                  message: data.message || '',
                  branchId: data.branchId,
                  tenantId: data.tenantId,
                  relatedEntityType: data.relatedEntityType,
                  relatedEntityId: data.relatedEntityId,
                  requiredPermission: data.requiredPermission,
                  targetUserId: data.targetUserId,
                  createdAt: data.createdAt || new Date().toISOString(),
                  createdBy: data.createdBy,
                  deduplicationKey: data.deduplicationKey,
                  actionRoute: data.actionRoute,
                  status: data.status || 'active',
                  resolvedAt: data.resolvedAt,
                  metadata: data.metadata,
                  read: readIds.includes(d.id),
                };
              });

              const filtered = filterNotificationsForUser(items, context);
              const unread = filtered.filter((n) => !n.read).length;
              const alerts = filtered.filter(
                (n) => n.status === 'active' && (n.priority === 'high' || n.priority === 'critical')
              );

              set({
                rawNotifications: items,
                notifications: filtered,
                unreadCount: unread,
                activeAlerts: alerts,
                loading: false,
                error: null,
              });
            },
            (err) => {
              console.error('notifications listener error:', err);
              set({
                loading: false,
                error: 'تعذر تحميل الإشعارات الحية',
              });
            }
          );
          unsubs.push(unsubNotifs);
        } catch (notifErr) {
          console.error('Failed to attach notifications listener:', notifErr);
          set({ loading: false, error: 'تعذر الاتصال بمركز الإشعارات' });
        }

        set({ activeUnsubscribers: unsubs });

        return () => {
          unsubs.forEach((unsub) => {
            try {
              unsub();
            } catch (_) {}
          });
        };
      },

      addNotification: async (payload) => {
        // Optimistic / Firestore creation
        const publishedId = await publishNotification({
          ...payload,
          status: payload.status || 'active',
        });

        // Trigger in-app toast for immediate feedback
        switch (payload.type) {
          case 'success':
            toast.success(payload.title, { description: payload.message });
            break;
          case 'critical':
            toast.error(payload.title, { description: payload.message });
            break;
          case 'warning':
            toast.warning(payload.title, { description: payload.message });
            break;
          case 'info':
          default:
            toast.info(payload.title, { description: payload.message });
            break;
        }

        return publishedId;
      },

      markAsRead: async (id: string, userId?: string) => {
        const { notifications, readIds } = get();
        const updatedReadIds = Array.from(new Set([...readIds, id]));
        const updatedNotifs = notifications.map((n) =>
          n.id === id ? { ...n, read: true } : n
        );
        const unread = updatedNotifs.filter((n) => !n.read).length;

        set({
          readIds: updatedReadIds,
          notifications: updatedNotifs,
          unreadCount: unread,
        });

        if (userId) {
          await persistMarkAsRead(userId, id);
        }
      },

      markAllAsRead: async (userId?: string) => {
        const { notifications, readIds } = get();
        const unreadNotifIds = notifications.filter((n) => !n.read).map((n) => n.id);
        if (unreadNotifIds.length === 0) return;

        const updatedReadIds = Array.from(new Set([...readIds, ...unreadNotifIds]));
        const updatedNotifs = notifications.map((n) => ({ ...n, read: true }));

        set({
          readIds: updatedReadIds,
          notifications: updatedNotifs,
          unreadCount: 0,
        });

        if (userId) {
          await persistMarkAllAsRead(userId, unreadNotifIds);
        }
      },

      removeNotification: (id: string) => {
        const { notifications, unreadCount } = get();
        const target = notifications.find((n) => n.id === id);
        const wasUnread = target && !target.read;

        set({
          notifications: notifications.filter((n) => n.id !== id),
          unreadCount: wasUnread ? Math.max(0, unreadCount - 1) : unreadCount,
        });
      },

      clearAll: () => {
        set({ notifications: [], unreadCount: 0, activeAlerts: [] });
      },
    }),
    {
      name: 'rms-notifications-v2',
      partialize: (state) => ({
        notifications: state.notifications.slice(0, 30),
        readIds: state.readIds.slice(0, 100),
        unreadCount: state.unreadCount,
      }),
    }
  )
);
