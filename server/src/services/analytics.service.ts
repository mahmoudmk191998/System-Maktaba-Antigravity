import { v4 as uuidv4 } from 'uuid';
import { getFirestoreDb } from '../config/firebase.js';
import { env } from '../config/environment.js';
import { ApiUsageEvent, ClientUsageSummary, UsageFilterOptions } from '../types/analytics.types.js';

const COLLECTION_NAME = 'api_usage_events';
const inMemoryEvents: ApiUsageEvent[] = [];

export class AnalyticsService {
  private useMemory: boolean;

  constructor(useMemory: boolean = env.NODE_ENV === 'test') {
    this.useMemory = useMemory;
  }

  /**
   * Records an API usage event asynchronously.
   * Strictly avoids storing secrets, tokens, customer passwords, or raw bodies.
   */
  async recordUsageEvent(event: Omit<ApiUsageEvent, 'id'>): Promise<void> {
    const usageEvent: ApiUsageEvent = {
      id: `use_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
      ...event,
    };

    if (this.useMemory) {
      inMemoryEvents.push(usageEvent);
      return;
    }

    try {
      const db = getFirestoreDb();
      await db.collection(COLLECTION_NAME).doc(usageEvent.id).set(usageEvent);
    } catch (_) {
      inMemoryEvents.push(usageEvent);
    }
  }

  /**
   * Aggregates usage analytics for a client within a tenant.
   */
  async getClientUsageAnalytics(
    tenantId: string,
    clientId: string,
    options: UsageFilterOptions = {}
  ): Promise<ClientUsageSummary> {
    let allEvents: ApiUsageEvent[] = [];

    if (this.useMemory) {
      allEvents = inMemoryEvents.filter(
        (e) => e.tenant_id === tenantId && e.client_id === clientId
      );
    } else {
      try {
        const db = getFirestoreDb();
        const snapshot = await db
          .collection(COLLECTION_NAME)
          .where('tenant_id', '==', tenantId)
          .where('client_id', '==', clientId)
          .get();

        allEvents = snapshot.docs.map((d) => d.data() as ApiUsageEvent);
      } catch (_) {
        allEvents = inMemoryEvents.filter(
          (e) => e.tenant_id === tenantId && e.client_id === clientId
        );
      }
    }

    // Apply filtering
    let filtered = allEvents;

    if (options.startDate) {
      filtered = filtered.filter((e) => e.timestamp >= options.startDate!);
    }
    if (options.endDate) {
      filtered = filtered.filter((e) => e.timestamp <= options.endDate!);
    }
    if (options.endpoint) {
      filtered = filtered.filter((e) => e.endpoint.includes(options.endpoint!));
    }
    if (options.statusCode) {
      filtered = filtered.filter((e) => e.status_code === options.statusCode);
    }

    // Sort descending by timestamp
    filtered.sort((a, b) => (b.timestamp > a.timestamp ? 1 : -1));

    const totalRequests = filtered.length;
    const successfulRequests = filtered.filter((e) => e.status_code >= 200 && e.status_code < 400).length;
    const failedRequests = filtered.filter((e) => e.status_code >= 400).length;
    const count4xx = filtered.filter((e) => e.status_code >= 400 && e.status_code < 500).length;
    const count5xx = filtered.filter((e) => e.status_code >= 500).length;
    const rateLimitViolations = filtered.filter((e) => e.status_code === 429).length;

    const totalResponseTime = filtered.reduce((acc, curr) => acc + (curr.response_time_ms || 0), 0);
    const avgResponseTime = totalRequests > 0 ? Math.round((totalResponseTime / totalRequests) * 100) / 100 : 0;

    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize || 20));
    const startIndex = (page - 1) * pageSize;
    const paginatedEvents = filtered.slice(startIndex, startIndex + pageSize);

    return {
      client_id: clientId,
      tenant_id: tenantId,
      total_requests: totalRequests,
      successful_requests: successfulRequests,
      failed_requests: failedRequests,
      count_4xx: count4xx,
      count_5xx: count5xx,
      rate_limit_violations: rateLimitViolations,
      avg_response_time_ms: avgResponseTime,
      events: paginatedEvents,
      page,
      page_size: pageSize,
      total_events: totalRequests,
    };
  }

  clearMemory(): void {
    inMemoryEvents.length = 0;
  }
}

export const defaultAnalyticsService = new AnalyticsService();
