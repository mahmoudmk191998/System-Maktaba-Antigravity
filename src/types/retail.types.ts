/**
 * Production-Grade Retail Bookstore & Stationery Domain Types
 * Covers: Products, Variants, Attributes, Categories, Brands, Units, Inventory,
 * Stock Movements, Sales/Invoices, Customers, Suppliers, Purchasing,
 * Branch Transfers, Inventory Counts, Damage/Loss, and Pricing Engine.
 */

// ============================================================================
// 1. PRODUCT CATALOG & VARIANT DEFINITIONS
// ============================================================================

export type ProductType = 
  | 'book'
  | 'stationery'
  | 'notebook'
  | 'pen'
  | 'art_supply'
  | 'paper'
  | 'office_supply'
  | 'school_supply'
  | 'gift_packaging'
  | 'printer_ink'
  | 'calculator'
  | 'general';

export interface BookMetadata {
  isbn?: string;
  isbn10?: string;
  isbn13?: string;
  author?: string;
  publisher?: string;
  publicationYear?: number;
  edition?: string;
  language?: string;
  pages?: number;
  subject?: string;
  grade?: string;        // e.g. "الصف الثالث الإعدادي"
  term?: string;         // e.g. "الترم الأول"
  curriculum?: string;   // e.g. "عام", "لغات", "أزهري"
  bookType?: 'textbook' | 'external_book' | 'novel' | 'reference' | 'story' | 'general';
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  barcode: string;
  name: string;
  attributes: Record<string, string>; // e.g. { color: 'Blue', size: 'A4', pages: '100' }
  purchasePrice?: number;   // Override parent purchase price
  sellingPrice?: number;    // Override parent selling price
  wholesalePrice?: number;  // Override parent wholesale price
  trackInventory: boolean;
  active: boolean;
  imageUrl?: string;
}

export interface VariantAttributeDefinition {
  id: string;
  tenantId: string;
  name: string;       // e.g. "color", "size", "pages"
  nameAr: string;     // e.g. "اللون", "المقاس", "عدد الصفحات"
  values: string[];   // e.g. ["Blue", "Black", "Red"] or ["A4", "A5"]
  active: boolean;
}

export interface Product {
  id: string;
  tenantId: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  description?: string;
  sku: string;
  barcode?: string;
  categoryId: string;
  subcategoryId?: string;
  brandId?: string;
  supplierIds?: string[];
  productType: ProductType;
  unitId: string;
  purchasePrice: number;
  averageCost: number;
  sellingPrice: number;
  wholesalePrice?: number;
  minimumSellingPrice?: number;
  taxRate?: number;
  imageUrl?: string;
  images?: string[];
  hasVariants?: boolean;
  variants?: ProductVariant[];
  bookMetadata?: BookMetadata;
  trackInventory: boolean;
  allowNegativeStock: boolean;
  minimumStock: number;
  maximumStock?: number;
  reorderPoint: number;
  quantity?: number;
  isLowStock?: boolean;
  stockStatus?: 'normal' | 'low' | 'out';
  active: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

// ============================================================================
// 2. CATEGORIES, BRANDS & UNITS OF MEASUREMENT
// ============================================================================

export interface ProductCategory {
  id: string;
  tenantId: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  parentId?: string | null;
  description?: string;
  image?: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Brand {
  id: string;
  tenantId: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  logo?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Unit {
  id: string;
  tenantId: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  code: string;               // e.g. "PCS", "BOX", "CTN", "REAM"
  baseUnitId?: string | null; // null if this is base unit
  conversionFactor: number;   // How many base units in this unit (e.g. 1 Box = 50 Pieces -> factor: 50)
  isBaseUnit: boolean;
  allowFraction?: boolean;    // false for discrete items like pens; true for weight/length
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ============================================================================
// 3. INVENTORY LOCATIONS, STOCK & MOVEMENTS
// ============================================================================

export type InventoryLocationType = 'branch' | 'warehouse' | 'main_warehouse' | 'storage_room';

export interface InventoryLocation {
  id: string;
  tenantId: string;
  name: string;
  nameAr?: string;
  type: InventoryLocationType;
  isCentralWarehouse?: boolean;
  active: boolean;
  address?: string;
  phone?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type StockMovementType =
  | 'opening_balance'
  | 'purchase_receive'
  | 'sale'
  | 'sale_return'
  | 'purchase_return'
  | 'transfer_out'
  | 'transfer_in'
  | 'stock_adjustment_in'
  | 'stock_adjustment_out'
  | 'inventory_count_adjustment'
  | 'damage'
  | 'loss'
  | 'recovery'
  | 'manual_correction'
  // Backward compatibility aliases
  | 'purchase'
  | 'adjustment'
  | 'inventory_count'
  | 'manual';

export interface BranchStockRecord {
  id: string;
  tenantId: string;
  branchId: string;           // Backward compatible alias for locationId
  locationId?: string;        // Dedicated inventory location ID
  productId: string;
  variantId?: string | null;  // 'base' or variantId
  baseUnitId?: string;
  quantity: number;           // on-hand in base units
  onHandQuantity?: number;    // on-hand in base units
  reservedQuantity?: number;  // held for pending orders
  availableQuantity?: number; // onHand - reserved
  unitCost: number;           // Weighted average cost (WAC)
  averageCost?: number;       // Weighted average cost (WAC)
  minimumStock?: number;
  reorderPoint?: number;
  isLowStock?: boolean;
  stockStatus?: 'normal' | 'low' | 'out';
  lastStocktakeAt?: string;
  lastMovementAt?: string;
  updatedAt: string;
}

export type StockBalance = BranchStockRecord;

export interface StockMovement {
  id: string;
  tenantId: string;
  branchId: string;           // Backward compatible alias for locationId
  locationId?: string;        // Dedicated inventory location ID
  productId: string;
  variantId?: string | null;
  movementType: StockMovementType;
  direction?: 'in' | 'out';
  quantity: number;           // Can be positive or negative
  inputQuantity?: number;     // Original entered quantity (e.g. 2 boxes)
  inputUnitId?: string;       // Unit ID used for entry
  conversionFactor?: number;  // Factor at time of movement (e.g. 50)
  baseQuantity: number;       // Standardized quantity in base units
  beforeQuantity: number;     // Balance before movement
  afterQuantity: number;      // Balance after movement
  unitCost: number;           // Unit cost applied to movement
  totalCost?: number;         // unitCost * baseQuantity
  referenceType?: 'sale' | 'purchase' | 'transfer' | 'inventory_count' | 'damage_loss' | 'opening_balance' | 'manual';
  referenceId?: string;
  idempotencyKey?: string;
  employeeId?: string;
  reason?: string;
  notes?: string;
  createdAt: string;
  createdBy?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// 4. SALES, POS & INVOICES
// ============================================================================

export type SaleStatus = 'draft' | 'completed' | 'cancelled' | 'refunded' | 'partially_refunded' | 'on_hold';
export type PaymentStatus = 'paid' | 'partial' | 'pending' | 'credit';
export type SaleType = 'retail' | 'wholesale';
export type PaymentMethodType = 
  | 'cash' 
  | 'card' 
  | 'visa' 
  | 'mastercard' 
  | 'meeza' 
  | 'instapay' 
  | 'vodafone_cash' 
  | 'wallet' 
  | 'credit' 
  | 'other';

export interface PaymentEntry {
  method: PaymentMethodType;
  amount: number;
  referenceNumber?: string;
  notes?: string;
}

export interface SalePaymentRecord {
  id: string;
  saleId: string;
  tenantId: string;
  branchId: string;
  method: PaymentMethodType;
  amount: number;
  reference?: string;
  paidAt: string;
  cashierId: string;
  status: 'success' | 'refunded' | 'voided';
}

export interface SaleItem {
  id: string;
  saleId?: string;
  productId: string;
  variantId?: string | null;
  productNameSnapshot: string;
  variantNameSnapshot?: string | null;
  skuSnapshot: string;
  barcodeSnapshot?: string;
  categorySnapshot?: string;
  brandSnapshot?: string;
  quantity: number;           // Input quantity entered in inputUnit
  inputUnitId?: string;       // Entered unit id
  unitId?: string;            // Backward compatible alias
  conversionFactor: number;   // e.g. 50 pieces per box
  baseQuantity: number;       // quantity * conversionFactor
  unitSellingPrice: number;   // Unit selling price per input unit
  sellingPrice: number;       // Backward compatible alias
  originalUnitPrice: number;  // Price before discounts
  originalPrice: number;      // Backward compatible alias
  discountAmount: number;     // Line discount amount
  discount: number;           // Backward compatible alias
  taxAmount: number;          // Line tax amount
  tax: number;                // Backward compatible alias
  lineTotal: number;          // Final line total payable
  unitCostSnapshot: number;   // Captured cost per base unit at sale time
  costPriceSnapshot: number;  // Backward compatible alias
  totalCost: number;          // unitCostSnapshot * baseQuantity
  grossProfit: number;        // lineTotal - totalCost
  priceSource?: string;       // e.g. 'retail', 'wholesale', 'price_list', 'contract', 'quantity_tier', 'promotion', 'manual_override'
  priceListId?: string | null;
  pricingRuleId?: string | null;
  resolvedPrice?: number;
}

export interface Sale {
  id: string;
  tenantId: string;
  branchId: string;
  locationId?: string;        // Dedicated inventory location ID
  invoiceNumber: string;      // Atomic sequence: INV-CAI01-2026-000001
  customerId?: string | null;
  customerNameSnapshot?: string;
  customerPhoneSnapshot?: string;
  cashierId: string;
  cashierNameSnapshot?: string;
  shiftId?: string | null;
  status: SaleStatus;
  saleStatus?: SaleStatus;    // Backward compatible alias
  saleType: SaleType;
  items: SaleItem[];
  subtotal: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  cartDiscountAmount?: number;
  discountTotal: number;
  discount: number;           // Backward compatible alias
  serviceChargeRate?: number;
  serviceChargeTotal?: number;
  serviceCharge?: number;
  taxTotal: number;
  tax: number;                // Backward compatible alias
  taxIncluded?: boolean;
  serviceChargeIncluded?: boolean;
  total: number;
  costTotal: number;
  grossProfit: number;
  paidAmount: number;
  changeAmount: number;
  remainingAmount?: number;
  paymentStatus: PaymentStatus;
  paymentMethods: PaymentEntry[];
  payments?: SalePaymentRecord[];
  priceTierUsed?: 'retail' | 'wholesale';
  notes?: string;
  isCreditSale?: boolean;
  returnedAmount?: number;
  refundedAmount?: number;
  returnStatus?: 'none' | 'partial' | 'full';
  hasExchange?: boolean;
  exchangeInvoiceNumber?: string;
  isExchangeReplacement?: boolean;
  exchangeOriginInvoice?: string;
  idempotencyKey?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface HeldSale {
  id: string;
  tenantId: string;
  branchId: string;
  cashierId: string;
  customerSnapshot?: any;
  items: SaleItem[];
  subtotal: number;
  discount: number;
  serviceCharge?: number;
  tax: number;
  total: number;
  heldAt: string;
  notes?: string;
}

// ============================================================================
// 5. SALES RETURNS & EXCHANGES
// ============================================================================

export type SaleReturnCondition = 'resellable' | 'opened' | 'damaged' | 'defective' | 'incomplete' | 'other';
export type SaleReturnStatus = 'completed' | 'draft' | 'cancelled';
export type SaleRefundStatus = 'completed' | 'pending' | 'credit_settled';

export interface SaleReturnItem {
  id?: string;
  returnId?: string;
  saleItemId: string;
  productId: string;
  variantId?: string | null;
  productNameSnapshot: string;
  skuSnapshot: string;
  barcodeSnapshot?: string;
  quantity: number;           // Quantity in input unit being returned
  returnQuantity?: number;    // Compatibility alias
  inputUnitId: string;
  conversionFactor: number;
  baseQuantity: number;       // quantity * conversionFactor
  returnBaseQuantity?: number;// Compatibility alias
  unitSellingPrice: number;   // Original selling price per input unit
  originalSellingPrice?: number;
  originalUnitPrice?: number;
  discountReversed: number;   // Proportional historical discount reversed
  taxReversed: number;        // Proportional historical tax reversed
  refundLineAmount: number;   // Net amount refunded to customer for this line
  lineTotal?: number;         // Compatibility alias
  unitCostSnapshot: number;   // Original WAC cost snapshot at sale time
  costReversed: number;       // unitCostSnapshot * baseQuantity
  profitReversed: number;     // refundLineAmount - costReversed
  condition: SaleReturnCondition;
  restock: boolean;           // True: restock to inventory, False: route to damage/loss
  restockToInventory?: boolean;// Compatibility alias
  reason: string;
  stockMovementId?: string;
  damageRecordId?: string;
}

export interface SaleReturn {
  id: string;
  tenantId: string;
  branchId: string;
  locationId?: string;
  returnNumber: string;       // Atomic sequence: RET-CAI01-2026-000001
  saleId: string;
  originalSaleId?: string;    // Compatibility alias
  invoiceNumberSnapshot: string;
  originalInvoiceNumber?: string; // Compatibility alias
  customerId?: string | null;
  customerNameSnapshot?: string;
  cashierId: string;
  processedBy: string;
  items: SaleReturnItem[];
  status: SaleReturnStatus;
  subtotalReturned: number;
  discountReversed: number;
  taxReversed: number;
  refundAmount: number;
  totalRefundAmount?: number; // Compatibility alias
  costReversed: number;
  profitReversed: number;
  refundMethod: PaymentMethodType;
  refundStatus: SaleRefundStatus;
  reason?: string;
  notes?: string;
  isExchange?: boolean;
  exchangeId?: string;
  replacementSaleId?: string;
  replacementInvoiceNumber?: string;
  difference?: number;
  settlementType?: string;
  exchangeNewItemsCount?: number;
  idempotencyKey?: string;
  createdAt: string;
  completedAt?: string;
}

export interface SaleRefundRecord {
  id: string;
  tenantId: string;
  branchId: string;
  saleId: string;
  returnId: string;
  method: PaymentMethodType;
  amount: number;
  reference?: string;
  status: 'completed' | 'pending' | 'failed' | 'cancelled';
  processedBy: string;
  createdAt: string;
}

export interface SaleExchange {
  id: string;
  tenantId: string;
  branchId: string;
  originalSaleId: string;
  returnId: string;
  newSaleId: string;
  returnNumber: string;
  newInvoiceNumber: string;
  oldItemsValue: number;      // Value of items returned
  newItemsValue: number;      // Value of new items purchased
  difference: number;         // newItemsValue - oldItemsValue
  settlementType: 'customer_pays' | 'customer_refunded' | 'even_exchange';
  settlementMethod?: PaymentMethodType;
  processedBy: string;
  createdAt: string;
}

// ============================================================================
// 6. CUSTOMERS & CREDIT ACCOUNTS
// ============================================================================
// 6. CUSTOMERS, RECEIVABLES & WHOLESALE PRICING (PHASE 8)
// ============================================================================

export type CustomerType =
  | 'retail'
  | 'wholesale'
  | 'company'
  | 'school'
  | 'teacher'
  | 'corporate'
  | 'government'
  | 'other';

export type CustomerCreditStatus = 'normal' | 'on_hold' | 'blocked';

export interface Customer {
  id: string;
  tenantId: string;
  customerCode: string; // e.g. CUS-000001
  name: string;
  companyName?: string;
  customerType: CustomerType;
  phone: string;
  phone2?: string;
  email?: string;
  address?: string;
  city?: string;
  taxNumber?: string;
  commercialRegistration?: string;
  contactPerson?: string;
  creditEnabled: boolean;
  creditLimit: number;
  creditStatus: CustomerCreditStatus;
  paymentTermsDays: number;
  currentBalance: number; // Derived/cached: Positive = Customer owes store (Receivable), Negative = Customer Credit in store
  balance?: number; // Backward compatibility alias for currentBalance
  openingBalance?: number;
  defaultPriceListId?: string | null;
  preferredPaymentMethod?: PaymentMethodType | string;
  totalPurchases: number;
  lastPurchaseAt?: string;
  notes?: string;
  active: boolean;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export type CustomerLedgerEntryType =
  | 'opening_balance'
  | 'credit_sale'
  | 'payment'
  | 'payment_reversal'
  | 'sale_return'
  | 'refund_adjustment'
  | 'customer_advance'
  | 'advance_applied'
  | 'credit_note'
  | 'debit_note'
  | 'manual_adjustment'
  | 'write_off';

export interface CustomerLedgerEntry {
  id: string;
  tenantId: string;
  customerId: string;
  customerNameSnapshot?: string;
  type: CustomerLedgerEntryType;
  transactionType?: string; // Backward compatibility alias
  referenceType: 'sale' | 'payment' | 'sale_return' | 'manual' | 'opening_balance';
  referenceId: string;
  referenceNumber?: string;
  debit: number;  // Increases customer liability to store
  credit: number; // Decreases customer liability or adds credit
  amount?: number; // Backward compatibility alias
  balanceBefore?: number;
  balanceAfter: number;
  dueDate?: string;
  branchId?: string;
  notes?: string;
  idempotencyKey?: string;
  createdAt: string;
  createdBy: string;
}

export type CustomerReceivableStatus = 'open' | 'partially_paid' | 'paid' | 'overdue' | 'settled';

export interface CustomerReceivable {
  id: string;
  tenantId: string;
  customerId: string;
  customerNameSnapshot: string;
  saleId: string;
  invoiceNumber: string;
  branchId: string;
  issueDate: string;
  dueDate: string;
  originalAmount: number;
  paidAmount: number;
  returnsCreditAmount: number;
  remainingAmount: number;
  status: CustomerReceivableStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerPayment {
  id: string;
  tenantId: string;
  customerId: string;
  customerNameSnapshot?: string;
  paymentNumber: string; // e.g. CP-HQ-2026-000001
  branchId?: string;
  amount: number;
  paymentMethod: PaymentMethodType | string;
  paymentDestination: 'cash_register' | 'bank' | 'treasury' | 'other';
  paymentDate: string;
  referenceNumber?: string;
  allocationMode: 'oldest_due_first' | 'manual';
  unallocatedCredit: number;
  shiftId?: string | null;
  processedBy: string;
  notes?: string;
  idempotencyKey: string;
  isReversed?: boolean;
  reversalReason?: string;
  reversedAt?: string;
  reversedBy?: string;
  createdAt: string;
}

export interface CustomerPaymentAllocation {
  id: string;
  tenantId: string;
  paymentId: string;
  customerId: string;
  receivableId: string;
  saleId: string;
  invoiceNumber: string;
  allocatedAmount: number;
  createdAt: string;
}

export interface PriceList {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  customerType?: CustomerType;
  active: boolean;
  priority: number;
  validFrom?: string;
  validTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PriceListItem {
  id: string;
  priceListId: string;
  tenantId: string;
  productId: string;
  variantId?: string | null;
  productNameSnapshot?: string;
  skuSnapshot?: string;
  price: number;
  minimumQuantity?: number;
  active: boolean;
}

export interface CustomerProductPrice {
  id: string;
  tenantId: string;
  customerId: string;
  productId: string;
  variantId?: string | null;
  specialPrice: number;
  notes?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReceivablesAgingSummary {
  current: number;       // Not yet due
  days1to30: number;     // 1–30 days overdue
  days31to60: number;    // 31–60 days overdue
  days61to90: number;    // 61–90 days overdue
  days90Plus: number;    // >90 days overdue
  days90plus?: number;   // lowercase alias
  totalOutstanding: number;
  totalOverdue?: number;
  overdueCount: number;
  totalReceivablesCount: number;
}

// ============================================================================
// 7. SUPPLIERS & PURCHASING
// ============================================================================

export type SupplierType =
  | 'book_publisher'
  | 'book_distributor'
  | 'stationery_supplier'
  | 'school_supplies_supplier'
  | 'office_supplies_supplier'
  | 'general_supplier'
  | 'manufacturer'
  | 'other';

export interface Supplier {
  id: string;
  tenantId: string;
  supplierCode: string;
  name: string;
  companyName?: string;
  supplierType: SupplierType;
  phone: string;
  phone2?: string;
  email?: string;
  address?: string;
  city?: string;
  country?: string;
  taxNumber?: string;
  commercialRegistration?: string;
  contactPerson?: string;
  paymentTermsDays: number;
  creditLimit?: number;
  openingBalance: number;
  currentBalance: number; // Positive = We owe supplier
  preferredPaymentMethod?: PaymentMethodType | string;
  publisherId?: string | null;
  notes?: string;
  active: boolean;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  updatedBy?: string;
}

export interface SupplierProduct {
  id: string;
  tenantId: string;
  supplierId: string;
  productId: string;
  variantId?: string | null;
  supplierSku?: string;
  supplierBarcode?: string;
  lastPurchaseCost?: number;
  lastPurchaseDate?: string;
  minimumOrderQuantity?: number;
  leadTimeDays?: number;
  preferred?: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PurchaseOrderStatus = 
  | 'draft' 
  | 'submitted' 
  | 'approved' 
  | 'ordered' 
  | 'partially_received' 
  | 'received' 
  | 'cancelled';

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId?: string;
  productId: string;
  variantId?: string | null;
  productNameSnapshot: string;
  skuSnapshot: string;
  supplierSku?: string;
  orderedQuantity: number;
  orderedBaseQuantity: number;
  inputUnitId: string;
  conversionFactor: number;
  unitCost: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  receivedQuantity?: number;
  receivedBaseQuantity: number;
  returnedBaseQuantity?: number;
  notes?: string;
  // legacy compatibility aliases
  unitId?: string;
  discount?: number;
  tax?: number;
  total?: number;
}

export interface PurchaseOrder {
  id: string;
  tenantId: string;
  branchId?: string;
  destinationLocationId: string;
  purchaseOrderNumber: string; // PO-HQ-2026-000001
  orderNumber?: string;        // legacy compatibility alias
  supplierId: string;
  supplierNameSnapshot?: string;
  status: PurchaseOrderStatus;
  orderDate: string;
  expectedDeliveryDate?: string;
  paymentTermsDays?: number;
  supplierInvoiceNumber?: string;
  currency: string;
  items: PurchaseOrderItem[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingCost: number;
  otherCosts: number;
  grandTotal: number;
  totalAmount?: number;        // legacy compatibility alias
  paidAmount: number;
  paymentStatus: 'paid' | 'partial' | 'unpaid';
  notes?: string;
  createdBy: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  orderedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  updatedAt: string;
  discount?: number;
  tax?: number;
}

export interface GoodsReceiptItem {
  id?: string;
  purchaseOrderItemId: string;
  productId: string;
  variantId?: string | null;
  productNameSnapshot: string;
  skuSnapshot: string;
  receivedQuantity: number;
  receivedBaseQuantity: number;
  acceptedQuantity: number;
  acceptedBaseQuantity: number;
  rejectedQuantity: number;
  rejectedBaseQuantity: number;
  rejectionReason?: string;
  inputUnitId: string;
  conversionFactor: number;
  unitPurchaseCost: number;
  allocatedExtraCost: number;
  effectiveUnitCost: number;
  lineTotal: number;
  beforeStock?: number;
  afterStock?: number;
  previousWac?: number;
  newWac?: number;
  stockMovementId?: string;
  unitId?: string; // legacy alias
}

export interface GoodsReceipt {
  id: string;
  tenantId: string;
  branchId: string;
  destinationLocationId: string;
  receiptNumber: string; // GRN-HQ-2026-000001
  purchaseOrderId: string;
  purchaseOrderNumberSnapshot: string;
  supplierId: string;
  supplierNameSnapshot?: string;
  supplierInvoiceNumber?: string;
  supplierDeliveryNote?: string;
  status: 'completed' | 'cancelled';
  items: GoodsReceiptItem[];
  subtotal: number;
  taxTotal: number;
  extraCosts: number;
  grandTotal: number;
  receivedBy: string;
  receivedAt: string;
  notes?: string;
  idempotencyKey: string;
  createdAt: string;
}

export interface PurchaseReturnItem {
  id?: string;
  purchaseReceiptItemId?: string;
  productId: string;
  variantId?: string | null;
  productNameSnapshot: string;
  skuSnapshot: string;
  returnQuantity: number;
  returnBaseQuantity: number;
  inputUnitId: string;
  conversionFactor: number;
  originalEffectiveUnitCost: number;
  costValue: number;
  reason: string;
  stockMovementId?: string;
  unitCost?: number; // legacy alias
  quantity?: number; // legacy alias
}

export interface PurchaseReturn {
  id: string;
  tenantId: string;
  branchId: string;
  sourceLocationId: string;
  returnNumber: string; // PR-HQ-2026-000001
  supplierId: string;
  supplierNameSnapshot?: string;
  purchaseOrderId?: string;
  goodsReceiptId: string;
  goodsReceiptNumberSnapshot?: string;
  status: 'completed' | 'cancelled';
  items: PurchaseReturnItem[];
  subtotal: number;
  taxReversed: number;
  total: number;
  totalAmount?: number; // legacy alias
  reason: string;
  notes?: string;
  processedBy: string;
  approvedBy?: string | null;
  idempotencyKey: string;
  createdAt: string;
  completedAt?: string;
  createdBy?: string;   // legacy alias
}

export type SupplierLedgerEntryType =
  | 'opening_balance'
  | 'purchase_invoice'
  | 'payment'
  | 'purchase_return'
  | 'credit_note'
  | 'debit_note'
  | 'adjustment';

export interface SupplierLedgerEntry {
  id: string;
  tenantId: string;
  supplierId: string;
  type: SupplierLedgerEntryType;
  referenceType: 'goods_receipt' | 'purchase_order' | 'supplier_payment' | 'purchase_return' | 'manual';
  referenceId: string;
  referenceNumber?: string;
  debit: number;   // Decreases payable (e.g. Payments, Returns)
  credit: number;  // Increases payable (e.g. Purchases)
  balanceAfter?: number;
  currency: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
}

export interface SupplierPayment {
  id: string;
  tenantId: string;
  supplierId: string;
  branchId?: string;
  paymentNumber: string; // PAY-SUP-2026-000001
  amount: number;
  paymentMethod: PaymentMethodType | string;
  paymentSource: 'cash_register' | 'bank' | 'treasury' | 'other';
  referenceNumber?: string;
  paidAt: string;
  processedBy: string;
  notes?: string;
  idempotencyKey: string;
  createdAt: string;
}

// ============================================================================
// 8. BRANCH TRANSFERS & INVENTORY COUNT
// ============================================================================

export type TransferStatus = 'draft' | 'requested' | 'approved' | 'in_transit' | 'received' | 'cancelled';

export interface BranchTransferItem {
  productId: string;
  variantId?: string | null;
  productNameSnapshot?: string;
  skuSnapshot?: string;
  barcodeSnapshot?: string;
  unitId?: string;
  inputQuantity?: number;
  conversionFactor?: number;
  quantity: number;          // base quantity
  baseQuantity?: number;      // base quantity
  unitCostSnapshot: number;
  receivedQuantity?: number; // Supports partial receiving verification
}

export interface BranchTransfer {
  id: string;
  tenantId: string;
  fromBranchId: string;      // Alias for fromLocationId
  toBranchId: string;        // Alias for toLocationId
  fromLocationId?: string;
  toLocationId?: string;
  transferNumber: string;    // TRF-2026-000001
  status: TransferStatus;
  items: BranchTransferItem[];
  requestedBy: string;
  approvedBy?: string;
  sentBy?: string;
  receivedBy?: string;
  sentAt?: string;
  receivedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type InventoryCountStatus = 'draft' | 'in_progress' | 'review' | 'posted' | 'completed' | 'reconciled' | 'cancelled';

export interface InventoryCountItem {
  productId: string;
  variantId?: string | null;
  productNameSnapshot?: string;
  skuSnapshot?: string;
  barcodeSnapshot?: string;
  expectedQuantity: number;
  countedQuantity: number;
  difference: number;
  unitCostSnapshot: number;
  financialVariance?: number; // difference * unitCostSnapshot
  status?: 'matched' | 'shortage' | 'overage';
  notes?: string;
}

export interface InventoryCountSession {
  id: string;
  tenantId: string;
  branchId: string;          // Alias for locationId
  locationId?: string;
  sessionNumber: string;     // ST-2026-000001
  status: InventoryCountStatus;
  items: InventoryCountItem[];
  startedBy: string;
  startedAt?: string;
  reconciledBy?: string;
  reconciledAt?: string;
  postedBy?: string;
  postedAt?: string;
  totalDifferenceValue: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// 9. DAMAGE & LOSS RECORDS
// ============================================================================

export type DamageLossType = 'damaged' | 'lost' | 'expired' | 'broken' | 'other';

export interface DamageLossRecord {
  id: string;
  tenantId: string;
  branchId: string;
  productId: string;
  variantId?: string | null;
  productNameSnapshot?: string;
  quantity: number;
  unitCost: number;
  totalCostValue: number;
  reason: string;
  type: DamageLossType;
  employeeId: string;
  notes?: string;
  recoveredQuantity?: number;
  createdAt: string;
}

// ============================================================================
// 10. CASHIER REGISTER SHIFTS
// ============================================================================

export interface CashierShift {
  id: string;
  tenantId: string;
  branchId: string;
  cashierId: string;
  cashierNameSnapshot: string;
  status: 'open' | 'closed';
  openingCash: number;
  openedAt: string;
  closingCashExpected?: number;
  closingCashActual?: number;
  cashDifference?: number;
  totalSalesCash?: number;
  totalSalesCard?: number;
  totalSalesOther?: number;
  totalSalesCount?: number;
  totalDiscounts?: number;
  totalRefunds?: number;
  cashIn?: number;
  cashOut?: number;
  closedAt?: string;
  notes?: string;
}

// ============================================================================
// 11. PRICING & PROMOTIONS
// ============================================================================

export type PromotionType = 'percentage' | 'fixed' | 'buy_x_get_y';

export interface Promotion {
  id: string;
  tenantId: string;
  title: string;
  type: PromotionType;
  value: number;
  startDate: string;
  endDate: string;
  active: boolean;
  applicableBranchIds?: string[];
  applicableCategoryIds?: string[];
  applicableBrandIds?: string[];
  applicableProductIds?: string[];
  minCartValue?: number;
  buyQuantity?: number;
  getQuantity?: number;
  customerTypes?: CustomerType[];
}

export interface Coupon {
  id: string;
  tenantId: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  value: number;
  minPurchase?: number;
  maxDiscount?: number;
  startDate: string;
  endDate: string;
  usageLimit?: number;
  usedCount: number;
  active: boolean;
  branchIds?: string[];
}

// ============================================================================
// 12. DOUBLE-ENTRY GENERAL LEDGER & ADVANCED ACCOUNTING (PHASE 9)
// ============================================================================

export type AccountType =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'revenue'
  | 'expense'
  | 'cost_of_goods_sold'
  | 'contra_asset'
  | 'contra_revenue'
  | 'other';

export type NormalBalance = 'debit' | 'credit';

export interface ChartAccount {
  id: string;
  tenantId: string;
  accountCode: string;
  name: string;
  nameAr?: string;
  nameEn?: string;
  accountType: AccountType;
  parentId?: string | null;
  normalBalance: NormalBalance;
  level: number;
  allowPosting: boolean;
  systemAccount: boolean;
  systemMappingKey?: string | null;
  active: boolean;
  description?: string;
  currentBalance?: number;
  createdAt: string;
  updatedAt: string;
}

export type JournalEntryStatus = 'draft' | 'posted' | 'reversed' | 'voided';

export type JournalSourceType =
  | 'sale'
  | 'sale_return'
  | 'customer_payment'
  | 'customer_advance'
  | 'goods_receipt'
  | 'purchase_return'
  | 'supplier_payment'
  | 'expense'
  | 'payroll'
  | 'employee_advance'
  | 'inventory_adjustment'
  | 'damage_loss'
  | 'cash_transfer'
  | 'manual_journal'
  | 'opening_balance';

export interface JournalLine {
  id: string;
  journalEntryId?: string;
  accountId: string;
  accountCodeSnapshot: string;
  accountNameSnapshot: string;
  debit: number;
  credit: number;
  description?: string;
  branchId?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  employeeId?: string | null;
  productId?: string | null;
  createdAt?: string;
}

export interface JournalEntry {
  id: string;
  tenantId: string;
  journalNumber: string;
  date: string;
  postingDate: string;
  sourceType: JournalSourceType;
  sourceId: string;
  description: string;
  status: JournalEntryStatus;
  currency: string;
  exchangeRate?: number;
  totalDebit: number;
  totalCredit: number;
  branchId?: string | null;
  fiscalPeriodId?: string | null;
  createdBy: string;
  approvedBy?: string | null;
  postedAt?: string;
  reversedEntryId?: string | null;
  idempotencyKey?: string;
  lines: JournalLine[];
  postingRuleVersion?: number;
  createdAt: string;
  updatedAt: string;
}

export type PeriodStatus = 'open' | 'soft_closed' | 'closed';

export interface FiscalYear {
  id: string;
  tenantId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FiscalPeriod {
  id: string;
  tenantId: string;
  fiscalYearId: string;
  name: string; // e.g. "2026-01"
  periodNumber: number; // 1 - 12
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  closedAt?: string;
  closedBy?: string;
  reopenedAt?: string;
  reopenedBy?: string;
}

export interface AccountingSettings {
  tenantId: string;
  accountingEnabled: boolean;
  accountingGoLiveDate?: string;
  baseCurrency: string;
  fiscalYearStartMonth: number;
  postingMode: 'realtime' | 'outbox';
  defaultCashAccountId?: string;
  accountsReceivableAccountId?: string;
  accountsPayableAccountId?: string;
  inventoryAccountId?: string;
  cogsAccountId?: string;
  retailSalesRevenueAccountId?: string;
  wholesaleSalesRevenueAccountId?: string;
  salesReturnsAccountId?: string;
  purchaseReturnVarianceAccountId?: string;
  inventoryDamageExpenseAccountId?: string;
  inventoryGainAccountId?: string;
  salaryExpenseAccountId?: string;
  payrollPayableAccountId?: string;
  employeeAdvancesAccountId?: string;
  taxPayableAccountId?: string;
  taxReceivableAccountId?: string;
  customerAdvancesLiabilityAccountId?: string;
  retainedEarningsAccountId?: string;
  openingEquityAccountId?: string;
  roundingAccountId?: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface AccountingEvent {
  id: string;
  tenantId: string;
  sourceType: JournalSourceType;
  sourceId: string;
  eventType: string;
  eventVersion: number;
  payloadSnapshot: Record<string, any>;
  idempotencyKey: string;
  status: 'pending' | 'processed' | 'failed';
  attempts: number;
  journalEntryId?: string;
  error?: string;
  createdAt: string;
  processedAt?: string;
}

export interface OpeningBalanceMigration {
  id: string;
  tenantId: string;
  migrationDate: string;
  journalEntryId: string;
  inventorySnapshotValue: number;
  arSnapshotValue: number;
  apSnapshotValue: number;
  cashSnapshotValue: number;
  bankSnapshotValue: number;
  openingEquityValue: number;
  status: 'completed';
  migratedBy: string;
  createdAt: string;
}

export interface FinancialAccount {
  id: string;
  tenantId: string;
  name: string;
  type: 'cash_drawer' | 'treasury' | 'bank_account';
  glAccountId: string;
  branchId?: string | null;
  currency: string;
  bankName?: string;
  accountNumberMasked?: string;
  iban?: string;
  openingBalance: number;
  currentBalance: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

// Financial Statements & Reconciliation Data Types
export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  level: number;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
  closingNet: number;
}

export interface TrialBalanceReportData {
  rows: TrialBalanceRow[];
  totalOpeningDebit: number;
  totalOpeningCredit: number;
  totalPeriodDebit: number;
  totalPeriodCredit: number;
  totalClosingDebit: number;
  totalClosingCredit: number;
  isBalanced: boolean;
}

export interface ProfitLossStatementData {
  grossSalesRetail: number;
  grossSalesWholesale: number;
  totalGrossRevenue: number;
  salesReturnsAndDiscounts: number;
  netRevenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  grossMarginPercentage: number;
  operatingExpensesByCategory: Record<string, number>;
  totalOperatingExpenses: number;
  operatingProfit: number;
  otherIncomeAndExpenses: number;
  netIncome: number;
  periodStart: string;
  periodEnd: string;
}

export interface BalanceSheetData {
  currentAssets: {
    cashAndEquivalents: number;
    bankAccounts: number;
    accountsReceivable: number;
    inventoryValuation: number;
    otherCurrentAssets: number;
    totalCurrentAssets: number;
  };
  nonCurrentAssets: {
    fixedAssets: number;
    totalNonCurrentAssets: number;
  };
  totalAssets: number;

  currentLiabilities: {
    accountsPayable: number;
    customerAdvances: number;
    payrollLiabilities: number;
    taxPayable: number;
    otherCurrentLiabilities: number;
    totalCurrentLiabilities: number;
  };
  totalLiabilities: number;

  equity: {
    ownerCapital: number;
    retainedEarnings: number;
    currentPeriodNetIncome: number;
    totalEquity: number;
  };
  totalLiabilitiesAndEquity: number;
  variance: number;
  isBalanced: boolean;
  asOfDate: string;
}

export interface CashFlowStatementData {
  operatingActivities: {
    customerCollections: number;
    supplierPayments: number;
    payrollPaid: number;
    operatingExpensesPaid: number;
    netOperatingCashFlow: number;
  };
  financingAndTransfers: {
    ownerContributions: number;
    cashTransfersNet: number;
    netFinancingCashFlow: number;
  };
  netChangeInCash: number;
  openingCashBalance: number;
  closingCashBalance: number;
  periodStart: string;
  periodEnd: string;
}

export interface SubledgerReconciliationResult {
  controlAccountName: string;
  glAccountCode: string;
  glBalance: number;
  subledgerTotal: number;
  variance: number;
  isMatched: boolean;
  itemCount: number;
  unmatchedItems?: Array<{ id: string; name: string; balance: number }>;
}

export interface InventoryReconciliationResult {
  glAccountCode: string;
  glInventoryBalance: number;
  stockValuationTotal: number;
  variance: number;
  isMatched: boolean;
  productCount: number;
  totalUnitsCount: number;
}

export interface CashReconciliationResult {
  glCashBalance: number;
  operationalRegisterCash: number;
  variance: number;
  isMatched: boolean;
  activeShiftsCount: number;
}

