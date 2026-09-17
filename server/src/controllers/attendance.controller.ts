import { Request, Response, NextFunction } from 'express';
import { getFirestoreDb } from '../config/firebase.js';
import { verifyEmployeePin } from '../utils/crypto.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../utils/errors.js';
import { AuthenticatedRequest } from '../types/api.types.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

// In-memory brute-force tracking
interface PinAttemptRecord {
  attempts: number;
  lockedUntil: number | null;
}
const pinAttemptsStore = new Map<string, PinAttemptRecord>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function checkAndTrackFailedPin(employeeId: string): { isLocked: boolean; attemptsLeft: number } {
  const now = Date.now();
  const record = pinAttemptsStore.get(employeeId) || { attempts: 0, lockedUntil: null };

  if (record.lockedUntil && now < record.lockedUntil) {
    return { isLocked: true, attemptsLeft: 0 };
  }

  record.attempts += 1;
  if (record.attempts >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_MS;
    pinAttemptsStore.set(employeeId, record);
    return { isLocked: true, attemptsLeft: 0 };
  }

  pinAttemptsStore.set(employeeId, record);
  return { isLocked: false, attemptsLeft: MAX_ATTEMPTS - record.attempts };
}

function resetPinAttempts(employeeId: string) {
  pinAttemptsStore.delete(employeeId);
}

// Haversine distance in meters
function calculateHaversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dPhi = toRad(lat2 - lat1);
  const dLam = toRad(lon2 - lon1);

  const a =
    Math.sin(dPhi / 2) * Math.sin(dPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) * Math.sin(dLam / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const match = timeStr.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

export interface ResolvedTokenInfo {
  tenantId: string;
  branchId: string | null;
  branchName: string;
  hrSettings: any;
}

// In-memory store for unit test suites when running without live GCP credentials
const testAttendanceTokenStore = new Map<string, ResolvedTokenInfo>();
const testAttendanceStore = new Map<string, any>();

export function seedTestAttendanceRecord(id: string, data: any) {
  testAttendanceStore.set(id, data);
}

export function seedTestAttendanceToken(token: string, info: ResolvedTokenInfo) {
  testAttendanceTokenStore.set(token, info);
}

export function clearTestAttendanceStore() {
  testAttendanceStore.clear();
  testAttendanceTokenStore.clear();
}

/**
 * Unified helper to resolve attendance token from hr_settings, branches, or tenants
 */
export async function resolveAttendanceToken(
  db: FirebaseFirestore.Firestore,
  token: string
): Promise<ResolvedTokenInfo | null> {
  const cleanToken = (token || '').trim();
  if (!cleanToken) {
    logger.warn('resolveAttendanceToken: Empty or missing token');
    return null;
  }

  // In test environment without live credentials, handle in-memory store
  if (process.env.NODE_ENV === 'test') {
    return testAttendanceTokenStore.get(cleanToken) || null;
  }

  // 1. Check hr_settings collection by attendance_token field
  try {
    const hrSettingsQuery = await db
      .collection('hr_settings')
      .where('attendance_token', '==', cleanToken)
      .limit(1)
      .get();

    if (!hrSettingsQuery.empty) {
      const sDoc = hrSettingsQuery.docs[0];
      const data = sDoc.data();
      const tenantId = data.tenant_id || sDoc.id;
      let branchName = 'المطعم';

      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      if (tenantDoc.exists) {
        branchName = tenantDoc.data()?.name || 'المطعم';
      }

      logger.info(`resolveAttendanceToken: Resolved via hr_settings field for tenant ${tenantId}`);
      return {
        tenantId,
        branchId: data.branch_id || null,
        branchName,
        hrSettings: data,
      };
    }
  } catch (err: any) {
    logger.warn('resolveAttendanceToken: Error querying hr_settings by token', { details: err.message });
  }

  // 2. Check branches collection by attendance_token field
  try {
    const branchQuery = await db
      .collection('branches')
      .where('attendance_token', '==', cleanToken)
      .limit(1)
      .get();

    if (!branchQuery.empty) {
      const bDoc = branchQuery.docs[0];
      const data = bDoc.data();
      logger.info(`resolveAttendanceToken: Resolved via branches for branch ${bDoc.id}`);
      return {
        tenantId: data.tenant_id,
        branchId: bDoc.id,
        branchName: data.name || 'المطعم',
        hrSettings: data.hr_settings || {},
      };
    }
  } catch (err: any) {
    logger.warn('resolveAttendanceToken: Error querying branches by token', { details: err.message });
  }

  // 3. Check tenants collection by attendance_token field
  try {
    const tenantQuery = await db
      .collection('tenants')
      .where('attendance_token', '==', cleanToken)
      .limit(1)
      .get();

    if (!tenantQuery.empty) {
      const tDoc = tenantQuery.docs[0];
      const data = tDoc.data();
      logger.info(`resolveAttendanceToken: Resolved via tenants for tenant ${tDoc.id}`);
      return {
        tenantId: tDoc.id,
        branchId: null,
        branchName: data.name || 'المطعم',
        hrSettings: data.hr_settings || {},
      };
    }
  } catch (err: any) {
    logger.warn('resolveAttendanceToken: Error querying tenants by token', { details: err.message });
  }

  // 4. Direct doc ID lookup in hr_settings (if token matches tenant ID)
  try {
    const directDoc = await db.collection('hr_settings').doc(cleanToken).get();
    if (directDoc.exists) {
      const data = directDoc.data()!;
      const tenantId = data.tenant_id || directDoc.id;
      let branchName = 'المطعم';
      const tenantDoc = await db.collection('tenants').doc(tenantId).get();
      if (tenantDoc.exists) {
        branchName = tenantDoc.data()?.name || 'المطعم';
      }
      logger.info(`resolveAttendanceToken: Resolved via direct hr_settings doc ID ${directDoc.id}`);
      return {
        tenantId,
        branchId: data.branch_id || null,
        branchName,
        hrSettings: data,
      };
    }
  } catch (err: any) {
    logger.warn('resolveAttendanceToken: Error in direct hr_settings lookup', { details: err.message });
  }

  logger.warn(`resolveAttendanceToken: Token not found in any collection: ${cleanToken.slice(0, 8)}...`);
  return null;
}

/**
 * GET /api/v1/attendance/public/info?token=...
 * Public info for the QR attendance screen
 */
export async function getPublicAttendanceInfo(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = (req.query.token as string || '').trim();
    if (!token) {
      throw new BadRequestError('رمز الحضور مطلوب');
    }

    const db = process.env.NODE_ENV === 'test' ? (null as any) : getFirestoreDb();
    const resolved = await resolveAttendanceToken(db, token);

    if (!resolved) {
      throw new NotFoundError('رمز الحضور غير صالح أو منتهي');
    }

    const { tenantId, branchId, branchName, hrSettings } = resolved;

    if (hrSettings.attendance_enabled === false) {
      throw new ForbiddenError('تسجيل الحضور والانصراف معطل حالياً');
    }

    if (hrSettings.qr_attendance_enabled === false) {
      throw new ForbiddenError('تسجيل الحضور عبر الـ QR معطل حالياً');
    }

    // Fetch active employees (sanitized list: NO salary, NO pin_hash)
    let employees: any[] = [];
    if (process.env.NODE_ENV !== 'test') {
      const empQuery = await db
        .collection('employees')
        .where('tenant_id', '==', tenantId)
        .where('status', '==', 'active')
        .get();

      employees = empQuery.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name || '',
          phone: data.phone || '',
          role: data.role || '',
          department: data.department || '',
          shift_id: data.default_shift_id || data.shift_id || null,
          pin_set: Boolean(data.pin_hash || data.pin),
        };
      });
    }

    // Sort alphabetically by name
    employees.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

    res.json({
      success: true,
      data: {
        tenantId,
        branchId,
        branchName,
        locationRestriction: Boolean(hrSettings.location_restriction),
        latitude: hrSettings.latitude || null,
        longitude: hrSettings.longitude || null,
        geofenceRadius: hrSettings.geofence_radius || 100,
        employees,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/attendance/public/clock
 * Public clock-in / clock-out endpoint protected by token and PIN
 */
export async function recordPublicClock(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, employeeId, pin, action, idempotencyKey, location } = req.body;

    const db = getFirestoreDb();

    // 1. Brute-force protection check
    const nowMs = Date.now();
    const existingLock = pinAttemptsStore.get(employeeId);
    if (existingLock?.lockedUntil && nowMs < existingLock.lockedUntil) {
      const remainingMinutes = Math.ceil((existingLock.lockedUntil - nowMs) / 60000);
      throw new ForbiddenError(`تم قفل الحساب مؤقتاً لكثرة المحاولات الخاطئة. يرجى المحاولة بعد ${remainingMinutes} دقيقة.`);
    }

    // 2. Validate Token using unified resolver
    const resolved = await resolveAttendanceToken(db, token);
    if (!resolved) {
      throw new NotFoundError('رمز الحضور غير صالح أو منتهي');
    }

    const { tenantId, branchId, hrSettings } = resolved;

    // 3. Validate Location (Geofencing) if enabled
    if (hrSettings.location_restriction) {
      if (!location || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
        throw new BadRequestError('يجب السماح بتحديد الموقع الجغرافي لتسجيل الحضور');
      }

      if (hrSettings.latitude && hrSettings.longitude) {
        const allowedRadius = hrSettings.geofence_radius || 100;
        const distance = calculateHaversineMeters(
          location.latitude,
          location.longitude,
          hrSettings.latitude,
          hrSettings.longitude
        );

        if (distance > allowedRadius) {
          throw new BadRequestError(
            `يجب أن تكون داخل نطاق المطعم لتسجيل الحضور. المسافة الحالية (${distance}م) تتجاوز النطاق المسموح (${allowedRadius}م)`
          );
        }
      }
    }

    // 4. Fetch Employee & Verify PIN
    const employeeRef = db.collection('employees').doc(employeeId);
    const employeeDoc = await employeeRef.get();

    if (!employeeDoc.exists) {
      throw new NotFoundError('الموظف غير موجود');
    }

    const employee = employeeDoc.data()!;
    if (employee.status !== 'active') {
      throw new ForbiddenError('هذا الموظف غير متاح لتسجيل الحضور (الحساب غير نشط)');
    }

    const storedHash = employee.pin_hash || employee.pin;
    if (!storedHash) {
      throw new BadRequestError('لم يتم تعيين رمز PIN لهذا الموظف بعد. يرجى التواصل مع الإدارة.');
    }

    const isPinValid = await verifyEmployeePin(pin, storedHash);
    if (!isPinValid) {
      const { isLocked, attemptsLeft } = checkAndTrackFailedPin(employeeId);
      if (isLocked) {
        throw new ForbiddenError('تم إدخال PIN غير صحيح 5 مرات. تم قفل المحاولة مؤقتاً لمدة 15 دقيقة.');
      }
      throw new BadRequestError(`الرقم السري غير صحيح. متبقي ${attemptsLeft} محاولات.`);
    }

    // PIN is valid: reset brute force counter
    resetPinAttempts(employeeId);

    // 5. Trusted Server Time & Date
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const isoTimestamp = now.toISOString();

    // 6. Check Idempotency Key
    if (idempotencyKey) {
      const existingIdemp = await db
        .collection('attendance')
        .where('idempotencyKey', '==', idempotencyKey)
        .limit(1)
        .get();

      if (!existingIdemp.empty) {
        const existingData = existingIdemp.docs[0].data();
        res.json({
          success: true,
          message: 'تم تسجيل العملية مسبقاً',
          data: { id: existingIdemp.docs[0].id, ...existingData },
        });
        return;
      }
    }

    // 7. Atomic transaction for Attendance mutation
    const result = await db.runTransaction(async (transaction) => {
      // Find today's attendance record
      const attQuery = db
        .collection('attendance')
        .where('tenant_id', '==', tenantId)
        .where('employee_id', '==', employeeId)
        .where('date', '==', todayStr);

      const attSnap = await transaction.get(attQuery);

      // Fetch active shift for calculations
      let matchedShift: any = null;
      const shiftsSnap = await transaction.get(
        db.collection('shifts').where('tenant_id', '==', tenantId).limit(10)
      );
      const shifts = shiftsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (employee.default_shift_id) {
        matchedShift = shifts.find((s) => s.id === employee.default_shift_id);
      }
      if (!matchedShift && shifts.length > 0) {
        matchedShift = shifts[0];
      }

      const gracePeriod = matchedShift?.gracePeriod ?? (hrSettings.default_grace_period || 10);

      // Case A: No record today -> Check-in
      if (attSnap.empty) {
        if (action === 'check_out') {
          throw new BadRequestError('لا يمكن تسجيل الانصراف بدون تسجيل الحضور أولاً');
        }

        let lateMinutes = 0;
        let status: 'present' | 'late' = 'present';

        if (matchedShift?.startTime) {
          const checkInMins = timeStringToMinutes(timeStr);
          const shiftStartMins = timeStringToMinutes(matchedShift.startTime);
          const allowedMins = shiftStartMins + gracePeriod;

          if (checkInMins > allowedMins) {
            lateMinutes = checkInMins - shiftStartMins;
            status = 'late';
          }
        }

        const newRecordRef = db.collection('attendance').doc();
        const newRecordData = {
          tenant_id: tenantId,
          branch_id: branchId || employee.branch_id || null,
          employee_id: employeeId,
          employee_name: employee.name,
          employee_role: employee.role,
          date: todayStr,
          checkIn: timeStr,
          checkInAt: isoTimestamp,
          checkOut: null,
          checkOutAt: null,
          shift_id: matchedShift?.id || null,
          shift_name: matchedShift?.name || null,
          status,
          lateMinutes,
          earlyLeaveMinutes: 0,
          workedMinutes: 0,
          hours: 0,
          isManualCorrection: false,
          idempotencyKey: idempotencyKey || crypto.randomUUID(),
          created_at: isoTimestamp,
          updated_at: isoTimestamp,
        };

        transaction.set(newRecordRef, newRecordData);

        return {
          type: 'check_in',
          recordId: newRecordRef.id,
          employeeName: employee.name,
          time: timeStr,
          status,
          lateMinutes,
          message: status === 'late' ? `تم تسجيل الحضور (متأخر ${lateMinutes} دقيقة)` : 'تم تسجيل الحضور بنجاح',
        };
      }

      // Case B: Already has record
      const existingDoc = attSnap.docs[0];
      const existingData = existingDoc.data();

      // Already checked out
      if (existingData.checkOut) {
        return {
          type: 'already_completed',
          recordId: existingDoc.id,
          employeeName: employee.name,
          checkIn: existingData.checkIn,
          checkOut: existingData.checkOut,
          hours: existingData.hours,
          message: 'تم تسجيل حضورك وانصرافك اليوم بالفعل',
        };
      }

      // Record has checkIn but no checkOut -> Check-out
      if (action === 'check_in') {
        throw new BadRequestError('تم تسجيل الحضور مسبقاً لهذا اليوم');
      }

      const startMs = new Date(existingData.checkInAt).getTime();
      const endMs = now.getTime();
      const workedMinutes = Math.max(0, Math.floor((endMs - startMs) / (1000 * 60)));
      const hours = Math.round((workedMinutes / 60) * 10) / 10;

      let earlyLeaveMinutes = 0;
      if (matchedShift?.endTime) {
        const checkOutMins = timeStringToMinutes(timeStr);
        const shiftEndMins = timeStringToMinutes(matchedShift.endTime);
        if (checkOutMins < shiftEndMins) {
          earlyLeaveMinutes = shiftEndMins - checkOutMins;
        }
      }

      const updatePayload: Record<string, any> = {
        checkOut: timeStr,
        checkOutAt: isoTimestamp,
        workedMinutes,
        hours,
        earlyLeaveMinutes,
        updated_at: isoTimestamp,
      };

      if (earlyLeaveMinutes > 0 && existingData.status !== 'late') {
        updatePayload.status = 'early_leave';
      }

      transaction.update(existingDoc.ref, updatePayload);

      const hoursDisplay = Math.floor(workedMinutes / 60);
      const minsDisplay = workedMinutes % 60;

      return {
        type: 'check_out',
        recordId: existingDoc.id,
        employeeName: employee.name,
        checkIn: existingData.checkIn,
        checkOut: timeStr,
        workedMinutes,
        hours,
        message: `تم تسجيل الانصراف بنجاح (ساعات العمل: ${hoursDisplay}س ${minsDisplay}د)`,
      };
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/v1/attendance/:attendanceId
 * Admin endpoint to delete a specific attendance record with authentication, tenant verification, and audit trail
 */
export async function deleteAttendanceRecord(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const attendanceId = String(req.params.attendanceId || '').trim();
    const tenantId = req.apiClient?.tenantId || (req.header('X-Tenant-ID') as string);
    const adminId = req.apiClient?.clientId || 'admin';

    if (!attendanceId) {
      throw new BadRequestError('معرف سجل الحضور مطلوب');
    }

    if (!tenantId) {
      throw new BadRequestError('Tenant ID مطلوب');
    }

    // In test environment without live credentials, handle in-memory store
    if (process.env.NODE_ENV === 'test') {
      const memDoc = testAttendanceStore.get(attendanceId);
      if (!memDoc) {
        throw new NotFoundError('سجل الحضور المطلوب حذفه غير موجود');
      }
      if (memDoc.tenant_id && memDoc.tenant_id !== tenantId) {
        logger.warn(`Tenant isolation breach attempt on delete: requester ${tenantId} target ${memDoc.tenant_id}`);
        throw new ForbiddenError('غير مصرح بحذف سجل لا يتبع للمطعم الخاص بك');
      }
      testAttendanceStore.delete(attendanceId);
      res.json({
        success: true,
        message: 'تم حذف سجل الحضور بنجاح وتوثيق العملية في سجل التدقيق',
        data: { id: attendanceId },
      });
      return;
    }

    const db = getFirestoreDb();
    const docRef = db.collection('attendance').doc(attendanceId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new NotFoundError('سجل الحضور المطلوب حذفه غير موجود');
    }

    const data = docSnap.data()!;

    // Enforce tenant isolation
    if (data.tenant_id && data.tenant_id !== tenantId) {
      logger.warn(`Tenant isolation breach attempt on delete: requester ${tenantId} target ${data.tenant_id}`);
      throw new ForbiddenError('غير مصرح بحذف سجل لا يتبع للمطعم الخاص بك');
    }

    // Delete single document
    await docRef.delete();

    // Log to audit_logs
    const nowIso = new Date().toISOString();
    await db.collection('audit_logs').add({
      tenant_id: tenantId,
      action: 'attendance_deleted',
      entity: 'attendance',
      target_id: attendanceId,
      user: adminId,
      details: `حذف سجل حضور الموظف ${data.employee_name || data.employee_id} لتاريخ ${data.date} (وقت الحضور: ${data.checkIn || '-'})`,
      severity: 'warning',
      created_at: nowIso,
    });

    res.json({
      success: true,
      message: 'تم حذف سجل الحضور بنجاح وتوثيق العملية في سجل التدقيق',
      data: { id: attendanceId },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/attendance/manual-correction
 * Admin endpoint to correct an attendance record with mandatory audit trail
 */
export async function manualCorrectAttendance(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { employeeId, date, checkIn, checkOut, status, reason, shiftId } = req.body;
    const tenantId = req.apiClient?.tenantId || (req.header('X-Tenant-ID') as string);
    const adminId = req.apiClient?.clientId || 'admin';

    if (!tenantId) {
      throw new BadRequestError('Tenant ID مطلوب');
    }

    const db = getFirestoreDb();

    // Fetch employee name
    const empDoc = await db.collection('employees').doc(employeeId).get();
    const empData = empDoc.data();
    const employeeName = empData?.name || 'موظف';

    const nowIso = new Date().toISOString();

    let workedMinutes = 0;
    let hours = 0;
    if (checkIn && checkOut) {
      const inMins = timeStringToMinutes(checkIn);
      const outMins = timeStringToMinutes(checkOut);
      workedMinutes = Math.max(0, outMins - inMins);
      hours = Math.round((workedMinutes / 60) * 10) / 10;
    }

    const existing = await db
      .collection('attendance')
      .where('tenant_id', '==', tenantId)
      .where('employee_id', '==', employeeId)
      .where('date', '==', date)
      .limit(1)
      .get();

    let recordId: string;

    if (!existing.empty) {
      const docRef = existing.docs[0].ref;
      recordId = docRef.id;
      await docRef.update({
        checkIn,
        checkInAt: `${date}T${checkIn}:00.000Z`,
        checkOut: checkOut || null,
        checkOutAt: checkOut ? `${date}T${checkOut}:00.000Z` : null,
        status,
        workedMinutes,
        hours,
        isManualCorrection: true,
        correctionReason: reason,
        correctionAdminId: adminId,
        updated_at: nowIso,
      });
    } else {
      const newRef = await db.collection('attendance').add({
        tenant_id: tenantId,
        employee_id: employeeId,
        employee_name: employeeName,
        date,
        checkIn,
        checkInAt: `${date}T${checkIn}:00.000Z`,
        checkOut: checkOut || null,
        checkOutAt: checkOut ? `${date}T${checkOut}:00.000Z` : null,
        status,
        workedMinutes,
        hours,
        isManualCorrection: true,
        correctionReason: reason,
        correctionAdminId: adminId,
        created_at: nowIso,
        updated_at: nowIso,
      });
      recordId = newRef.id;
    }

    // Log to audit_logs
    await db.collection('audit_logs').add({
      tenant_id: tenantId,
      action: 'attendance_manually_corrected',
      entity: 'attendance',
      target_id: recordId,
      user: adminId,
      details: `تعديل سجل حضور الموظف ${employeeName} لتاريخ ${date}. السبب: ${reason}`,
      severity: 'warning',
      created_at: nowIso,
    });

    res.json({
      success: true,
      message: 'تم تعديل سجل الحضور وتوثيقه في سجل التدقيق بنجاح',
      data: { id: recordId },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/attendance/rotate-qr-token
 * Admin endpoint to rotate the QR token immediately
 */
export async function rotateAttendanceToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = req.apiClient?.tenantId || (req.header('X-Tenant-ID') as string);
    const branchId = req.body.branchId;

    if (!tenantId) {
      throw new BadRequestError('Tenant ID مطلوب');
    }

    // Cryptographically secure 64-char hex token
    const newToken = crypto.randomBytes(32).toString('hex');
    const db = getFirestoreDb();
    const nowIso = new Date().toISOString();

    // 1. Update hr_settings with tenant_id field
    await db.collection('hr_settings').doc(tenantId).set(
      {
        tenant_id: tenantId,
        attendance_token: newToken,
        attendance_token_rotated_at: nowIso,
      },
      { merge: true }
    );

    // 2. Sync to tenant doc
    await db.collection('tenants').doc(tenantId).update({
      attendance_token: newToken,
      attendance_token_rotated_at: nowIso,
    });

    // 3. Sync to branch doc if branchId provided
    if (branchId) {
      await db.collection('branches').doc(branchId).update({
        attendance_token: newToken,
        attendance_token_rotated_at: nowIso,
      });
    }

    // Log to audit_logs
    await db.collection('audit_logs').add({
      tenant_id: tenantId,
      action: 'attendance_token_rotated',
      entity: 'qr_token',
      user: req.apiClient?.clientId || 'admin',
      details: 'تم تدوير رمز QR لتسجيل الحضور وإلغاء الرمز السابق',
      severity: 'info',
      created_at: nowIso,
    });

    res.json({
      success: true,
      message: 'تم تدوير رمز الـ QR بنجاح',
      data: { token: newToken },
    });
  } catch (error) {
    next(error);
  }
}
