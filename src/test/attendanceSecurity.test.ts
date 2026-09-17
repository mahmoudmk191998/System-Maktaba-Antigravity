import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashPin,
  verifyPin,
  calculateDistanceMeters,
  calculateLateMinutes,
  calculateEarlyLeaveMinutes,
  calculateWorkedMinutes,
  formatWorkedHours,
  checkPinLockout,
  recordFailedPinAttempt,
  resetPinAttempts,
} from '@/lib/attendanceSecurity';

describe('Attendance Security & Logic Suite', () => {
  describe('PIN Hashing & Verification', () => {
    it('should hash a valid 4-digit PIN and verify it successfully', async () => {
      const pin = '1234';
      const hash = await hashPin(pin);
      expect(hash).toMatch(/^v1\$[0-9a-f]{32}\$[0-9a-f]{64}$/);

      const isValid = await verifyPin(pin, hash);
      expect(isValid).toBe(true);
    });

    it('should reject an incorrect PIN against the hash', async () => {
      const hash = await hashPin('4321');
      const isValid = await verifyPin('9999', hash);
      expect(isValid).toBe(false);
    });

    it('should reject non-4-digit PINs during hashing', async () => {
      await expect(hashPin('123')).rejects.toThrow();
      await expect(hashPin('12345')).rejects.toThrow();
      await expect(hashPin('abcd')).rejects.toThrow();
    });
  });

  describe('Geofence Distance Calculation', () => {
    it('should calculate distance within restaurant perimeter accurately', () => {
      // Cairo coords
      const restaurantLat = 30.0444;
      const restaurantLng = 31.2357;

      // Same spot
      const d0 = calculateDistanceMeters(restaurantLat, restaurantLng, restaurantLat, restaurantLng);
      expect(d0).toBe(0);

      // Nearby spot (~50m away)
      const nearbyLat = 30.0448;
      const nearbyLng = 31.2357;
      const dist = calculateDistanceMeters(restaurantLat, restaurantLng, nearbyLat, nearbyLng);
      expect(dist).toBeGreaterThan(30);
      expect(dist).toBeLessThan(70);
    });
  });

  describe('Shift & Late Calculation with Grace Period', () => {
    it('should mark present with 0 late minutes if within grace period', () => {
      // Shift starts at 10:00, grace period is 10 min
      // Check-in at 10:07 -> 0 late
      const lateMins = calculateLateMinutes('10:07', '10:00', 10);
      expect(lateMins).toBe(0);
    });

    it('should calculate late minutes when check-in exceeds grace period', () => {
      // Shift starts at 10:00, grace period is 10 min
      // Check-in at 10:17 -> late by 17 minutes from shift start
      const lateMins = calculateLateMinutes('10:17', '10:00', 10);
      expect(lateMins).toBe(17);
    });

    it('should calculate early leave minutes correctly', () => {
      // Shift ends at 18:00
      // Check-out at 17:30 -> 30 min early leave
      const earlyMins = calculateEarlyLeaveMinutes('17:30', '18:00');
      expect(earlyMins).toBe(30);

      // Check-out at 18:05 -> 0 min early leave
      const notEarly = calculateEarlyLeaveMinutes('18:05', '18:00');
      expect(notEarly).toBe(0);
    });
  });

  describe('Work Time Duration & Formatting', () => {
    it('should calculate worked minutes accurately', () => {
      const start = '2026-09-13T09:00:00.000Z';
      const end = '2026-09-13T17:30:00.000Z';
      const workedMins = calculateWorkedMinutes(start, end, 30); // 30 min break
      expect(workedMins).toBe(8 * 60); // 8 hours
    });

    it('should format worked hours cleanly in Arabic format', () => {
      expect(formatWorkedHours(494)).toBe('8س 14د');
      expect(formatWorkedHours(120)).toBe('2 ساعة');
      expect(formatWorkedHours(45)).toBe('45 دقيقة');
    });
  });

  describe('Anti-Bruteforce Lockout', () => {
    const testEmpId = 'emp_test_lockout_1';

    beforeEach(() => {
      resetPinAttempts(testEmpId);
    });

    it('should lock out after 5 consecutive failed attempts', () => {
      let status = checkPinLockout(testEmpId);
      expect(status.isLocked).toBe(false);

      for (let i = 1; i <= 4; i++) {
        const res = recordFailedPinAttempt(testEmpId);
        expect(res.isNowLocked).toBe(false);
        expect(res.attemptsLeft).toBe(5 - i);
      }

      // 5th attempt triggers lock
      const fifth = recordFailedPinAttempt(testEmpId);
      expect(fifth.isNowLocked).toBe(true);
      expect(fifth.attemptsLeft).toBe(0);

      const lockedStatus = checkPinLockout(testEmpId);
      expect(lockedStatus.isLocked).toBe(true);
      expect(lockedStatus.remainingMinutes).toBeGreaterThan(0);
    });
  });
});
