import express from 'express';
import { RmsApiClient } from '../../server/src/integration/index.js';
import crypto from 'crypto';

const app = express();
const port = process.env.PORT || 5000;

const rms = new RmsApiClient({
  baseUrl: process.env.RMS_API_URL || 'https://api.your-rms.com/api/v1',
  apiKey: process.env.RMS_API_KEY || 'rms_live_sample.sample_secret',
});

// JSON body parser for normal routes
app.use(express.json());

// Public catalog endpoint for browser frontend
app.get('/api/menu', async (req, res, next) => {
  try {
    const data = await rms.getMenu();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// Server-side pricing calculation
app.post('/api/checkout/preview', async (req, res, next) => {
  try {
    const preview = await rms.previewPricing(req.body);
    res.json(preview);
  } catch (err) {
    next(err);
  }
});

// Order submission
app.post('/api/checkout/submit', async (req, res, next) => {
  try {
    const idempotencyKey = crypto.randomUUID();
    const order = await rms.createOrder(req.body, idempotencyKey);
    res.json(order);
  } catch (err) {
    next(err);
  }
});

export default app;
