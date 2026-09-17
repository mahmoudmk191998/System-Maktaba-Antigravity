import { Response } from 'express';
import { ApiErrorResponse, ApiSuccessResponse } from '../types/api.types.js';

export function sendSuccess<T>(
  res: Response,
  data?: T,
  statusCode: number = 200,
  extraMeta?: Record<string, any>
): void {
  const response: ApiSuccessResponse<T> = {
    success: true,
    ...(data !== undefined ? { data } : {}),
    ...(extraMeta || {}),
  };

  res.status(statusCode).json(response);
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode: number = 500,
  details?: any
): void {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  };

  res.status(statusCode).json(response);
}
