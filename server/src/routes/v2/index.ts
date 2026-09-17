import { Router, Request, Response } from 'express';
import { sendSuccess } from '../../utils/response.js';

export const v2Router = Router();

// Version 2 Root & Health Status
v2Router.get('/version', (req: Request, res: Response) => {
  sendSuccess(
    res,
    {
      version: 'v2',
      status: 'active',
      supported_protocols: ['REST', 'Webhooks'],
      deprecation: {
        is_deprecated: false,
        sunset_date: null,
      },
    },
    200
  );
});

// Forward-compatible V2 route mount (mirrors v1 with future-proof extensions)
import { v1Router } from '../v1/index.js';
v2Router.use('/', v1Router);
