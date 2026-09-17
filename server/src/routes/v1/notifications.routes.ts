import { Router, Response } from 'express';
import { getFirestoreDb } from '../../config/firebase.js';
import { authenticateApiKey } from '../../middleware/auth.middleware.js';
import { AuthenticatedRequest } from '../../types/api.types.js';
import { ForbiddenError, ValidationError, NotFoundError } from '../../utils/errors.js';
import { FieldValue } from 'firebase-admin/firestore';
import { hasPermissionMatch } from '../../types/permissions.types.js';

export const notificationsRouter = Router();

const VALID_CATEGORIES = [
  'orders',
  'inventory',
  'purchases',
  'suppliers',
  'waste',
  'attendance',
  'payroll',
  'advances',
  'expenses',
  'security',
  'settings',
];

const VALID_TYPES = ['info', 'success', 'warning', 'critical'];
const VALID_PRIORITIES = ['low', 'normal', 'high', 'critical'];

/**
 * POST /notifications
 * Trusted Server Mutation Path for System Notifications.
 * Validates category permissions, prevents unauthorized forgery, and writes with server timestamp.
 */
notificationsRouter.post(
  '/notifications',
  authenticateApiKey,
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const {
        category,
        type = 'info',
        priority = 'normal',
        title,
        message,
        branchId = 'all',
        relatedEntityType,
        relatedEntityId,
        requiredPermission,
        targetUserId,
        deduplicationKey,
        actionRoute,
        metadata = {},
      } = req.body;

      // 1. Validation
      if (!title || typeof title !== 'string' || !title.trim()) {
        throw new ValidationError('Notification title is required');
      }
      if (!message || typeof message !== 'string' || !message.trim()) {
        throw new ValidationError('Notification message is required');
      }
      if (!VALID_CATEGORIES.includes(category)) {
        throw new ValidationError(`Invalid notification category: '${category}'`);
      }
      if (!VALID_TYPES.includes(type)) {
        throw new ValidationError(`Invalid notification type: '${type}'`);
      }
      if (!VALID_PRIORITIES.includes(priority)) {
        throw new ValidationError(`Invalid notification priority: '${priority}'`);
      }

      const clientPerms = req.apiClient?.permissions || [];

      // 2. Strict Role/Permission Guard based on Notification Category
      if (category === 'security' || category === 'settings') {
        const hasSec = hasPermissionMatch(clientPerms, 'permissions:manage');
        if (!hasSec) {
          throw new ForbiddenError(
            'Forbidden: Security & Settings notifications can only be created by authorized administrators'
          );
        }
      } else if (category === 'payroll' || category === 'advances') {
        const hasPayroll =
          hasPermissionMatch(clientPerms, 'payroll:pay') ||
          hasPermissionMatch(clientPerms, 'payroll:read');
        if (!hasPayroll) {
          throw new ForbiddenError(
            'Forbidden: Payroll notifications require payroll authorization'
          );
        }
      } else if (category === 'expenses') {
        const hasExpense =
          hasPermissionMatch(clientPerms, 'expenses:read') ||
          hasPermissionMatch(clientPerms, 'expenses:manage');
        if (!hasExpense) {
          throw new ForbiddenError(
            'Forbidden: Expense notifications require financial authorization'
          );
        }
      } else if (category === 'inventory' || category === 'waste') {
        const hasInv =
          hasPermissionMatch(clientPerms, 'inventory:read') ||
          hasPermissionMatch(clientPerms, 'inventory:manage');
        if (!hasInv) {
          throw new ForbiddenError(
            'Forbidden: Inventory alerts require inventory authorization'
          );
        }
      } else if (category === 'attendance') {
        const hasAtt =
          hasPermissionMatch(clientPerms, 'attendance:manage') ||
          hasPermissionMatch(clientPerms, 'attendance:read');
        if (!hasAtt) {
          throw new ForbiddenError(
            'Forbidden: Attendance alerts require HR or attendance management authorization'
          );
        }
      }

      const db = getFirestoreDb();
      const notifsCol = db.collection('notifications');

      // 3. Deduplication Check
      if (deduplicationKey) {
        const existingSnap = await notifsCol
          .where('deduplicationKey', '==', deduplicationKey)
          .where('status', '==', 'active')
          .limit(1)
          .get();

        if (!existingSnap.empty) {
          // Already active, return existing doc without creating duplicate
          return res.status(200).json({
            success: true,
            created: false,
            data: { id: existingSnap.docs[0].id, ...existingSnap.docs[0].data() },
          });
        }
      }

      // 4. Create document with Server Timestamp
      const newDocData: Record<string, any> = {
        title: title.trim(),
        message: message.trim(),
        category,
        type,
        priority,
        status: 'active',
        branchId: branchId || 'all',
        tenantId: req.apiClient?.tenantId || 'tenant_main',
        createdAt: new Date().toISOString(),
        serverTimestamp: FieldValue.serverTimestamp(),
        createdBy: req.apiClient?.clientId || 'system',
        metadata,
      };

      if (relatedEntityType) newDocData.relatedEntityType = relatedEntityType;
      if (relatedEntityId) newDocData.relatedEntityId = relatedEntityId;
      if (requiredPermission) newDocData.requiredPermission = requiredPermission;
      if (targetUserId) newDocData.targetUserId = targetUserId;
      if (deduplicationKey) newDocData.deduplicationKey = deduplicationKey;
      if (actionRoute) newDocData.actionRoute = actionRoute;

      const docRef = await notifsCol.add(newDocData);

      return res.status(201).json({
        success: true,
        created: true,
        data: { id: docRef.id, ...newDocData },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /notifications/:id/resolve
 * Authorized resolution of an active alert
 */
notificationsRouter.patch(
  '/notifications/:id/resolve',
  authenticateApiKey,
  async (req: AuthenticatedRequest, res: Response, next) => {
    try {
      const { id } = req.params;
      const db = getFirestoreDb();
      const docRef = db.collection('notifications').doc(id);
      const snapshot = await docRef.get();

      if (!snapshot.exists) {
        throw new NotFoundError(`Notification not found: '${id}'`);
      }

      const notifData = snapshot.data();
      const clientPerms = req.apiClient?.permissions || [];

      // Validate resolution rights
      if (notifData?.category === 'inventory' || notifData?.category === 'waste') {
        const hasInv =
          hasPermissionMatch(clientPerms, 'inventory:manage') ||
          hasPermissionMatch(clientPerms, 'inventory:read');
        if (!hasInv) {
          throw new ForbiddenError('Forbidden: Only authorized inventory staff can resolve stock alerts');
        }
      }

      await docRef.update({
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        resolvedServerTimestamp: FieldValue.serverTimestamp(),
      });

      return res.status(200).json({
        success: true,
        message: 'Notification resolved successfully',
      });
    } catch (err) {
      next(err);
    }
  }
);
