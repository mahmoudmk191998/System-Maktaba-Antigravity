/**
 * Offline Conflict Management Service
 * Provides diagnostic tools and manager workflows for reviewing, retrying,
 * and safely resolving offline queue conflicts.
 */

import { getOfflineDB } from './offlineDb';
import { offlineSyncService } from './offlineSync.service';
import type { OfflineOperation } from './offlineTypes';

export interface ConflictDiagnostic {
  operationId: string;
  operationType: string;
  temporaryReceiptNumber?: string;
  cashierId: string;
  createdAt: string;
  status: string;
  errorCode?: string;
  errorMessage?: string;
  grandTotal?: number;
  itemCount: number;
  retryCount: number;
}

export class OfflineConflictService {
  /**
   * Retrieves all operations currently in conflict or failure state
   */
  public async getConflictOperations(tenantId?: string): Promise<OfflineOperation<any>[]> {
    const db = await getOfflineDB();
    const all = await db.getAll('offline_queue');
    return all.filter((op) => {
      if (tenantId && op.tenantId !== tenantId) return false;
      return op.status === 'conflict' || op.status === 'failed';
    });
  }

  /**
   * Builds diagnostic details for manager review
   */
  public getDiagnosticDetails(op: OfflineOperation<any>): ConflictDiagnostic {
    return {
      operationId: op.id,
      operationType: op.operationType,
      temporaryReceiptNumber: op.clientSnapshot?.temporaryReceiptNumber,
      cashierId: op.createdBy,
      createdAt: op.createdAt,
      status: op.status,
      errorCode: op.errorCode,
      errorMessage: op.errorMessage,
      grandTotal: op.clientSnapshot?.grandTotal,
      itemCount: op.payload?.items?.length || 0,
      retryCount: op.retryCount || 0,
    };
  }

  /**
   * Retries an operation that was previously marked as conflict or failed.
   */
  public async retryOperation(operationId: string): Promise<{ success: boolean; resultStatus?: string; error?: string }> {
    const db = await getOfflineDB();
    const op = await db.get('offline_queue', operationId);

    if (!op) {
      return { success: false, error: 'العملية غير موجودة' };
    }

    const res = await offlineSyncService.syncSingleOperation(op);
    return {
      success: res === 'synced',
      resultStatus: res,
      error: res !== 'synced' ? op.errorMessage : undefined,
    };
  }
}

export const offlineConflictService = new OfflineConflictService();
