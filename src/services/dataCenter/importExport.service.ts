/**
 * Data Center Service: Import, Export, Validation & Ledger-Safe Opening Balances
 * Guarantees that:
 * 1. No product/customer/supplier/stock data is committed without a Preview step.
 * 2. Imported customer balances are routed as opening Customer Ledger entries.
 * 3. Imported supplier balances are routed as opening Supplier Ledger entries.
 * 4. Imported stock is routed through opening_balance Stock Movements.
 * 5. Duplicate SKUs and Barcodes are detected prior to commit.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  query,
  where,
} from 'firebase/firestore';
import type { Product, Customer, Supplier } from '@/types/retail.types';
import { applyStockMovement } from '../inventory/retailInventory.service';

export interface ProductImportRow {
  name: string;
  sku: string;
  barcode?: string;
  category?: string;
  brand?: string;
  costPrice: number;
  retailPrice: number;
  wholesalePrice?: number;
  minimumStock?: number;
  author?: string;
  publisher?: string;
  subject?: string;
  gradeLevel?: string;
  initialStock?: number;
}

export interface ImportValidationResult<T> {
  isValid: boolean;
  totalRows: number;
  validRows: T[];
  invalidRows: Array<{ rowNumber: number; data: any; errors: string[] }>;
  duplicateSkus: string[];
  duplicateBarcodes: string[];
}

/**
 * Parse CSV text into array of key-value records
 */
export function parseCsvText(csvText: string): Array<Record<string, string>> {
  const lines = csvText.split(/\r\n|\n|\r/).filter((line) => line.trim() !== '');
  if (lines.length < 2) return [];

  // Remove BOM if present
  const headerLine = lines[0].replace(/^\uFEFF/, '');
  const headers = headerLine.split(',').map((h) => h.trim().replace(/^"|"$/g, ''));

  const records: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    // Simple CSV parser supporting quotes
    const values: string[] = [];
    let currentVal = '';
    let inQuotes = false;

    for (let c = 0; c < rawLine.length; c++) {
      const char = rawLine[c];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(currentVal.trim().replace(/^"|"$/g, ''));
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
    values.push(currentVal.trim().replace(/^"|"$/g, ''));

    const record: Record<string, string> = {};
    headers.forEach((h, idx) => {
      record[h] = values[idx] || '';
    });
    records.push(record);
  }

  return records;
}

/**
 * Validate Product Import Data against existing catalog
 */
export async function validateProductImport(
  tenantId: string,
  rawRows: Array<Record<string, string>>
): Promise<ImportValidationResult<ProductImportRow>> {
  // Fetch existing SKUs and Barcodes
  const prodSnap = await getDocs(query(collection(db, 'products'), where('tenantId', '==', tenantId)));
  const existingSkus = new Set<string>();
  const existingBarcodes = new Set<string>();

  prodSnap.forEach((d) => {
    const data = d.data();
    if (data.sku) existingSkus.add(String(data.sku).trim().toLowerCase());
    if (data.barcode) existingBarcodes.add(String(data.barcode).trim().toLowerCase());
  });

  const validRows: ProductImportRow[] = [];
  const invalidRows: Array<{ rowNumber: number; data: any; errors: string[] }> = [];
  const duplicateSkus: string[] = [];
  const duplicateBarcodes: string[] = [];

  const seenBatchSkus = new Set<string>();
  const seenBatchBarcodes = new Set<string>();

  rawRows.forEach((row, index) => {
    const rowNum = index + 2; // header is row 1
    const errors: string[] = [];

    const name = row['name'] || row['اسم الصنف'] || row['اسم المنتج'] || '';
    const sku = (row['sku'] || row['الباركود'] || row['الكود'] || '').trim();
    const barcode = (row['barcode'] || row['باركود'] || '').trim();
    const costPrice = parseFloat(row['costPrice'] || row['سعر التكلفة'] || '0');
    const retailPrice = parseFloat(row['retailPrice'] || row['سعر البيع'] || '0');
    const wholesalePrice = parseFloat(row['wholesalePrice'] || row['سعر الجملة'] || '0') || undefined;
    const initialStock = parseFloat(row['initialStock'] || row['الرصيد الافتتاحي'] || '0') || 0;

    if (!name) errors.push('اسم الصنف مطلوب');
    if (!sku) errors.push('كود الصنف (SKU) مطلوب');
    if (isNaN(costPrice) || costPrice < 0) errors.push('سعر التكلفة غير صالح');
    if (isNaN(retailPrice) || retailPrice < 0) errors.push('سعر البيع غير صالح');

    // Duplicate SKU checks
    if (sku) {
      const lowerSku = sku.toLowerCase();
      if (existingSkus.has(lowerSku)) {
        duplicateSkus.push(`صف ${rowNum}: الـ SKU "${sku}" موجود مسبقاً في النظام`);
      }
      if (seenBatchSkus.has(lowerSku)) {
        duplicateSkus.push(`صف ${rowNum}: الـ SKU "${sku}" مكرر داخل نفس ملف الاستيراد`);
      }
      seenBatchSkus.add(lowerSku);
    }

    // Duplicate Barcode checks
    if (barcode) {
      const lowerBar = barcode.toLowerCase();
      if (existingBarcodes.has(lowerBar)) {
        duplicateBarcodes.push(`صف ${rowNum}: الباركود "${barcode}" موجود مسبقاً في النظام`);
      }
      if (seenBatchBarcodes.has(lowerBar)) {
        duplicateBarcodes.push(`صف ${rowNum}: الباركود "${barcode}" مكرر داخل ملف الاستيراد`);
      }
      seenBatchBarcodes.add(lowerBar);
    }

    if (errors.length > 0) {
      invalidRows.push({ rowNumber: rowNum, data: row, errors });
    } else {
      validRows.push({
        name,
        sku,
        barcode: barcode || undefined,
        category: row['category'] || row['التصنيف'] || 'General',
        brand: row['brand'] || row['العلامة التجارية'] || row['دار النشر'] || 'Generic',
        costPrice,
        retailPrice,
        wholesalePrice,
        minimumStock: parseFloat(row['minimumStock'] || '5') || 5,
        author: row['author'] || row['المؤلف'] || undefined,
        publisher: row['publisher'] || row['الناشر'] || undefined,
        subject: row['subject'] || row['المادة'] || undefined,
        gradeLevel: row['gradeLevel'] || row['الصف'] || undefined,
        initialStock,
      });
    }
  });

  return {
    isValid: invalidRows.length === 0 && duplicateSkus.length === 0,
    totalRows: rawRows.length,
    validRows,
    invalidRows,
    duplicateSkus,
    duplicateBarcodes,
  };
}

/**
 * Commit Validated Products Import
 */
export async function commitProductImport(
  tenantId: string,
  branchId: string,
  rows: ProductImportRow[],
  userId: string
): Promise<{ importedCount: number; stockMovementsCreated: number }> {
  let importedCount = 0;
  let stockMovementsCreated = 0;

  for (const item of rows) {
    const prodRef = doc(collection(db, 'products'));
    const now = new Date().toISOString();

    const productDoc: Partial<Product> = {
      tenantId,
      name: item.name,
      sku: item.sku,
      barcode: item.barcode || item.sku,
      category: item.category || 'General',
      brand: item.brand || 'Generic',
      costPrice: item.costPrice,
      retailPrice: item.retailPrice,
      wholesalePrice: item.wholesalePrice || item.retailPrice,
      active: true,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
      metadata: {
        author: item.author,
        publisher: item.publisher,
        subject: item.subject,
        gradeLevel: item.gradeLevel,
      },
    };

    await setDoc(prodRef, productDoc);
    importedCount++;

    // Ledger-safe Initial Stock: Create opening_balance movement
    if (item.initialStock && item.initialStock > 0) {
      await applyStockMovement({
        tenantId,
        locationId: branchId,
        productId: prodRef.id,
        movementType: 'stock_adjustment_in',
        quantity: item.initialStock,
        unitCost: item.costPrice,
        referenceType: 'opening_balance',
        referenceId: prodRef.id,
        reason: 'رصيد افتتاحي عبر استيراد البيانات',
        employeeId: userId,
      });
      stockMovementsCreated++;
    }
  }

  return { importedCount, stockMovementsCreated };
}

/**
 * Ledger-Safe Customer Import:
 * Routes any initial balance to customer_ledger opening balance entry
 */
export async function commitCustomerImport(
  tenantId: string,
  customers: Array<{ name: string; phone: string; customerType?: string; initialBalance?: number }>,
  userId: string
): Promise<{ importedCount: number; ledgerEntriesCount: number }> {
  let importedCount = 0;
  let ledgerEntriesCount = 0;

  for (const c of customers) {
    const custRef = doc(collection(db, 'customers'));
    const now = new Date().toISOString();

    const custDoc: Partial<Customer> = {
      tenantId,
      name: c.name,
      phone: c.phone,
      customerType: (c.customerType as any) || 'retail',
      openingBalance: c.initialBalance || 0,
      currentBalance: 0, // Invariant: Ledger will update currentBalance safely
      active: true,
      createdAt: now,
    };

    await setDoc(custRef, custDoc);
    importedCount++;

    if (c.initialBalance && c.initialBalance !== 0) {
      const ledgerRef = doc(collection(db, 'customer_ledger'));
      const isReceivable = c.initialBalance > 0;
      await setDoc(ledgerRef, {
        id: ledgerRef.id,
        tenantId,
        customerId: custRef.id,
        customerNameSnapshot: c.name,
        type: 'opening_balance',
        referenceType: 'opening_balance',
        referenceId: custRef.id,
        referenceNumber: 'IMPORT-OPENING',
        debit: isReceivable ? c.initialBalance : 0,
        credit: !isReceivable ? Math.abs(c.initialBalance) : 0,
        balanceAfter: c.initialBalance,
        notes: 'رصيد افتتاحي عبر استيراد ملف العملاء',
        createdAt: now,
        createdBy: userId,
      });
      ledgerEntriesCount++;
    }
  }

  return { importedCount, ledgerEntriesCount };
}

/**
 * Ledger-Safe Supplier Import:
 * Routes any initial balance to supplier_ledger opening balance entry
 */
export async function commitSupplierImport(
  tenantId: string,
  suppliers: Array<{ name: string; phone: string; supplierType?: string; initialBalance?: number }>,
  userId: string
): Promise<{ importedCount: number; ledgerEntriesCount: number }> {
  let importedCount = 0;
  let ledgerEntriesCount = 0;

  for (const s of suppliers) {
    const supRef = doc(collection(db, 'suppliers'));
    const now = new Date().toISOString();

    const supDoc: Partial<Supplier> = {
      tenantId,
      name: s.name,
      phone: s.phone,
      supplierType: (s.supplierType as any) || 'wholesaler',
      paymentTermsDays: 30,
      openingBalance: s.initialBalance || 0,
      currentBalance: 0, // Invariant: Ledger will calculate balance
      active: true,
    };

    await setDoc(supRef, supDoc);
    importedCount++;

    if (s.initialBalance && s.initialBalance !== 0) {
      const ledgerRef = doc(collection(db, 'supplier_ledger'));
      await setDoc(ledgerRef, {
        id: ledgerRef.id,
        tenantId,
        supplierId: supRef.id,
        type: 'opening_balance',
        referenceType: 'manual',
        referenceId: supRef.id,
        referenceNumber: 'IMPORT-OPENING',
        debit: s.initialBalance < 0 ? Math.abs(s.initialBalance) : 0,
        credit: s.initialBalance > 0 ? s.initialBalance : 0,
        balanceAfter: s.initialBalance,
        currency: 'SAR',
        notes: 'رصيد افتتاحي عبر استيراد ملف الموردين',
        createdAt: now,
        createdBy: userId,
      });
      ledgerEntriesCount++;
    }
  }

  return { importedCount, ledgerEntriesCount };
}

/**
 * Bulk Price Update with Margin Impact Preview
 */
export interface BulkPricePreviewRow {
  productId: string;
  sku: string;
  name: string;
  costPrice: number;
  currentRetailPrice: number;
  newRetailPrice: number;
  priceDelta: number;
  currentMarginPct: number;
  newMarginPct: number;
}

export function generateBulkPricePreview(
  currentProducts: Product[],
  updatesMap: Map<string, number> // SKU => newRetailPrice
): BulkPricePreviewRow[] {
  const previews: BulkPricePreviewRow[] = [];

  for (const prod of currentProducts) {
    const newPrice = updatesMap.get(prod.sku);
    if (newPrice !== undefined && newPrice !== prod.retailPrice) {
      const cost = prod.costPrice || 0;
      const currentPrice = prod.retailPrice || cost;
      const priceDelta = Number((newPrice - currentPrice).toFixed(2));

      const curMargin = currentPrice > 0 ? Number((((currentPrice - cost) / currentPrice) * 100).toFixed(2)) : 0;
      const newMargin = newPrice > 0 ? Number((((newPrice - cost) / newPrice) * 100).toFixed(2)) : 0;

      previews.push({
        productId: prod.id,
        sku: prod.sku,
        name: prod.name,
        costPrice: cost,
        currentRetailPrice: currentPrice,
        newRetailPrice: newPrice,
        priceDelta,
        currentMarginPct: curMargin,
        newMarginPct: newMargin,
      });
    }
  }

  return previews;
}
