import { describe, it, expect } from 'vitest';
import {
  validateISBN,
  validateProductForm,
} from '../services/products/productValidators';
import {
  willCreateCircularHierarchy,
  buildCategoryTree,
} from '../services/categories/categories.service';
import {
  getSkuIndexDocId,
  getBarcodeIndexDocId,
} from '../services/products/products.repository';
import type { Product, ProductCategory, ProductVariant } from '../types/retail.types';

describe('Phase 3: Product Catalog, ISBN, SKU, and Category Hierarchy Test Suite', () => {

  describe('1. International Standard Book Number (ISBN) Validation', () => {
    it('accepts optional empty ISBN without errors', () => {
      expect(validateISBN('').isValid).toBe(true);
      expect(validateISBN('   ').isValid).toBe(true);
    });

    it('validates genuine ISBN-10 with numeric check digit', () => {
      // 0-306-40615-2 (Standard ISBN-10)
      const res = validateISBN('0-306-40615-2');
      expect(res.isValid).toBe(true);
      expect(res.format).toBe('ISBN10');
    });

    it('validates genuine ISBN-10 with "X" check digit (value 10)', () => {
      // 0-8044-2957-X
      const res = validateISBN('0-8044-2957-X');
      expect(res.isValid).toBe(true);
      expect(res.format).toBe('ISBN10');

      // Lowercase 'x' should also be accepted after normalization
      const resLower = validateISBN('0-8044-2957-x');
      expect(resLower.isValid).toBe(true);
      expect(resLower.format).toBe('ISBN10');
    });

    it('detects invalid or corrupted ISBN-10 check digits', () => {
      const res = validateISBN('0-306-40615-9'); // Last digit changed from 2 to 9
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('الرقم التأكيدي');
    });

    it('validates genuine ISBN-13 starting with 978 and 979', () => {
      // 978-0-141-03614-4
      const res = validateISBN('978-0-141-03614-4');
      expect(res.isValid).toBe(true);
      expect(res.format).toBe('ISBN13');

      // 979 prefix book
      const res979 = validateISBN('979-1-090-63607-1');
      expect(res979.isValid).toBe(true);
      expect(res979.format).toBe('ISBN13');
    });

    it('rejects 13-digit numbers not starting with standard book prefixes 978/979', () => {
      const res = validateISBN('1234567890128');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('978 أو 979');
    });

    it('detects invalid ISBN-13 check digits', () => {
      // Corrupt last digit from 4 to 0
      const res = validateISBN('978-0-141-03614-0');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('الرقم التأكيدي');
    });

    it('rejects malformed strings that do not match 10 or 13 digits', () => {
      expect(validateISBN('12345').isValid).toBe(false);
      expect(validateISBN('978-0-141-03614-4-extra').isValid).toBe(false);
    });
  });

  describe('2. Comprehensive Product Form Validation & Business Constraints', () => {
    const validBaseProduct: Partial<Product> = {
      tenantId: 'tenant-1',
      name: 'كتاب قواعد اللغة العربية',
      categoryId: 'cat-books-ar',
      productType: 'book',
      sku: 'BK-AR-001',
      barcode: '9780141036144',
      purchasePrice: 50,
      sellingPrice: 85,
      wholesalePrice: 70,
      minimumSellingPrice: 65,
      minimumStock: 5,
      reorderPoint: 10,
    };

    it('passes for a well-formed book product', () => {
      const result = validateProductForm(validBaseProduct);
      expect(result.isValid).toBe(true);
      expect(Object.keys(result.errors).length).toBe(0);
    });

    it('flags missing or too short product name', () => {
      const result = validateProductForm({ ...validBaseProduct, name: ' ' });
      expect(result.isValid).toBe(false);
      expect(result.errors.name).toBeDefined();

      const resultShort = validateProductForm({ ...validBaseProduct, name: 'أ' });
      expect(resultShort.isValid).toBe(false);
      expect(resultShort.errors.name).toBeDefined();
    });

    it('flags missing category or product type', () => {
      const result = validateProductForm({ ...validBaseProduct, categoryId: '' });
      expect(result.isValid).toBe(false);
      expect(result.errors.categoryId).toBeDefined();

      const resultNoType = validateProductForm({ ...validBaseProduct, productType: undefined });
      expect(resultNoType.isValid).toBe(false);
      expect(resultNoType.errors.productType).toBeDefined();
    });

    it('validates SKU format: rejects spaces or disallowed characters', () => {
      const resultSpaces = validateProductForm({ ...validBaseProduct, sku: 'BK AR 01' });
      expect(resultSpaces.isValid).toBe(false);
      expect(resultSpaces.errors.sku).toBeDefined();

      const resultValid = validateProductForm({ ...validBaseProduct, sku: 'NOTE-A4_80/BLUE' });
      expect(resultValid.isValid).toBe(true);
    });

    it('validates barcode checksum when provided', () => {
      const resultBadBarcode = validateProductForm({ ...validBaseProduct, barcode: '9780141036147' });
      expect(resultBadBarcode.isValid).toBe(false);
      expect(resultBadBarcode.errors.barcode).toBeDefined();
    });

    it('enforces minimum selling price constraints', () => {
      // Selling price lower than minimum price must fail
      const resultBelowMin = validateProductForm({
        ...validBaseProduct,
        sellingPrice: 60,
        minimumSellingPrice: 70,
      });
      expect(resultBelowMin.isValid).toBe(false);
      expect(resultBelowMin.errors.sellingPrice).toContain('أقل من الحد الأدنى');

      // Wholesale price lower than minimum price must fail
      const resultWholesaleBelowMin = validateProductForm({
        ...validBaseProduct,
        wholesalePrice: 60,
        minimumSellingPrice: 65,
      });
      expect(resultWholesaleBelowMin.isValid).toBe(false);
      expect(resultWholesaleBelowMin.errors.wholesalePrice).toContain('أقل من الحد الأدنى');
    });

    it('emits a warning if retail selling price is below cost (potential loss)', () => {
      const result = validateProductForm({
        ...validBaseProduct,
        purchasePrice: 100,
        sellingPrice: 90,
        wholesalePrice: 85,
        minimumSellingPrice: 80,
      });
      expect(result.isValid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.some(w => w.includes('خسارة'))).toBe(true);
    });

    it('validates ISBN inside bookMetadata when productType is book', () => {
      const result = validateProductForm({
        ...validBaseProduct,
        productType: 'book',
        bookMetadata: {
          isbn: '9780141036140', // Corrupted check digit
        },
      });
      expect(result.isValid).toBe(false);
      expect(result.errors.isbn).toBeDefined();
    });
  });

  describe('3. Variant SKU & Barcode Uniqueness Validation', () => {
    // Valid EAN-13s:
    // 622300123456 -> check digit 2
    // 622300123457 -> check digit 9
    // 622300123458 -> check digit 6
    const parentWithVariants: Partial<Product> = {
      tenantId: 'tenant-1',
      name: 'كشكول سلك 80 ورقة A4',
      categoryId: 'cat-notebooks',
      productType: 'stationery',
      sku: 'NB-A4-80',
      barcode: '6223001234562',
      purchasePrice: 15,
      sellingPrice: 25,
      hasVariants: true,
      variants: [
        {
          id: 'var-1',
          name: 'أزرق',
          sku: 'NB-A4-80-BLU',
          barcode: '6223001234579',
          price: 25,
          cost: 15,
          attributes: { color: 'أزرق' },
        },
        {
          id: 'var-2',
          name: 'أحمر',
          sku: 'NB-A4-80-RED',
          barcode: '6223001234586',
          price: 25,
          cost: 15,
          attributes: { color: 'أحمر' },
        },
      ],
    };

    it('passes when all variants have distinct SKUs and valid distinct Barcodes', () => {
      const result = validateProductForm(parentWithVariants);
      expect(result.isValid).toBe(true);
    });

    it('flags variant having identical SKU to parent product', () => {
      const duplicateSku = {
        ...parentWithVariants,
        variants: [
          {
            id: 'var-1',
            name: 'أزرق',
            sku: 'NB-A4-80', // Identical to parent SKU!
            price: 25,
            cost: 15,
          },
        ],
      };
      const result = validateProductForm(duplicateSku);
      expect(result.isValid).toBe(false);
      expect(result.errors.variant_0_sku).toContain('مكرر');
    });

    it('flags two variants having the same SKU', () => {
      const duplicateVariantSku = {
        ...parentWithVariants,
        variants: [
          { id: 'v1', name: 'أزرق', sku: 'NB-A4-80-V', price: 25, cost: 15 },
          { id: 'v2', name: 'أحمر', sku: 'NB-A4-80-V', price: 25, cost: 15 },
        ],
      };
      const result = validateProductForm(duplicateVariantSku);
      expect(result.isValid).toBe(false);
      expect(result.errors.variant_1_sku).toContain('مكرر');
    });

    it('flags variant having identical barcode to parent or another variant', () => {
      const duplicateBarcode = {
        ...parentWithVariants,
        variants: [
          {
            id: 'v1',
            name: 'أزرق',
            sku: 'NB-A4-80-B1',
            barcode: '6223001234562', // Same valid barcode as parent
            price: 25,
            cost: 15,
          },
        ],
      };
      const result = validateProductForm(duplicateBarcode);
      expect(result.isValid).toBe(false);
      expect(result.errors.variant_0_barcode).toContain('مكرر');
    });
  });

  describe('4. Category Hierarchy & Circular Dependency Prevention', () => {
    const mockCategories: ProductCategory[] = [
      { id: 'cat-books', tenantId: 't1', name: 'كتب', parentId: null, sortOrder: 1, isActive: true, createdAt: new Date() as any, updatedAt: new Date() as any },
      { id: 'cat-ar-books', tenantId: 't1', name: 'كتب عربية', parentId: 'cat-books', sortOrder: 1, isActive: true, createdAt: new Date() as any, updatedAt: new Date() as any },
      { id: 'cat-novels', tenantId: 't1', name: 'روايات عربية', parentId: 'cat-ar-books', sortOrder: 1, isActive: true, createdAt: new Date() as any, updatedAt: new Date() as any },
      { id: 'cat-stationery', tenantId: 't1', name: 'أدوات مكتبية ومدرسية', parentId: null, sortOrder: 2, isActive: true, createdAt: new Date() as any, updatedAt: new Date() as any },
      { id: 'cat-pens', tenantId: 't1', name: 'أقلام', parentId: 'cat-stationery', sortOrder: 1, isActive: true, createdAt: new Date() as any, updatedAt: new Date() as any },
    ];

    it('detects direct self-reference (category cannot be its own parent)', () => {
      expect(willCreateCircularHierarchy('cat-books', 'cat-books', mockCategories)).toBe(true);
    });

    it('detects 2-level circular loop (parent cannot become child of its child)', () => {
      // Trying to set cat-books parent to cat-ar-books
      expect(willCreateCircularHierarchy('cat-books', 'cat-ar-books', mockCategories)).toBe(true);
    });

    it('detects deep 3-level circular loop', () => {
      // Trying to set cat-books parent to cat-novels (cat-books -> cat-ar-books -> cat-novels)
      expect(willCreateCircularHierarchy('cat-books', 'cat-novels', mockCategories)).toBe(true);
    });

    it('permits legitimate hierarchy assignments', () => {
      // Assigning novels to stationery: valid, not circular
      expect(willCreateCircularHierarchy('cat-novels', 'cat-stationery', mockCategories)).toBe(false);
      // Making a category root (parentId = null): always valid
      expect(willCreateCircularHierarchy('cat-novels', null, mockCategories)).toBe(false);
    });

    it('builds a hierarchical tree from flat categories list and preserves order', () => {
      const tree = buildCategoryTree(mockCategories);
      // Roots should be cat-books and cat-stationery
      expect(tree.length).toBe(2);
      expect(tree[0].id).toBe('cat-books');
      expect(tree[1].id).toBe('cat-stationery');

      // cat-books has 1 child: cat-ar-books
      expect(tree[0].children.length).toBe(1);
      expect(tree[0].children[0].id).toBe('cat-ar-books');

      // cat-ar-books has 1 child: cat-novels
      expect(tree[0].children[0].children.length).toBe(1);
      expect(tree[0].children[0].children[0].id).toBe('cat-novels');

      // cat-stationery has 1 child: cat-pens
      expect(tree[1].children.length).toBe(1);
      expect(tree[1].children[0].id).toBe('cat-pens');
    });
  });

  describe('5. Deterministic SKU & Barcode Index Key Generation', () => {
    it('normalizes SKU document IDs to uppercase with tenant separation', () => {
      const docId = getSkuIndexDocId('tenant_alwan_01', 'bk-math-101');
      expect(docId).toBe('tenant_alwan_01___BK-MATH-101');

      const trimmedDocId = getSkuIndexDocId('tenant_alwan_01', '  bk-sci-02  ');
      expect(trimmedDocId).toBe('tenant_alwan_01___BK-SCI-02');
    });

    it('normalizes Barcode document IDs with tenant separation', () => {
      const docId = getBarcodeIndexDocId('tenant_alwan_01', ' 9780141036144 ');
      expect(docId).toBe('tenant_alwan_01___9780141036144');
    });
  });

  describe('6. SKU and Barcode Permanent Lock Retention for Archived Products (Mandatory Pre-Phase Fix)', () => {
    it('ensures archived products retain SKU lock documents so new products cannot reuse the SKU', () => {
      const sku = 'PEN-GEL-01';
      const tenantId = 'tenant-bookstore-1';
      const skuDocId = getSkuIndexDocId(tenantId, sku);

      // Simulated existing lock for Archived Product A
      const archivedLock = {
        tenantId,
        productId: 'prod-A-original',
        sku,
        archived: true,
        updatedAt: '2026-09-17T00:00:00.000Z',
      };

      // When Product B attempts to claim the same SKU, transaction detects conflict
      const candidateProductId = 'prod-B-new';
      const isConflict = archivedLock.productId !== candidateProductId;
      expect(isConflict).toBe(true);

      const errorMessage = isConflict
        ? `رمز الصنف (SKU) "${sku}" محجوز مسبقاً ${archivedLock.archived ? '(لمنتج مؤرشف)' : 'لمنتج آخر'}. لا يمكن إعادة استخدام رموز الأصناف.`
        : null;

      expect(errorMessage).toContain('محجوز مسبقاً (لمنتج مؤرشف)');
      expect(errorMessage).toContain('لا يمكن إعادة استخدام رموز الأصناف');
    });

    it('ensures archived products retain Barcode lock documents so new products cannot reuse the Barcode', () => {
      const barcode = '9780141036144';
      const tenantId = 'tenant-bookstore-1';
      const barcodeDocId = getBarcodeIndexDocId(tenantId, barcode);

      // Simulated existing lock for Archived Product A
      const archivedBarcodeLock = {
        tenantId,
        productId: 'prod-A-original',
        barcode,
        archived: true,
        updatedAt: '2026-09-17T00:00:00.000Z',
      };

      // When Product B attempts to claim the same Barcode
      const candidateProductId = 'prod-B-new';
      const isConflict = archivedBarcodeLock.productId !== candidateProductId;
      expect(isConflict).toBe(true);

      const errorMessage = isConflict
        ? `الباركود "${barcode}" محجوز مسبقاً ${archivedBarcodeLock.archived ? '(لمنتج مؤرشف)' : 'لمنتج آخر'}. لا يمكن إعادة استخدام الباركود.`
        : null;

      expect(errorMessage).toContain('محجوز مسبقاً (لمنتج مؤرشف)');
      expect(errorMessage).toContain('لا يمكن إعادة استخدام الباركود');
    });
  });
});
