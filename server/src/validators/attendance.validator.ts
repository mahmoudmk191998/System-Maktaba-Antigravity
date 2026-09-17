import { z } from 'zod';

export const publicClockSchema = z.object({
  token: z.string().min(1, 'رمز الحضور غير صالح'),
  employeeId: z.string().min(1, 'معرف الموظف مطلوب'),
  pin: z.string().regex(/^\d{4}$/, 'يجب أن يتكون رمز PIN من 4 أرقام بالضبط'),
  action: z.enum(['check_in', 'check_out', 'auto']).default('auto'),
  idempotencyKey: z.string().optional(),
  location: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
    })
    .optional(),
  deviceInfo: z.string().optional(),
});

export const manualAttendanceCorrectionSchema = z.object({
  employeeId: z.string().min(1, 'معرف الموظف مطلوب'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'تاريخ غير صالح (YYYY-MM-DD)'),
  checkIn: z.string().regex(/^\d{2}:\d{2}$/, 'توقيت الحضور غير صالح (HH:mm)'),
  checkOut: z.string().regex(/^\d{2}:\d{2}$/, 'توقيت الانصراف غير صالح (HH:mm)').optional().nullable(),
  status: z.enum(['present', 'late', 'absent', 'on_leave', 'early_leave', 'incomplete']).default('present'),
  reason: z.string().min(3, 'يجب توضيح سبب التعديل اليدوي بالتفصيل'),
  shiftId: z.string().optional().nullable(),
});

export const updateHrSettingsSchema = z.object({
  attendance_enabled: z.boolean().optional(),
  qr_attendance_enabled: z.boolean().optional(),
  location_restriction: z.boolean().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  geofence_radius: z.number().min(10).max(5000).optional(),
  default_grace_period: z.number().min(0).max(120).optional(),
  late_deduction_enabled: z.boolean().optional(),
  early_leave_deduction_enabled: z.boolean().optional(),
  overtime_enabled: z.boolean().optional(),
});

export type PublicClockPayload = z.infer<typeof publicClockSchema>;
export type ManualAttendanceCorrectionPayload = z.infer<typeof manualAttendanceCorrectionSchema>;
export type UpdateHrSettingsPayload = z.infer<typeof updateHrSettingsSchema>;
