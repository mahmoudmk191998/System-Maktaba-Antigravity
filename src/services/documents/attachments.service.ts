/**
 * Unified Attachments & Document Management Service
 * Manages tenant-isolated supporting documents with strict MIME validation,
 * size checks, and audit-safe soft-deletion.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import {
  Attachment,
  AttachmentEntityType,
  ALLOWED_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
} from '@/types/attachment.types';

export { ALLOWED_MIME_TYPES, MAX_ATTACHMENT_SIZE_BYTES };

export interface RegisterAttachmentInput {
  tenantId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageUrl: string;
  storagePath: string;
  category?: string;
  notes?: string;
  checksum?: string;
  user: { uid: string; name: string };
}

/**
 * Validate attachment MIME type and file size limits
 */
export function validateAttachmentFile(fileName: string, fileSize: number, mimeType: string): {
  isValid: boolean;
  error?: string;
} {
  if (fileSize > MAX_ATTACHMENT_SIZE_BYTES) {
    return { isValid: false, error: 'حجم الملف يتجاوز الحد الأقصى المسموح به (10 ميجابايت)' };
  }

  // Check executable extension protection
  const lowerName = fileName.toLowerCase();
  if (
    lowerName.endsWith('.exe') ||
    lowerName.endsWith('.bat') ||
    lowerName.endsWith('.cmd') ||
    lowerName.endsWith('.sh') ||
    lowerName.endsWith('.js')
  ) {
    return { isValid: false, error: 'نوع الملف غير آمن ولا يُسمح بتحميل الملفات التنفيذية أو البرمجية' };
  }

  if (!ALLOWED_MIME_TYPES.includes(mimeType) && !lowerName.endsWith('.pdf') && !lowerName.endsWith('.csv') && !lowerName.endsWith('.xlsx')) {
    return { isValid: false, error: 'صيغة الملف غير مدعومة. الصيغ المسموحة: PDF, صور (PNG/JPG/WEBP), و Excel/CSV' };
  }

  return { isValid: true };
}

/**
 * Register a new attachment metadata record
 */
export async function registerAttachment(input: RegisterAttachmentInput): Promise<Attachment> {
  const {
    tenantId,
    entityType,
    entityId,
    fileName,
    fileSize,
    mimeType,
    storageUrl,
    storagePath,
    category = 'supporting_document',
    notes,
    checksum,
    user,
  } = input;

  const validation = validateAttachmentFile(fileName, fileSize, mimeType);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const docRef = doc(collection(db, 'attachments'));
  const now = new Date().toISOString();

  const record: Attachment = {
    id: docRef.id,
    tenantId,
    entityType,
    entityId,
    fileName,
    fileSize,
    mimeType,
    storageUrl,
    storagePath,
    category,
    notes,
    checksum,
    uploadedBy: user.uid,
    uploadedByName: user.name,
    uploadedAt: now,
    isArchived: false,
  };

  await setDoc(docRef, record);
  return record;
}

/**
 * Fetch all active attachments for a specific entity
 */
export async function fetchEntityAttachments(
  tenantId: string,
  entityType: AttachmentEntityType,
  entityId: string
): Promise<Attachment[]> {
  const ref = collection(db, 'attachments');
  const q = query(
    ref,
    where('tenantId', '==', tenantId),
    where('entityType', '==', entityType),
    where('entityId', '==', entityId)
  );

  const snap = await getDocs(q);
  const items: Attachment[] = [];
  snap.forEach((d) => {
    const data = d.data() as Attachment;
    if (!data.isArchived) {
      items.push({ id: d.id, ...data });
    }
  });

  return items.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

/**
 * Soft delete (archive) attachment to preserve audit trail
 */
export async function archiveAttachment(
  tenantId: string,
  attachmentId: string,
  user: { uid: string; name: string }
): Promise<boolean> {
  const ref = doc(db, 'attachments', attachmentId);
  const snap = await getDoc(ref);

  if (!snap.exists()) throw new Error('المرفق المطلوب غير موجود');
  const data = snap.data() as Attachment;
  if (data.tenantId !== tenantId) throw new Error('لا توجد صلاحية للوصول إلى هذا المرفق');

  await updateDoc(ref, {
    isArchived: true,
    archivedAt: new Date().toISOString(),
    archivedBy: user.uid,
  });

  return true;
}
