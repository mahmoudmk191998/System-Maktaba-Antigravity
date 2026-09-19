/**
 * Development Diagnostic Firestore Usage Logger
 * 
 * Provides visibility into Firestore query patterns, operations, and estimated document reads/writes.
 * NOTE: Numbers are strictly labeled as "Estimated Reads" and serve as diagnostic indicators 
 * to compare Before/After performance and identify heavy queries.
 * Completely no-op in production.
 */

export interface FirestoreLogEntry {
  id: string;
  timestamp: string;
  context: string; // e.g., 'Dashboard', 'POS', 'Products'
  collection: string; // e.g., 'sales', 'products', 'stats_daily'
  operation: 'getDoc' | 'getDocs' | 'onSnapshot' | 'count' | 'aggregate' | 'addDoc' | 'setDoc' | 'updateDoc' | 'deleteDoc' | 'transaction';
  estimatedDocs: number;
  durationMs?: number;
  details?: string;
}

class FirestoreUsageLogger {
  private logs: FirestoreLogEntry[] = [];
  private totalEstimatedReads = 0;
  private totalEstimatedWrites = 0;
  private enabled = Boolean(import.meta.env.DEV);

  public logOperation(
    context: string,
    collectionName: string,
    operation: FirestoreLogEntry['operation'],
    estimatedDocs = 1,
    durationMs?: number,
    details?: string
  ): void {
    if (!this.enabled) return;

    const entry: FirestoreLogEntry = {
      id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString('ar-EG'),
      context,
      collection: collectionName,
      operation,
      estimatedDocs,
      durationMs,
      details,
    };

    this.logs.push(entry);

    if (operation.startsWith('get') || operation === 'onSnapshot' || operation === 'count' || operation === 'aggregate') {
      this.totalEstimatedReads += estimatedDocs;
    } else {
      this.totalEstimatedWrites += estimatedDocs;
    }

    // Keep memory bounded to last 1000 logs in dev
    if (this.logs.length > 1000) {
      this.logs.shift();
    }

    if (import.meta.env.DEV && (window as any)?.__ENABLE_FIRESTORE_CONSOLE_LOGS__) {
      console.debug(
        `%c[Firestore Diagnostic]%c ${operation} on '${collectionName}' (${context}) -> ~${estimatedDocs} docs`,
        'color: #f59e0b; font-weight: bold;',
        'color: inherit;'
      );
    }
  }

  public getSummary(): { totalEstimatedReads: number; totalEstimatedWrites: number; logsCount: number } {
    return {
      totalEstimatedReads: this.totalEstimatedReads,
      totalEstimatedWrites: this.totalEstimatedWrites,
      logsCount: this.logs.length,
    };
  }

  public getLogs(): FirestoreLogEntry[] {
    return [...this.logs];
  }

  public reset(): void {
    this.logs = [];
    this.totalEstimatedReads = 0;
    this.totalEstimatedWrites = 0;
  }
}

export const firestoreLogger = new FirestoreUsageLogger();

// Expose on window for easy developer inspection in DevTools
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).__FIRESTORE_LOGGER__ = firestoreLogger;
}
