import { Request } from 'express';
import { ApiPermission } from './permissions.types.js';

export interface RequestContext {
  clientId: string;
  tenantId: string;
  allowedBranchIds: string[];
  permissions: ApiPermission[];
  rateLimitTier?: 'free' | 'standard' | 'premium';
}

export interface ApiSuccessResponse<T> {
  success: true;
  data?: T;
  [key: string]: any;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  details?: any;
}

export interface ApiErrorResponse {
  success: false;
  error: ApiErrorDetail;
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface AuthenticatedRequest extends Request {
  requestId?: string;
  apiClient?: RequestContext;
  startTime?: number;
}
