import { db } from '@/lib/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
} from 'firebase/firestore';
import {
  verifyPin,
  calculateDistanceMeters,
  calculateLateMinutes,
  calculateWorkedMinutes,
  calculateEarlyLeaveMinutes,
  checkPinLockout,
  recordFailedPinAttempt,
  resetPinAttempts,
  timeStringToMinutes,
} from '@/lib/attendanceSecurity';

const API_BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD
    ? 'https://my-bot-production-e396.up.railway.app/api/v1'
    : 'http://localhost:4000/api/v1');

export interface PublicEmployee {
  id: string;
  name: string;
  phone: string;
  role: string;
  department: string;
  shift_id: string | null;
  pin_set: boolean;
}

export interface PublicAttendanceInfo {
  tenantId: string;
  branchId: string | null;
  branchName: string;
  locationRestriction: boolean;
  latitude: number | null;
  longitude: number | null;
  geofenceRadius: number;
  employees: PublicEmployee[];
}

export interface ClockResult {
  type: 'check_in' | 'check_out' | 'already_completed';
  recordId: string;
  employeeName: string;
  time?: string;
  checkIn?: string;
  checkOut?: string;
  status?: string;
  lateMinutes?: number;
  workedMinutes?: number;
  hours?: number;
  message: string;
}

/**
 * Fetch public attendance session info directly from Firestore (No external server required)
 */
export async function fetchPublicAttendanceInfo(token: string): Promise<PublicAttendanceInfo> {
  const cleanToken = (token || '').trim();
  if (!cleanToken) {
    throw new Error('رابط الحضور غير صالح. لم يتم تحديد رمز الحضور (Attendance Token).');
  }

  let tenantId: string | null = null;
  let branchId: string | null = null;
  let branchName = 'المطعم';
  let hrSettings: any = {};

  // 1. Check hr_settings collection by attendance_token field
  try {
    const hrSnap = await getDocs(
      query(collection(db, 'hr_settings'), where('attendance_token', '==', cleanToken))
    );
    if (!hrSnap.empty) {
      const sDoc = hrSnap.docs[0];
      hrSettings = sDoc.data();
      tenantId = hrSettings.tenant_id || sDoc.id;
    }
  } catch (err: any) {
    console.warn('Error querying hr_settings by token:', err);
  }

  // 2. Direct document lookup in hr_settings by ID (if token matches tenant ID)
  if (!tenantId) {
    try {
      const directDoc = await getDoc(doc(db, 'hr_settings', cleanToken));
      if (directDoc.exists()) {
        hrSettings = directDoc.data();
        tenantId = hrSettings.tenant_id || directDoc.id;
      }
    } catch (err: any) {
      console.warn('Error fetching hr_settings by doc ID:', err);
    }
  }

  // 3. Fallback: Check branches collection by attendance_token field
  if (!tenantId) {
    try {
      const branchSnap = await getDocs(
        query(collection(db, 'branches'), where('attendance_token', '==', cleanToken))
      );
      if (!branchSnap.empty) {
        const bDoc = branchSnap.docs[0];
        branchId = bDoc.id;
        tenantId = bDoc.data().tenant_id;
        branchName = bDoc.data().name || 'الفرع';
        hrSettings = bDoc.data().hr_settings || {};
      }
    } catch (err: any) {
      console.warn('Error querying branches by token:', err);
    }
  }

  // 4. Fallback: Check tenants collection by attendance_token field
  if (!tenantId) {
    try {
      const tSnap = await getDocs(
        query(collection(db, 'tenants'), where('attendance_token', '==', cleanToken))
      );
      if (!tSnap.empty) {
        tenantId = tSnap.docs[0].id;
        branchName = tSnap.docs[0].data().name || 'المطعم';
        hrSettings = tSnap.docs[0].data().hr_settings || {};
      }
    } catch (err: any) {
      console.warn('Error querying tenants by token:', err);
    }
  }

  if (!tenantId) {
    throw new Error('رمز الحضور غير صالح أو منتهي الصلاحية');
  }

  // Merge root hr_settings document if needed
  try {
    const settingsDoc = await getDoc(doc(db, 'hr_settings', tenantId));
    if (settingsDoc.exists()) {
      hrSettings = { ...hrSettings, ...settingsDoc.data() };
    }
  } catch (_) {}

  // Fetch branch/restaurant display name if still default
  if (branchName === 'المطعم' && tenantId) {
    try {
      const tDoc = await getDoc(doc(db, 'tenants', tenantId));
      if (tDoc.exists() && tDoc.data().name) {
        branchName = tDoc.data().name;
      }
    } catch (_) {}
  }

  if (hrSettings.attendance_enabled === false) {
    throw new Error('تسجيل الحضور والانصراف معطل حالياً من قبل الإدارة');
  }

  if (hrSettings.qr_attendance_enabled === false) {
    throw new Error('تسجيل الحضور عبر رمز الـ QR معطل حالياً');
  }

  // Fetch active employees (Strictly sanitized: NO salary, NO pin_hash)
  let employees: PublicEmployee[] = [];
  try {
    const empSnap = await getDocs(
      query(collection(db, 'employees'), where('tenant_id', '==', tenantId), where('status', '==', 'active'))
    );

    employees = empSnap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: data.name || '',
        phone: data.phone || '',
        role: data.role || '',
        department: data.department || '',
        shift_id: data.default_shift_id || data.shift_id || null,
        pin_set: Boolean(data.pin_hash || data.pin),
      };
    });

    employees.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  } catch (err: any) {
    console.error('Error fetching active employees:', err);
    throw new Error('تعذر تحميل قائمة الموظفين. يرجى مراجعة اتصال الإنترنت.');
  }

  return {
    tenantId,
    branchId,
    branchName,
    locationRestriction: Boolean(hrSettings.location_restriction),
    latitude: hrSettings.latitude || null,
    longitude: hrSettings.longitude || null,
    geofenceRadius: hrSettings.geofence_radius || 100,
    employees,
  };
}

/**
 * Submit clock-in or clock-out directly to Firestore
 */
export async function submitPublicClock(payload: {
  token: string;
  employeeId: string;
  pin: string;
  action?: 'check_in' | 'check_out' | 'auto';
  idempotencyKey?: string;
  location?: { latitude: number; longitude: number };
}): Promise<ClockResult> {
  const { employeeId, pin, location } = payload;

  // Rate-limiting check
  const lockout = checkPinLockout(employeeId);
  if (lockout.isLocked) {
    throw new Error(`تم قفل المحاولات لكثرة إدخال PIN الخاطئ. يرجى المحاولة بعد ${lockout.remainingMinutes} دقيقة.`);
  }

  // Fetch employee
  const empDoc = await getDoc(doc(db, 'employees', employeeId));
  if (!empDoc.exists()) {
    throw new Error('الموظف غير موجود');
  }

  const employeeData = empDoc.data()!;
  if (employeeData.status !== 'active') {
    throw new Error('هذا الموظف غير متاح لتسجيل الحضور');
  }

  const storedHash = employeeData.pin_hash || employeeData.pin;
  if (!storedHash) {
    throw new Error('لم يتم تعيين رمز PIN لهذا الموظف بعد. يرجى مراجعة الإدارة.');
  }

  const isValidPin = await verifyPin(pin, storedHash);
  if (!isValidPin) {
    const result = recordFailedPinAttempt(employeeId);
    if (result.isNowLocked) {
      throw new Error('تم إدخال الرمز غير صحيح 5 مرات. تم قفل المحاولة مؤقتاً لمدة 15 دقيقة.');
    }
    throw new Error(`الرقم السري غير صحيح. متبقي ${result.attemptsLeft} محاولات.`);
  }

  // Reset PIN lockout on correct entry
  resetPinAttempts(employeeId);

  const tenantId = employeeData.tenant_id;

  // Check HR settings & Geofencing
  const settingsDoc = await getDoc(doc(db, 'hr_settings', tenantId));
  const hrSettings = settingsDoc.exists() ? settingsDoc.data() : {};

  if (hrSettings.location_restriction) {
    if (!location) {
      throw new Error('يجب السماح بتحديد الموقع الجغرافي لتسجيل الحضور');
    }
    if (hrSettings.latitude && hrSettings.longitude) {
      const allowedRadius = hrSettings.geofence_radius || 100;
      const distance = calculateDistanceMeters(
        location.latitude,
        location.longitude,
        hrSettings.latitude,
        hrSettings.longitude
      );
      if (distance > allowedRadius) {
        throw new Error(
          `يجب أن تكون داخل نطاق المطعم لتسجيل الحضور. المسافة الحالية (${distance}م) تتجاوز النطاق المسموح (${allowedRadius}م)`
        );
      }
    }
  }

  // Date and Time
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  const isoNow = now.toISOString();

  // Find today's attendance record
  const attQuery = query(
    collection(db, 'attendance'),
    where('tenant_id', '==', tenantId),
    where('employee_id', '==', employeeId),
    where('date', '==', todayStr)
  );
  const attSnap = await getDocs(attQuery);

  // Shifts
  const shiftsSnap = await getDocs(query(collection(db, 'shifts'), where('tenant_id', '==', tenantId)));
  const shifts = shiftsSnap.docs.map((d) => ({ id: d.id, ...d.data() as any }));
  const matchedShift = shifts.find((s) => s.id === employeeData.default_shift_id) || shifts[0] || null;
  const gracePeriod = matchedShift?.gracePeriod ?? (hrSettings.default_grace_period || 10);

  // CASE 1: No attendance today -> CHECK-IN
  if (attSnap.empty) {
    if (payload.action === 'check_out') {
      throw new Error('لا يمكن تسجيل الانصراف بدون حضور مسبق');
    }

    let lateMinutes = 0;
    let status = 'present';
    if (matchedShift?.startTime) {
      lateMinutes = calculateLateMinutes(timeStr, matchedShift.startTime, gracePeriod);
      if (lateMinutes > 0) status = 'late';
    }

    const docRef = await addDoc(collection(db, 'attendance'), {
      tenant_id: tenantId,
      branch_id: employeeData.branch_id || null,
      employee_id: employeeId,
      employee_name: employeeData.name,
      employee_role: employeeData.role,
      date: todayStr,
      checkIn: timeStr,
      checkInAt: isoNow,
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
      created_at: isoNow,
      updated_at: isoNow,
    });

    let onApprovedLeaveNotice = false;
    try {
      const leaveQ = query(
        collection(db, 'employee_leaves'),
        where('tenant_id', '==', tenantId),
        where('employee_id', '==', employeeId),
        where('status', '==', 'approved')
      );
      const leaveSnap = await getDocs(leaveQ);
      for (const d of leaveSnap.docs) {
        const l = d.data();
        if (l.start_date <= todayStr && todayStr <= l.end_date) {
          onApprovedLeaveNotice = true;
          break;
        }
      }
    } catch (lErr) {
      // Non-blocking fallback
    }

    const baseMsg = status === 'late' ? `تم تسجيل الحضور (متأخر ${lateMinutes} دقيقة)` : 'تم تسجيل الحضور بنجاح';
    const finalMsg = onApprovedLeaveNotice
      ? `${baseMsg} (ملاحظة: الموظف لديه إجازة معتمدة مسجلة اليوم)`
      : baseMsg;

    return {
      type: 'check_in',
      recordId: docRef.id,
      employeeName: employeeData.name,
      time: timeStr,
      status,
      lateMinutes,
      message: finalMsg,
    };
  }

  // CASE 2: Record exists
  const existingRecord = attSnap.docs[0].data();
  const recordId = attSnap.docs[0].id;

  if (existingRecord.checkOut) {
    return {
      type: 'already_completed',
      recordId,
      employeeName: employeeData.name,
      checkIn: existingRecord.checkIn,
      checkOut: existingRecord.checkOut,
      hours: existingRecord.hours,
      message: 'تم تسجيل حضورك وانصرافك اليوم بالفعل',
    };
  }

  // CLOCK-OUT
  const workedMinutes = calculateWorkedMinutes(existingRecord.checkInAt, isoNow);
  const hours = Math.round((workedMinutes / 60) * 10) / 10;
  let earlyLeaveMinutes = 0;
  if (matchedShift?.endTime) {
    earlyLeaveMinutes = calculateEarlyLeaveMinutes(timeStr, matchedShift.endTime);
  }

  await updateDoc(doc(db, 'attendance', recordId), {
    checkOut: timeStr,
    checkOutAt: isoNow,
    workedMinutes,
    hours,
    earlyLeaveMinutes,
    updated_at: isoNow,
  });

  const hoursDisplay = Math.floor(workedMinutes / 60);
  const minsDisplay = workedMinutes % 60;

  return {
    type: 'check_out',
    recordId,
    employeeName: employeeData.name,
    checkIn: existingRecord.checkIn,
    checkOut: timeStr,
    workedMinutes,
    hours,
    message: `تم تسجيل الانصراف بنجاح (ساعات العمل: ${hoursDisplay}س ${minsDisplay}د)`,
  };
}

/**
 * Delete single attendance record by ID with backend API or direct Firestore fallback
 */
export async function deleteAttendanceRecordApi(attendanceId: string, token?: string): Promise<boolean> {
  if (!attendanceId) return false;

  // Try Backend API if token is provided
  if (token) {
    try {
      const res = await fetch(`${API_BASE_URL}/attendance/${encodeURIComponent(attendanceId)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });
      if (res.ok) {
        return true;
      }
    } catch {
      // Fall back to direct Firestore
    }
  }

  // Direct Firestore deletion
  await deleteDoc(doc(db, 'attendance', attendanceId));
  return true;
}
