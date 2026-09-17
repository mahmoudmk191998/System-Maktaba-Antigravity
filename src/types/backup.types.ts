/**
 * Backup & Disaster Recovery System - Type Definitions
 * Strict Non-Invasive Data Protection Architecture
 */

export type BackupType = 'full' | 'module' | 'branch';

export type BackupStatus = 'completed' | 'in_progress' | 'failed' | 'corrupted';

export type HealthStatus = 'healthy' | 'warning' | 'critical';

export interface BackupManifest {
  backupId: string;
  version: number;
  schemaVersion: number;
  tenantId: string;
  branchIds: string[];
  createdAt: string;
  createdBy: string;
  createdByName?: string;
  backupType: BackupType;
  selectedModule?: string;
  collectionsIncluded: string[];
  documentsCount: number;
  sizeBytes: number;
  checksum: string; // SHA-256
  status: BackupStatus;
  appVersion: string;
  collectionCounts: Record<string, number>;
  hasSensitiveData: boolean;
  fileReferencesOnly: boolean;
  notes?: string;
}

export interface BackupRecord extends BackupManifest {
  storagePath?: string;
  verifiedAt?: string;
  isVerified?: boolean;
}

export interface BackupPayload {
  manifest: BackupManifest;
  data: Record<string, any[]>;
}

export interface CollectionAuditItem {
  collection: string;
  count: number;
  toCreate: number;
  toUpdate: number;
  identical: number;
  missingReferences: string[];
  status: 'clean' | 'warning' | 'error';
  errorMessage?: string;
}

export interface RestoreDryRunResult {
  canRestore: boolean;
  isCompatible: boolean;
  checksumValid: boolean;
  tenantMatch: boolean;
  schemaSupported: boolean;
  targetTenantId: string;
  backupTenantId: string;
  totalDocumentsInBackup: number;
  collectionsSummary: Record<string, CollectionAuditItem>;
  errors: string[];
  warnings: string[];
  financialChecksPassed: boolean;
  missingForeignKeys: string[];
  timestamp: string;
}

export interface RestoreExecutionOptions {
  tenantId: string;
  branchId?: string;
  mode: 'merge' | 'module';
  selectedModules?: string[];
  confirmedBy: string;
  confirmationPhrase: string; // Must match 'استعادة' or 'RESTORE'
  safetyBackupId?: string;
}

export interface RestoreJobRecord {
  id: string;
  tenantId: string;
  backupId: string;
  status: 'started' | 'completed' | 'failed' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  startedBy: string;
  mode: 'merge' | 'module';
  collectionsRestored: string[];
  documentsRestoredCount: number;
  batchesCount: number;
  safetyBackupId?: string;
  error?: string;
}

export interface DisasterRecoveryStatus {
  lastBackupAt: string | null;
  lastBackupAgeHours: number | null;
  lastVerifiedAt: string | null;
  lastRestoreTestAt: string | null;
  totalBackupsCount: number;
  healthStatus: HealthStatus;
  healthMessage: string;
}
