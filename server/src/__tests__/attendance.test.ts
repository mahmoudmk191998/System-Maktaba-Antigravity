import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import {
  seedTestAttendanceToken,
  seedTestAttendanceRecord,
  clearTestAttendanceStore,
} from '../controllers/attendance.controller.js';

describe('Attendance API & Deletion Suite', () => {
  beforeEach(() => {
    clearTestAttendanceStore();
  });

  describe('GET /api/v1/attendance/public/info', () => {
    it('should reject request when token is missing with 400', async () => {
      const res = await request(app).get('/api/v1/attendance/public/info');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 when token does not exist in any collection', async () => {
      const res = await request(app).get('/api/v1/attendance/public/info?token=non_existent_token_12345');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    }, 15000);

    it('should return 200 and branch info when valid token is provided', async () => {
      seedTestAttendanceToken('valid_test_token_777', {
        tenantId: 'tenant_test_1',
        branchId: 'branch_test_1',
        branchName: 'فرع المعادي',
        hrSettings: {
          attendance_enabled: true,
          location_restriction: false,
          geofence_radius: 100,
        },
      });

      const res = await request(app).get('/api/v1/attendance/public/info?token=valid_test_token_777');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.tenantId).toBe('tenant_test_1');
      expect(res.body.data.branchName).toBe('فرع المعادي');
    });
  });

  describe('DELETE /api/v1/attendance/:attendanceId', () => {
    it('should reject unauthenticated request with 401 Unauthorized', async () => {
      const res = await request(app).delete('/api/v1/attendance/att_test_123');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 404 when deleting a non-existent attendance record with auth', async () => {
      const res = await request(app)
        .delete('/api/v1/attendance/non_existent_rec_999')
        .set('Authorization', 'Bearer mock_admin_token_admin_test_1')
        .set('X-Tenant-ID', 'tenant_test_1');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should successfully delete existing record with auth and tenant match', async () => {
      seedTestAttendanceRecord('rec_to_delete_1', {
        tenant_id: 'tenant_test_1',
        employee_id: 'emp_123',
        employee_name: 'أحمد محمود',
        date: '2026-09-13',
        checkIn: '09:00',
      });

      const res = await request(app)
        .delete('/api/v1/attendance/rec_to_delete_1')
        .set('Authorization', 'Bearer mock_admin_token_admin_test_1')
        .set('X-Tenant-ID', 'tenant_test_1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe('rec_to_delete_1');
    });

    it('should reject deletion with 403 when record belongs to a different tenant', async () => {
      seedTestAttendanceRecord('rec_foreign_tenant', {
        tenant_id: 'tenant_other_99',
        employee_id: 'emp_999',
        employee_name: 'موظف مطعم آخر',
        date: '2026-09-13',
      });

      const res = await request(app)
        .delete('/api/v1/attendance/rec_foreign_tenant')
        .set('Authorization', 'Bearer mock_admin_token_admin_test_1')
        .set('X-Tenant-ID', 'tenant_test_1');

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
