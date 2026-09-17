// =========================================================================
// Enterprise Library Management System (Alwan Maktaba System)
// Canonical TypeScript Domain Models & Schemas
// All models strictly adhere to camelCase naming conventions
// =========================================================================

export type BookStatus = 'active' | 'archived' | 'out_of_print';
export type BookCopyCondition = 'new' | 'good' | 'fair' | 'poor' | 'damaged';
export type BookCopyStatus =
  | 'available'
  | 'on_loan'
  | 'reserved'
  | 'lost'
  | 'damaged'
  | 'maintenance'
  | 'processing'
  | 'withdrawn';

export type MemberStatus = 'active' | 'suspended' | 'expired' | 'blocked';
export type LoanStatus = 'active' | 'partially_returned' | 'returned' | 'overdue' | 'lost' | 'cancelled';
export type LoanItemStatus = 'active' | 'returned' | 'overdue' | 'lost' | 'damaged';
export type HoldStatus = 'waiting' | 'ready' | 'fulfilled' | 'expired' | 'cancelled';
export type FineType = 'overdue' | 'lost_book' | 'damaged_book' | 'manual' | 'other';
export type FineStatus = 'unpaid' | 'partially_paid' | 'paid' | 'waived';
export type PaymentMethod = 'cash' | 'card' | 'bank_transfer' | 'electronic';

export type AcquisitionStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'ordered'
  | 'partially_received'
  | 'received'
  | 'cancelled';

export type MovementType =
  | 'acquired'
  | 'transferred'
  | 'loaned'
  | 'returned'
  | 'reserved'
  | 'shelf_changed'
  | 'lost'
  | 'found'
  | 'damaged'
  | 'repaired'
  | 'withdrawn';

export type TransferStatus = 'requested' | 'approved' | 'in_transit' | 'received' | 'cancelled';
export type InventorySessionStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';
export type InventoryScanStatus = 'found' | 'missing' | 'unexpected' | 'wrong_shelf' | 'loaned' | 'damaged';
export type LostDamagedResolution = 'repaired' | 'replaced' | 'paid' | 'waived' | 'withdrawn';

// -------------------------------------------------------------------------
// 1. Catalog & Classification Entities
// -------------------------------------------------------------------------

export interface Author {
  id: string;
  tenantId: string;
  name: string;
  normalizedName: string;
  biography?: string;
  nationality?: string;
  birthDate?: string;
  deathDate?: string;
  photoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Publisher {
  id: string;
  tenantId: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  website?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BookCategory {
  id: string;
  tenantId: string;
  name: string;
  nameEn?: string;
  parentId?: string | null;
  description?: string;
  icon?: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Shelf {
  id: string;
  tenantId: string;
  branchId: string;
  code: string;
  name: string;
  floor?: string;
  section?: string;
  aisle?: string;
  description?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Book {
  id: string;
  tenantId: string;
  title: string;
  subtitle?: string;
  description?: string;
  isbn10?: string;
  isbn13?: string;
  authorIds: string[];
  authors?: string[]; // Cached display names for fast rendering
  publisherId?: string;
  publisherName?: string; // Cached display name
  publicationYear?: number;
  publicationDate?: string;
  edition?: string;
  language: string;
  pageCount?: number;
  categoryIds: string[];
  categoryNames?: string[];
  keywords?: string[];
  coverUrl?: string;
  deweyDecimal?: string;
  callNumber?: string;
  defaultShelfId?: string;
  tags?: string[];
  status: BookStatus;
  
  // Special collection & policy flags
  isReferenceOnly?: boolean;
  isShortLoan?: boolean;
  loanPeriodOverrideDays?: number;
  
  // Cached aggregate counters (always kept strictly in sync via copy transactions)
  totalCopiesCount?: number;
  availableCopiesCount?: number;
  
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface BookCopy {
  id: string;
  tenantId: string;
  bookId: string;
  branchId: string;
  barcode: string;
  accessionNumber: string;
  shelfId?: string;
  shelfLocation?: string; // e.g. "Floor 2 > Section B > Shelf 12"
  acquisitionDate: string;
  purchasePrice: number;
  supplierId?: string;
  condition: BookCopyCondition;
  status: BookCopyStatus;
  notes?: string;
  currentLoanId?: string | null;
  reservedForMemberId?: string | null;
  lastInventoryCheckAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// -------------------------------------------------------------------------
// 2. Members & Membership Plans
// -------------------------------------------------------------------------

export interface MembershipPlan {
  id: string;
  tenantId: string;
  name: string;
  nameEn?: string;
  maxBooks: number;
  loanDurationDays: number;
  maxRenewals: number;
  reservationLimit: number;
  finePerDay: number;
  gracePeriodDays: number;
  maxFineAmount: number;
  membershipFee: number;
  durationMonths: number;
  active: boolean;
  allowSpecialCollections?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Member {
  id: string;
  tenantId: string;
  memberNumber: string;
  barcode: string;
  qrCode?: string;
  fullName: string;
  phone: string;
  email?: string;
  nationalId?: string;
  address?: string;
  membershipPlanId: string;
  membershipPlanName?: string;
  joinDate: string;
  expiryDate: string;
  status: MemberStatus;
  maxBooksAllowed: number;
  notes?: string;
  photoUrl?: string;
  outstandingFine: number;
  currentLoansCount: number;
  createdAt: string;
  updatedAt: string;
}

// -------------------------------------------------------------------------
// 3. Circulation: Loans, Items, and Renewals
// -------------------------------------------------------------------------

export interface Loan {
  id: string;
  tenantId: string;
  branchId: string;
  loanNumber: string;
  memberId: string;
  memberName?: string;
  memberBarcode?: string;
  employeeId: string;
  employeeName?: string;
  checkoutDate: string;
  dueDate: string;
  returnedAt?: string | null;
  status: LoanStatus;
  totalFine: number;
  itemsCount: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoanItem {
  id: string;
  tenantId: string;
  loanId: string;
  bookId: string;
  bookTitle: string;
  bookCopyId: string;
  copyBarcode: string;
  copyAccessionNumber: string;
  checkoutDate: string;
  dueDate: string;
  returnDate?: string | null;
  renewalCount: number;
  fineAmount: number;
  status: LoanItemStatus;
  conditionOnCheckout: BookCopyCondition;
  conditionOnReturn?: BookCopyCondition | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoanRenewal {
  id: string;
  tenantId: string;
  loanId: string;
  loanItemId: string;
  bookCopyId: string;
  memberId: string;
  employeeId: string;
  oldDueDate: string;
  newDueDate: string;
  renewedAt: string;
  notes?: string;
}

// -------------------------------------------------------------------------
// 4. Holds & Reservations Subsystem
// -------------------------------------------------------------------------

export interface Hold {
  id: string;
  tenantId: string;
  branchId: string;
  memberId: string;
  memberName?: string;
  bookId: string;
  bookTitle?: string;
  requestedAt: string;
  expiresAt: string;
  queuePosition: number;
  status: HoldStatus;
  fulfilledCopyId?: string | null;
  notifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// -------------------------------------------------------------------------
// 5. Fines & Fine Settlements
// -------------------------------------------------------------------------

export interface Fine {
  id: string;
  tenantId: string;
  memberId: string;
  memberName?: string;
  loanId?: string | null;
  loanItemId?: string | null;
  bookCopyId?: string | null;
  fineType: FineType;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  reason: string;
  status: FineStatus;
  waivedBy?: string | null;
  waivedReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinePayment {
  id: string;
  tenantId: string;
  fineId: string;
  memberId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  employeeId: string;
  employeeName?: string;
  branchId: string;
  receiptNumber: string;
  notes?: string;
  createdAt: string;
}

// -------------------------------------------------------------------------
// 6. Acquisitions & Supplier Management
// -------------------------------------------------------------------------

export interface AcquisitionOrder {
  id: string;
  tenantId: string;
  branchId: string;
  orderNumber: string;
  supplierId: string;
  supplierName?: string;
  status: AcquisitionStatus;
  orderDate: string;
  expectedDate?: string;
  receivedDate?: string;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  notes?: string;
  createdBy: string;
  itemsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AcquisitionItem {
  id: string;
  tenantId: string;
  orderId: string;
  bookId?: string | null;
  title: string;
  author?: string;
  isbn?: string;
  quantity: number;
  receivedQuantity: number;
  unitPrice: number;
  totalPrice: number;
}

// -------------------------------------------------------------------------
// 7. Inventory Audit, Movements & Transfers
// -------------------------------------------------------------------------

export interface BookMovement {
  id: string;
  tenantId: string;
  branchId: string;
  bookCopyId: string;
  bookId: string;
  movementType: MovementType;
  beforeStatus: BookCopyStatus;
  afterStatus: BookCopyStatus;
  beforeShelfId?: string;
  afterShelfId?: string;
  beforeBranchId?: string;
  afterBranchId?: string;
  performedBy: string;
  memberId?: string;
  loanId?: string;
  notes?: string;
  timestamp: string;
}

export interface BookTransfer {
  id: string;
  tenantId: string;
  transferNumber: string;
  fromBranchId: string;
  fromBranchName?: string;
  toBranchId: string;
  toBranchName?: string;
  bookCopyIds: string[];
  requestedBy: string;
  approvedBy?: string;
  receivedBy?: string;
  status: TransferStatus;
  requestedAt: string;
  shippedAt?: string;
  receivedAt?: string;
  notes?: string;
}

export interface InventorySession {
  id: string;
  tenantId: string;
  branchId: string;
  sessionNumber: string;
  name: string;
  status: InventorySessionStatus;
  startedAt: string;
  completedAt?: string;
  conductedBy: string;
  totalCopiesExpected: number;
  totalCopiesScanned: number;
  foundCount: number;
  missingCount: number;
  unexpectedCount: number;
  wrongShelfCount: number;
  notes?: string;
}

export interface InventoryAuditItem {
  id: string;
  tenantId: string;
  sessionId: string;
  bookCopyId?: string;
  barcode: string;
  expectedShelfId?: string;
  scannedShelfId?: string;
  status: InventoryScanStatus;
  scannedAt: string;
  scannedBy: string;
}

export interface LostDamagedRecord {
  id: string;
  tenantId: string;
  branchId: string;
  bookCopyId: string;
  bookId: string;
  bookTitle?: string;
  copyBarcode?: string;
  memberId?: string;
  memberName?: string;
  loanId?: string;
  type: 'lost' | 'damaged';
  description: string;
  chargeAmount: number;
  employeeId: string;
  resolution: LostDamagedResolution;
  resolvedAt?: string;
  createdAt: string;
}
