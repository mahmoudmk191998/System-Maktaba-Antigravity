import { RmsApiClient } from '../../server/src/integration/index.js';

const RMS_BASE_URL = process.env.RMS_API_URL || 'https://api.example-rms.com/api/v1';
const RMS_API_KEY = process.env.RMS_API_KEY || 'rms_live_cli_sample.sample_secret';

export const rms = new RmsApiClient({
  baseUrl: RMS_BASE_URL,
  apiKey: RMS_API_KEY,
  timeoutMs: 10000,
  maxRetries: 2,
});
