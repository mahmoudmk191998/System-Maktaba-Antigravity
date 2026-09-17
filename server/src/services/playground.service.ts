import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { defaultIntegrationService, IntegrationService } from './integration.service.js';
import { defaultApiClientService, ApiClientService } from './apiClient.service.js';
import { defaultAnalyticsService, AnalyticsService } from './analytics.service.js';
import { defaultBranchesService } from './branches.service.js';
import { defaultMenuService } from './menu.service.js';
import { defaultSettingsService } from './settings.service.js';
import { defaultDeliveryService } from './delivery.service.js';
import { defaultOffersService } from './offers.service.js';
import { defaultPricingEngine } from './pricing/pricing.engine.js';
import { defaultOrderService } from './order.service.js';
import { defaultOrderStatusService } from './orderStatus.service.js';
import { sanitizeRequestId } from '../middleware/requestId.js';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import { ApiPermission } from '../types/permissions.types.js';

export interface SafeIntegrationMetadata {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'disabled' | 'revoked';
  allowed_branch_ids: string[];
  permissions: string[];
  rate_limit_tier: string;
  allowed_origins?: string[];
  created_at: string;
  api_version: 'v1' | 'v2';
}

export interface ExecutePlaygroundRequestInput {
  tenant_id: string;
  caller_client_id: string;
  integration_id: string;
  version?: 'v1' | 'v2';
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  query_params?: Record<string, string>;
  headers?: Record<string, string>;
  body?: any;
}

export interface PlaygroundCodeExamples {
  curl: string;
  javascript: string;
  sdk: string;
}

export interface PlaygroundExecutionResult {
  status_code: number;
  duration_ms: number;
  request_id: string;
  headers: Record<string, string>;
  body: any;
  safe_request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: any;
  };
  rate_limit: {
    limit?: string;
    remaining?: string;
    reset?: string;
    retry_after?: string;
  };
  code_examples: PlaygroundCodeExamples;
}

// Endpoint permission requirements mapping
const ENDPOINT_PERMISSIONS: Array<{
  pattern: RegExp;
  method: string;
  permission: ApiPermission | null;
  sdkMethod?: string;
}> = [
  { pattern: /^\/health$/, method: 'GET', permission: null, sdkMethod: 'await rms.getHealth()' },
  { pattern: /^\/version$/, method: 'GET', permission: null },
  { pattern: /^\/settings$/, method: 'GET', permission: 'menu:read', sdkMethod: 'await rms.getSettings()' },
  { pattern: /^\/branches$/, method: 'GET', permission: 'branches:read', sdkMethod: 'await rms.getBranches()' },
  { pattern: /^\/branches\/[^/]+$/, method: 'GET', permission: 'branches:read' },
  { pattern: /^\/categories$/, method: 'GET', permission: 'menu:read', sdkMethod: 'await rms.getCategories()' },
  { pattern: /^\/products$/, method: 'GET', permission: 'menu:read', sdkMethod: 'await rms.getProducts()' },
  { pattern: /^\/products\/[^/]+$/, method: 'GET', permission: 'menu:read', sdkMethod: 'await rms.getProductById(productId)' },
  { pattern: /^\/menu$/, method: 'GET', permission: 'menu:read', sdkMethod: 'await rms.getMenu()' },
  { pattern: /^\/delivery-zones$/, method: 'GET', permission: 'delivery:read', sdkMethod: 'await rms.getDeliveryZones()' },
  { pattern: /^\/offers$/, method: 'GET', permission: 'offers:read', sdkMethod: 'await rms.getOffers()' },
  { pattern: /^\/pricing\/preview$/, method: 'POST', permission: 'menu:read', sdkMethod: 'await rms.previewPricing(input)' },
  { pattern: /^\/orders$/, method: 'POST', permission: 'orders:create', sdkMethod: 'await rms.createOrder(input, { idempotencyKey })' },
  { pattern: /^\/orders\/[^/]+$/, method: 'GET', permission: 'orders:read', sdkMethod: 'await rms.getOrder(orderId)' },
  { pattern: /^\/orders\/[^/]+\/track$/, method: 'GET', permission: 'orders:read', sdkMethod: 'await rms.trackOrder(orderId)' },
  { pattern: /^\/orders\/[^/]+\/status$/, method: 'PATCH', permission: 'orders:update_status', sdkMethod: 'await rms.updateOrderStatus(orderId, status)' },
];

export class PlaygroundService {
  private integrationService: IntegrationService;
  private apiClientService: ApiClientService;
  private analyticsService: AnalyticsService;
  private cachedOpenApiSpec: any = null;

  constructor(
    integrationService: IntegrationService = defaultIntegrationService,
    apiClientService: ApiClientService = defaultApiClientService,
    analyticsService: AnalyticsService = defaultAnalyticsService
  ) {
    this.integrationService = integrationService;
    this.apiClientService = apiClientService;
    this.analyticsService = analyticsService;
  }

  /**
   * List safe metadata for integrations belonging to the caller's tenant
   */
  async getTenantIntegrations(tenantId: string): Promise<SafeIntegrationMetadata[]> {
    const integrations = await this.integrationService.listIntegrations(tenantId);
    return integrations.map((int) => ({
      id: int.id,
      name: int.name,
      type: int.type,
      status: int.status,
      allowed_branch_ids: int.allowed_branch_ids,
      permissions: int.permissions,
      rate_limit_tier: int.rate_limit_tier,
      allowed_origins: int.allowed_origins,
      created_at: int.created_at,
      api_version: 'v1',
    }));
  }

  /**
   * Returns parsed OpenAPI specification without internal credentials or secrets
   */
  async getOpenApiSpec(version: 'v1' | 'v2' = 'v1'): Promise<any> {
    if (!this.cachedOpenApiSpec) {
      const candidates = [
        path.resolve(process.cwd(), 'docs/api/openapi.yaml'),
        path.resolve(process.cwd(), '../docs/api/openapi.yaml'),
      ];

      let rawYaml = '';
      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          rawYaml = fs.readFileSync(candidate, 'utf-8');
          break;
        }
      }

      if (rawYaml) {
        this.cachedOpenApiSpec = YAML.parse(rawYaml);
      } else {
        this.cachedOpenApiSpec = {
          openapi: '3.0.3',
          info: { title: 'RMS REST API', version: '1.0.0' },
          paths: {},
        };
      }
    }

    const spec = JSON.parse(JSON.stringify(this.cachedOpenApiSpec));
    spec.info.version = version === 'v2' ? '2.0.0' : '1.0.0';
    return spec;
  }

  /**
   * Server-side secure request execution on behalf of the selected tenant integration
   */
  async executeRequest(input: ExecutePlaygroundRequestInput): Promise<PlaygroundExecutionResult> {
    const { tenant_id, integration_id, method, body } = input;
    const version = input.version || 'v1';
    let normalizedPath = input.path.trim();
    if (!normalizedPath.startsWith('/')) normalizedPath = `/${normalizedPath}`;

    // 1. SSRF & Open Proxy Guard: Reject arbitrary protocols, domains, ports, or non-whitelisted roots
    if (
      normalizedPath.includes('://') ||
      normalizedPath.startsWith('//') ||
      normalizedPath.includes('..') ||
      normalizedPath.includes('\\')
    ) {
      throw new ValidationError('Invalid path: Destination must be a relative API path');
    }

    // Strip leading /api/v1 or /api/v2 if provided
    normalizedPath = normalizedPath.replace(/^\/api\/v[12]/, '');
    if (!normalizedPath.startsWith('/')) normalizedPath = `/${normalizedPath}`;

    // 2. Tenant Isolation & Integration Validation
    const integration = await this.integrationService.getIntegrationById(tenant_id, integration_id);
    if (!integration) {
      throw new NotFoundError(`Integration '${integration_id}' not found`);
    }

    if (integration.status !== 'active') {
      throw new ForbiddenError(`Integration '${integration_id}' is ${integration.status} and cannot execute requests`);
    }

    // 3. Permission Matching
    const matched = ENDPOINT_PERMISSIONS.find(
      (ep) => ep.method === method && ep.pattern.test(normalizedPath)
    );

    if (!matched) {
      throw new ValidationError(`Endpoint ${method} ${normalizedPath} is not supported in the Playground`);
    }

    if (matched.permission && !integration.permissions.includes(matched.permission)) {
      throw new ForbiddenError(
        `Integration lacks required permission '${matched.permission}' for ${method} ${normalizedPath}`
      );
    }

    // 4. Branch Restriction Check
    const branchHeader = input.headers?.['x-branch-id'] || input.headers?.['X-Branch-ID'];
    if (branchHeader && integration.allowed_branch_ids.length > 0) {
      if (!integration.allowed_branch_ids.includes(branchHeader)) {
        throw new ForbiddenError(`Branch '${branchHeader}' is not authorized for this integration`);
      }
    }

    // 5. Build Safe Request Envelope & Code Examples
    const safeRequestId = sanitizeRequestId(input.headers?.['x-request-id'] || input.headers?.['X-Request-ID']);
    const safeHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'RMS-Developer-Playground/1.0',
      'X-Request-ID': safeRequestId,
      ...(branchHeader ? { 'X-Branch-ID': branchHeader } : {}),
      ...(input.headers?.['idempotency-key'] || input.headers?.['Idempotency-Key']
        ? { 'Idempotency-Key': input.headers?.['idempotency-key'] || input.headers?.['Idempotency-Key'] }
        : {}),
    };

    const fullUrl = `https://api.example-restaurant.com/api/${version}${normalizedPath}`;
    const codeExamples = this.generateCodeExamples(method, fullUrl, safeHeaders, body, matched.sdkMethod);

    // 6. Direct Authoritative Service Execution
    const startTime = Date.now();
    let statusCode = 200;
    let responseData: any = null;

    try {
      if (normalizedPath === '/health') {
        responseData = { status: 'healthy', service: 'rms-api', version };
      } else if (normalizedPath === '/version') {
        responseData = { version, status: 'active' };
      } else if (normalizedPath === '/settings') {
        responseData = await defaultSettingsService.getPublicSettings(tenant_id);
      } else if (normalizedPath === '/branches') {
        responseData = await defaultBranchesService.getBranches(tenant_id, integration.allowed_branch_ids);
      } else if (normalizedPath.startsWith('/branches/')) {
        const branchId = normalizedPath.split('/branches/')[1];
        responseData = await defaultBranchesService.getBranchById(tenant_id, branchId);
      } else if (normalizedPath === '/categories') {
        responseData = await defaultMenuService.getCategories(tenant_id);
      } else if (normalizedPath === '/products') {
        responseData = await defaultMenuService.getProducts(tenant_id, {
          category_id: input.query_params?.category_id,
        });
      } else if (normalizedPath.startsWith('/products/')) {
        const prodId = normalizedPath.split('/products/')[1];
        responseData = await defaultMenuService.getProductById(tenant_id, prodId);
      } else if (normalizedPath === '/menu') {
        responseData = await defaultMenuService.getFullMenu(tenant_id);
      } else if (normalizedPath === '/delivery-zones') {
        responseData = await defaultDeliveryService.getDeliveryZones(tenant_id);
      } else if (normalizedPath === '/offers') {
        responseData = await defaultOffersService.getOffers(tenant_id);
      } else if (normalizedPath === '/pricing/preview') {
        responseData = await defaultPricingEngine.calculateOrderPricing({
          tenantId: tenant_id,
          branchId: body?.branch_id || 'branch_1',
          orderType: body?.order_type || 'takeaway',
          items: body?.items || [],
          couponCode: body?.coupon_code,
          promotionId: body?.promotion_id,
          delivery: body?.delivery,
        });
      } else if (normalizedPath === '/orders' && method === 'POST') {
        const created = await defaultOrderService.createOrder(
          tenant_id,
          integration.api_client_id,
          body,
          input.headers?.['idempotency-key'] || input.headers?.['Idempotency-Key']
        );
        statusCode = 201;
        responseData = created;
      } else if (normalizedPath.startsWith('/orders/') && normalizedPath.endsWith('/track')) {
        const orderId = normalizedPath.split('/orders/')[1].split('/track')[0];
        const history = await defaultOrderStatusService.getStatusHistory(tenant_id, orderId);
        const order = await defaultOrderService.getOrderById(tenant_id, orderId);
        responseData = { order_id: orderId, current_status: order?.status, history };
      } else if (normalizedPath.startsWith('/orders/') && normalizedPath.endsWith('/status') && method === 'PATCH') {
        const orderId = normalizedPath.split('/orders/')[1].split('/status')[0];
        const updated = await defaultOrderService.transitionStatus(
          tenant_id,
          orderId,
          body.status,
          integration.allowed_branch_ids
        );
        responseData = defaultOrderService.toPublicOrder(updated);
      } else if (normalizedPath.startsWith('/orders/')) {
        const orderId = normalizedPath.split('/orders/')[1];
        const order = await defaultOrderService.getOrderById(tenant_id, orderId);
        if (!order) {
          throw new NotFoundError(`Order '${orderId}' not found`);
        }
        responseData = defaultOrderService.toPublicOrder(order);
      } else {
        responseData = { message: `Executed ${method} /api/${version}${normalizedPath}` };
      }
    } catch (err: any) {
      statusCode = err?.statusCode || (err instanceof AppError ? err.statusCode : 500);
      responseData = {
        success: false,
        error: {
          code: err?.code || 'API_ERROR',
          message: err?.message || 'Execution error',
        },
      };
    }

    const durationMs = Date.now() - startTime;

    const responseBody = responseData?.success !== undefined
      ? responseData
      : { success: statusCode < 400, data: responseData };

    const responseHeaders: Record<string, string> = {
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': safeRequestId,
      'x-ratelimit-limit': '500',
      'x-ratelimit-remaining': '499',
      'x-ratelimit-reset': '60',
    };

    // 7. Rate limit headers safely
    const rateLimitInfo = {
      limit: responseHeaders['x-ratelimit-limit'],
      remaining: responseHeaders['x-ratelimit-remaining'],
      reset: responseHeaders['x-ratelimit-reset'],
      retry_after: responseHeaders['retry-after'],
    };

    // 8. Sanitize response headers & body
    const sanitizedResponseHeaders = this.sanitizeHeaders(responseHeaders);
    const sanitizedResponseBody = this.sanitizeBody(responseBody);

    // 9. Record Audit Event
    await this.analyticsService
      .recordUsageEvent({
        tenant_id,
        client_id: integration.api_client_id,
        endpoint: `/api/${version}${normalizedPath}`,
        method,
        status_code: statusCode,
        response_time_ms: durationMs,
        request_id: safeRequestId,
        timestamp: new Date().toISOString(),
      })
      .catch(() => {});

    return {
      status_code: statusCode,
      duration_ms: durationMs,
      request_id: safeRequestId,
      headers: sanitizedResponseHeaders,
      body: sanitizedResponseBody,
      safe_request: {
        method,
        url: `/api/${version}${normalizedPath}`,
        headers: safeHeaders,
        body: this.sanitizeBody(body),
      },
      rate_limit: rateLimitInfo,
      code_examples: codeExamples,
    };
  }

  private generateCodeExamples(
    method: string,
    url: string,
    headers: Record<string, string>,
    body?: any,
    sdkMethod?: string
  ): PlaygroundCodeExamples {
    let curl = `curl -X ${method} \\\n  '${url}' \\\n  -H 'Authorization: Bearer <YOUR_API_KEY>'`;
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== 'authorization') {
        curl += ` \\\n  -H '${k}: ${v}'`;
      }
    }
    if (body && ['POST', 'PATCH', 'PUT'].includes(method)) {
      curl += ` \\\n  -d '${JSON.stringify(body, null, 2)}'`;
    }

    let js = `const response = await fetch('${url}', {\n  method: '${method}',\n  headers: {\n    'Authorization': 'Bearer ' + process.env.RMS_API_KEY,\n`;
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== 'authorization') {
        js += `    '${k}': '${v}',\n`;
      }
    }
    js += `  }`;
    if (body && ['POST', 'PATCH', 'PUT'].includes(method)) {
      js += `,\n  body: JSON.stringify(${JSON.stringify(body, null, 4)})`;
    }
    js += `\n});\nconst data = await response.json();`;

    let sdk = `import { RmsApiClient } from '@rms/sdk';\n\nconst rms = new RmsApiClient({\n  baseUrl: '${url.split('/api/')[0]}/api/v1',\n  apiKey: process.env.RMS_API_KEY!,\n});\n\n`;
    if (sdkMethod) {
      if (body) {
        sdk += `const input = ${JSON.stringify(body, null, 2)};\n`;
      }
      sdk += `const result = ${sdkMethod};\nconsole.log(result);`;
    } else {
      sdk += `// Direct API request\nconst result = await rms.request('${url.split('/api/v1')[1] || url}', '${method}');`;
    }

    return { curl, javascript: js, sdk };
  }

  private sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sensitiveKeys = ['authorization', 'cookie', 'set-cookie', 'api-key', 'client-secret', 'webhook-secret', 'x-api-key'];
    const sanitized: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      if (sensitiveKeys.includes(k.toLowerCase())) {
        sanitized[k] = '<REDACTED>';
      } else {
        sanitized[k] = v;
      }
    }
    return sanitized;
  }

  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') return body;
    const sensitiveProps = ['secret', 'client_secret', 'webhook_secret', 'password', 'card_number', 'cvv', 'token', 'private_key'];
    const clone = Array.isArray(body) ? [...body] : { ...body };

    for (const key of Object.keys(clone)) {
      if (sensitiveProps.includes(key.toLowerCase())) {
        clone[key] = '<REDACTED>';
      } else if (typeof clone[key] === 'object') {
        clone[key] = this.sanitizeBody(clone[key]);
      }
    }
    return clone;
  }
}

export const defaultPlaygroundService = new PlaygroundService();
