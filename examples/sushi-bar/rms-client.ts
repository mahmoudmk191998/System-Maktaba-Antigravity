import { RmsApiClient } from '../../server/src/integration/index.js';

const RMS_BASE_URL = process.env.RMS_BASE_URL || 'http://localhost:4000/api/v1';
const RMS_API_KEY = process.env.RMS_API_KEY || 'rms_live_cli_sushi_bar.rms_sec_example_secret';
const RMS_DEFAULT_BRANCH_ID = process.env.RMS_DEFAULT_BRANCH_ID || 'branch_sushi_main';

export const rmsClient = new RmsApiClient({
  baseUrl: RMS_BASE_URL,
  apiKey: RMS_API_KEY,
  branchId: RMS_DEFAULT_BRANCH_ID,
  timeoutMs: 10000,
  maxRetries: 2,
});
