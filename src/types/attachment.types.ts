/**
 * Unified Document & Attachment Types (Phase 11)
 * Provides unified schema for supporting files across POs, GRNs,
 * Supplier Invoices, Expenses, Customers, Employees, and Journal Entries.
 */

export type AttachmentEntityType =
  | 'purchase_order'
  | 'goods_receipt'
  | 'supplier_invoice'
  | 'expense'
  | 'sale'
  | 'customer'
  | 'employee'
  | 'journal_entry'
  | 'bank_statement';

export interface Attachment {
  id: string;
  tenantId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  fileName: string;
  fileSize: number; // in bytes
  mimeType: string;
  storageUrl: string;
  storagePath: string;
  category?: string;
  notes?: string;
  checksum?: string;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
  isArchived: boolean;
  archivedAt?: string;
  archivedBy?: string;
}

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
];

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
