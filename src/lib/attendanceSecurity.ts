/**
 * Utilities for Attendance Security, PIN Hashing, Geofencing, and Work Time Calculations
 */

// 1. PIN HASHING (Web Crypto API - SHA-256 with Salt)
export async function hashPin(pin: string, customSalt?: string): Promise<string> {
  if (!/^\d{4}$/.test(pin)) {
    throw new Error('يجب أن يتكون رمز PIN من 4 أرقام بالضبط');
  }

  const salt = customSalt || Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}:${pin}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return `v1$${salt}$${hashHex}`;
}

export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.startsWith('v1$')) {
    // Backward compatibility if plaintext was ever saved (safety check)
    return storedHash === pin;
  }

  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;

  const salt = parts[1];
  const expectedHash = await hashPin(pin, salt);
  return expectedHash === storedHash;
}

// 2. GEOFENCING (Haversine Formula for distance in meters)
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

// 3. SHIFT & TIME CALCULATIONS
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  // Handles HH:mm or HH:mm:ss or HH:mm AM/PM
  const match = timeStr.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return hours * 60 + minutes;
}

export function calculateLateMinutes(
  checkInTimeStr: string,
  shiftStartTimeStr: string,
  gracePeriodMinutes: number = 10
): number {
  const checkInMins = timeStringToMinutes(checkInTimeStr);
  const shiftStartMins = timeStringToMinutes(shiftStartTimeStr);

  const allowedStartMins = shiftStartMins + gracePeriodMinutes;
  if (checkInMins > allowedStartMins) {
    return checkInMins - shiftStartMins;
  }
  return 0;
}

export function calculateEarlyLeaveMinutes(
  checkOutTimeStr: string,
  shiftEndTimeStr: string
): number {
  const checkOutMins = timeStringToMinutes(checkOutTimeStr);
  const shiftEndMins = timeStringToMinutes(shiftEndTimeStr);

  if (checkOutMins < shiftEndMins) {
    return shiftEndMins - checkOutMins;
  }
  return 0;
}

export function calculateWorkedMinutes(
  checkInIso: string,
  checkOutIso: string,
  breakMinutes: number = 0
): number {
  const start = new Date(checkInIso).getTime();
  const end = new Date(checkOutIso).getTime();
  if (isNaN(start) || isNaN(end) || end <= start) return 0;

  const diffMinutes = Math.floor((end - start) / (1000 * 60));
  const effective = diffMinutes - (breakMinutes || 0);
  return Math.max(0, effective);
}

export function formatWorkedHours(workedMinutes: number): string {
  if (!workedMinutes || workedMinutes <= 0) return '0س 0د';
  const hours = Math.floor(workedMinutes / 60);
  const mins = workedMinutes % 60;
  if (hours === 0) return `${mins} دقيقة`;
  if (mins === 0) return `${hours} ساعة`;
  return `${hours}س ${mins}د`;
}

// 4. RATE LIMITING HELPER (Client / Anti-bruteforce Lockout)
const LOCKOUT_KEY_PREFIX = 'rms_pin_lockout_';
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface LockoutData {
  attempts: number;
  lockedUntil: number | null;
}

export function checkPinLockout(employeeId: string): { isLocked: boolean; remainingMinutes: number } {
  try {
    const raw = localStorage.getItem(`${LOCKOUT_KEY_PREFIX}${employeeId}`);
    if (!raw) return { isLocked: false, remainingMinutes: 0 };
    const data: LockoutData = JSON.parse(raw);

    if (data.lockedUntil && Date.now() < data.lockedUntil) {
      const remainingMs = data.lockedUntil - Date.now();
      const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
      return { isLocked: true, remainingMinutes };
    }

    if (data.lockedUntil && Date.now() >= data.lockedUntil) {
      // Lockout expired, reset
      localStorage.removeItem(`${LOCKOUT_KEY_PREFIX}${employeeId}`);
      return { isLocked: false, remainingMinutes: 0 };
    }

    return { isLocked: false, remainingMinutes: 0 };
  } catch {
    return { isLocked: false, remainingMinutes: 0 };
  }
}

export function recordFailedPinAttempt(employeeId: string): { isNowLocked: boolean; attemptsLeft: number } {
  try {
    const key = `${LOCKOUT_KEY_PREFIX}${employeeId}`;
    const raw = localStorage.getItem(key);
    const data: LockoutData = raw ? JSON.parse(raw) : { attempts: 0, lockedUntil: null };

    data.attempts += 1;

    if (data.attempts >= MAX_ATTEMPTS) {
      data.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
      localStorage.setItem(key, JSON.stringify(data));
      return { isNowLocked: true, attemptsLeft: 0 };
    }

    localStorage.setItem(key, JSON.stringify(data));
    return { isNowLocked: false, attemptsLeft: MAX_ATTEMPTS - data.attempts };
  } catch {
    return { isNowLocked: false, attemptsLeft: 1 };
  }
}

export function resetPinAttempts(employeeId: string): void {
  try {
    localStorage.removeItem(`${LOCKOUT_KEY_PREFIX}${employeeId}`);
  } catch {
    // Ignore
  }
}
