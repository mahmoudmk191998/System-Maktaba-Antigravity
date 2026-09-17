import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthenticatedRequest } from '../types/api.types.js';

export function sanitizeRequestId(rawId?: string): string {
  if (!rawId) return uuidv4();
  const trimmed = rawId.trim();
  // Safe alphanumeric, dashes, underscores only; capped at 64 characters
  const sanitized = trimmed.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return sanitized.length > 0 ? sanitized : uuidv4();
}

export function requestIdMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const incomingId = req.header('X-Request-ID');
  const requestId = sanitizeRequestId(incomingId);
  
  req.requestId = requestId;
  req.startTime = Date.now();
  
  res.setHeader('X-Request-ID', requestId);
  next();
}
