import { describe, it, expect } from 'vitest';
import {
  calculateEan13CheckDigit,
  isValidBarcode,
  generateProductSku,
  generateVariantSku,
  generateInternalEan13Barcode,
} from '../services/products/skuBarcode.service';
import {
  convertToBaseQuantity,
  convertFromBaseQuantity,
  calculateConvertedUnitCost,
} from '../services/units/units.service';
import { calculateItemPrice } from '../services/pricing/pricingEngine';
import {
  normalizeArabicText,
  filterProducts,
} from '../services/products/products.service';
import {
  calculateWeightedAverageCost,
  getBranchStockDocId,
} from '../services/inventory/retailInventory.service';
import { formatSequenceNumber } from '../services/sales/invoiceNumber.service';
import type { Product, ProductVariant, Unit, Promotion } from '../types/retail.types';

describe('Retail Bookstore & Stationery Core Subsystem Test Suite', () => {

  describe('1. Barcode & SKU Generation & Cryptographic Check Digits', () => {
    it('calculates correct EAN-13 check digit for standard bookstore bar codes', () => {
      // 978014103614 -> ISBN-13 book prefix (The Outsider)
      // Standard ISBN-13: 978-0-1410-3614-4 -> check digit is 4
      const checkDigit = calculateEan13CheckDigit('978014103614');
      expect(checkDigit).toBe(4);

      // Egyptian national bookstore prefix standard: 622...
      const checkDigitEg = calculateEan13CheckDigit('622300123456');
      expect(typeof checkDigitEg).toBe('number');
      expect(checkDigitEg).toBeGreaterThanOrEqual(0);
      expect(checkDigitEg).toBeLessThanOrEqual(9);
    });

    it('validates genuine EAN-13 barcodes and detects corrupted check digits', () => {
      const valid = isValidBarcode('9780141036144');
      expect(valid.isValid).toBe(true);
      expect(valid.format).toBe('EAN13');

      // Tampered barcode (changed last digit to 7 instead of 4)
      const corrupted = isValidBarcode('9780141036147');
      expect(corrupted.isValid).toBe(false);
      expect(corrupted.error).toContain('الرقم التأكيدي');
    });

    it('validates internal Code-128 and alphanumeric barcodes', () => {
      const code128 = isValidBarcode('PEN-BIC-BLU-01');
      expect(code128.isValid).toBe(true);
      expect(code128.format).toBe('CODE128');

      const invalidChars = isValidBarcode('INVALID BARCODE$$');
      expect(invalidChars.isValid).toBe(false);
    });

    it('generates deterministic internal EAN-13 barcodes with correct check digit', () => {
      const internalBarcode = generateInternalEan13Barcode(42);
      expect(internalBarcode.length).toBe(13);
      expect(internalBarcode.startsWith('200')).toBe(true);
      
      const validation = isValidBarcode(internalBarcode);
      expect(validation.isValid).toBe(true);
    });

    it('generates formatted SKUs for parent products and child variants', () => {
      const parentSku = generateProductSku('BOK', 105);
      expect(parentSku).toBe('BOK-00105');

      const variantSku = generateVariantSku(parentSku, ['Blue', 'A4']);
      expect(variantSku).toBe('BOK-00105-BLU-A4');
    });
  });

  describe('2. Units of Measurement & Mathematical Conversions', () => {
    const pieceUnit: Unit = {
      id: 'u-pcs',
      tenantId: 't1',
      name: 'قطعة',
      code: 'PCS',
      baseUnitId: null,
      conversionFactor: 1,
      isBaseUnit: true,
      active: true,
    };

    const boxUnit: Unit = {
      id: 'u-box',
      tenantId: 't1',
      name: 'علبة',
      code: 'BOX',
      baseUnitId: 'u-pcs',
      conversionFactor: 50, // 1 Box = 50 Pens
      isBaseUnit: false,
      active: true,
    };

    const cartonUnit: Unit = {
      id: 'u-ctn',
      tenantId: 't1',
      name: 'كرتونة',
      code: 'CTN',
      baseUnitId: 'u-pcs',
      conversionFactor: 600, // 1 Carton = 12 Boxes = 600 Pens
      isBaseUnit: false,
      active: true,
    };

    it('converts sub-units accurately to base unit inventory quantity', () => {
      // 3 boxes of pens -> 3 * 50 = 150 pieces
      const baseQty = convertToBaseQuantity(3, boxUnit);
      expect(baseQty).toBe(150);

      // 2 cartons of paper -> 2 * 600 = 1200 pieces
      const cartonBaseQty = convertToBaseQuantity(2, cartonUnit);
      expect(cartonBaseQty).toBe(1200);

      // Single piece conversion
      expect(convertToBaseQuantity(10, pieceUnit)).toBe(10);
    });

    it('converts base quantities into target packaging unit for display', () => {
      // 300 pens in stock -> 6 boxes
      const boxesCount = convertFromBaseQuantity(300, boxUnit);
      expect(boxesCount).toBe(6);

      // 1200 pens in stock -> 2 cartons
      const cartonsCount = convertFromBaseQuantity(1200, cartonUnit);
      expect(cartonsCount).toBe(2);
    });

    it('accurately computes converted unit cost based on base unit cost', () => {
      // Base pen cost is 4.5 EGP. Box of 50 pens should cost 225 EGP.
      const boxCost = calculateConvertedUnitCost(4.5, boxUnit);
      expect(boxCost).toBe(225);
    });
  });

  describe('3. Retail Pricing Engine (Retail, Wholesale, Variants, Promotions)', () => {
    const samplePenProduct: Product = {
      id: 'prod-pen-bic',
      tenantId: 't1',
      name: 'قلم جاف برينس أزرق',
      nameAr: 'قلم جاف برينس أزرق',
      sku: 'PEN-001',
      barcode: '6221000123456',
      categoryId: 'cat-pens',
      productType: 'pen',
      unitId: 'u-pcs',
      purchasePrice: 3.5,
      averageCost: 3.5,
      sellingPrice: 7.0,
      wholesalePrice: 5.5,
      minimumSellingPrice: 4.5,
      taxRate: 0.14, // 14% VAT
      trackInventory: true,
      allowNegativeStock: false,
      minimumStock: 10,
      reorderPoint: 20,
      active: true,
      archived: false,
      createdAt: '2026-09-17T00:00:00.000Z',
      updatedAt: '2026-09-17T00:00:00.000Z',
    };

    const redVariant: ProductVariant = {
      id: 'var-pen-red',
      productId: 'prod-pen-bic',
      sku: 'PEN-001-RED',
      barcode: '6221000123457',
      name: 'قلم جاف أحمر',
      attributes: { color: 'Red' },
      sellingPrice: 7.5, // Variant price override
      wholesalePrice: 6.0,
      trackInventory: true,
      active: true,
    };

    it('calculates standard retail price with VAT correctly', () => {
      const res = calculateItemPrice({
        product: samplePenProduct,
        quantity: 2,
        isWholesale: false,
      });

      expect(res.pricingTierUsed).toBe('retail');
      expect(res.appliedUnitPrice).toBe(7.0);
      expect(res.subtotal).toBe(14.0);
      expect(res.taxAmount).toBeCloseTo(1.96, 2);
      expect(res.lineTotal).toBeCloseTo(15.96, 2);
      expect(res.estimatedProfit).toBe(7.0); // (14 - 2*3.5)
    });

    it('applies wholesale pricing when customer is wholesale or flag is set', () => {
      const res = calculateItemPrice({
        product: samplePenProduct,
        quantity: 10,
        customerType: 'wholesale',
      });

      expect(res.pricingTierUsed).toBe('wholesale');
      expect(res.appliedUnitPrice).toBe(5.5);
      expect(res.subtotal).toBe(55.0);
    });

    it('respects variant price overrides over parent product prices', () => {
      const res = calculateItemPrice({
        product: samplePenProduct,
        variant: redVariant,
        quantity: 1,
        isWholesale: false,
      });

      expect(res.appliedUnitPrice).toBe(7.5); // Overridden from 7.0
      expect(res.subtotal).toBe(7.5);
    });

    it('applies category/product promotional discounts correctly', () => {
      const activePromo: Promotion = {
        id: 'promo-1',
        tenantId: 't1',
        title: 'خصم العودة للمدارس 10%',
        type: 'percentage',
        value: 10,
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: '2026-09-30T00:00:00.000Z',
        applicableCategoryIds: ['cat-pens'],
        active: true,
      };

      const res = calculateItemPrice({
        product: samplePenProduct,
        quantity: 1,
        activePromotions: [activePromo],
      });

      // 7.0 - 10% (0.7) = 6.30
      expect(res.discountAmount).toBeCloseTo(0.7, 2);
      expect(res.appliedUnitPrice).toBeCloseTo(6.3, 2);
      expect(res.discountReason).toContain('10%');
    });

    it('enforces minimum selling price boundary protection', () => {
      // Trying to give 50% discount on 7.0 EGP item (would be 3.5 EGP, but min price is 4.5)
      const res = calculateItemPrice({
        product: samplePenProduct,
        quantity: 1,
        manualDiscountPercentage: 50,
      });

      expect(res.appliedUnitPrice).toBe(4.5); // Clamped at minimumSellingPrice
      expect(res.discountReason).toContain('مقيد بالحد الأدنى');
    });
  });

  describe('4. Inventory Valuation & Weighted Average Cost', () => {
    it('calculates weighted average cost after receiving new stock batches', () => {
      // Existing: 100 notebooks @ 20 EGP = 2,000 EGP
      // New batch: 50 notebooks @ 26 EGP = 1,300 EGP
      // Total: 150 notebooks, Total Value: 3,300 EGP -> New average cost: 22 EGP
      const newWac = calculateWeightedAverageCost(100, 20.0, 50, 26.0);
      expect(newWac).toBe(22.0);
    });

    it('generates branch stock document IDs scoped by tenant, branch, and variant', () => {
      const parentDocId = getBranchStockDocId('tenant_cai', 'branch_nasr', 'prod_casio');
      expect(parentDocId).toBe('tenant_cai_branch_nasr_prod_casio');

      const variantDocId = getBranchStockDocId('tenant_cai', 'branch_nasr', 'prod_casio', 'var_fx991');
      expect(variantDocId).toBe('tenant_cai_branch_nasr_prod_casio_var_fx991');
    });
  });

  describe('5. Arabic Search Normalization & Tolerant Book/Stationery Filters', () => {
    it('normalizes Arabic characters (alef variations, teh marbuta, diacritics)', () => {
      const text1 = 'أَدَوَاتٌ مَكْتَبِيَّةٌ وَأَقْلَامٌ هَنْدَسِيَّة';
      const norm1 = normalizeArabicText(text1);
      expect(norm1).toBe('ادوات مكتبيه واقلام هندسيه');

      const text2 = 'إبراهيم ناصف';
      const norm2 = normalizeArabicText(text2);
      expect(norm2).toBe('ابراهيم ناصف');
    });

    it('filters products by title, author, SKU, and educational grade/term', () => {
      const productsPool: Product[] = [
        {
          id: 'b1',
          tenantId: 't1',
          name: 'سلاح التلميذ رياضيات الصف الثالث الإعدادي الترم الأول',
          nameAr: 'سلاح التلميذ رياضيات',
          sku: 'ST-MATH-3PREP',
          barcode: '9789771234567',
          categoryId: 'cat-books',
          productType: 'book',
          unitId: 'u-bk',
          purchasePrice: 80,
          averageCost: 80,
          sellingPrice: 110,
          trackInventory: true,
          allowNegativeStock: false,
          minimumStock: 5,
          reorderPoint: 10,
          active: true,
          archived: false,
          bookMetadata: {
            grade: 'الصف الثالث الإعدادي',
            subject: 'رياضيات',
            term: 'الترم الأول',
            publisher: 'سلاح التلميذ',
          },
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'b2',
          tenantId: 't1',
          name: 'رواية قواعد جارتين لعمرو عبد الحميد',
          sku: 'NOV-GART-01',
          categoryId: 'cat-novels',
          productType: 'book',
          unitId: 'u-bk',
          purchasePrice: 60,
          averageCost: 60,
          sellingPrice: 95,
          trackInventory: true,
          allowNegativeStock: false,
          minimumStock: 3,
          reorderPoint: 5,
          active: true,
          archived: false,
          bookMetadata: {
            author: 'عمرو عبد الحميد',
            bookType: 'novel',
          },
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 's1',
          tenantId: 't1',
          name: 'كشكول سلك 100 ورقة مسطر A4',
          sku: 'NB-SLK-100-A4',
          barcode: '6228001122334',
          categoryId: 'cat-notebooks',
          productType: 'notebook',
          unitId: 'u-nb',
          purchasePrice: 25,
          averageCost: 25,
          sellingPrice: 40,
          trackInventory: true,
          allowNegativeStock: false,
          minimumStock: 20,
          reorderPoint: 50,
          active: true,
          archived: false,
          createdAt: '',
          updatedAt: '',
        },
      ];

      // Search by author (even without diacritics / tolerant)
      const authorResults = filterProducts(productsPool, { searchTerm: 'عمرو عبد الحميد' });
      expect(authorResults.length).toBe(1);
      expect(authorResults[0].id).toBe('b2');

      // Search by educational subject & grade
      const gradeResults = filterProducts(productsPool, { schoolGrade: 'الصف الثالث الإعدادي' });
      expect(gradeResults.length).toBe(1);
      expect(gradeResults[0].id).toBe('b1');

      // Search by SKU
      const skuResults = filterProducts(productsPool, { searchTerm: 'nb-slk' });
      expect(skuResults.length).toBe(1);
      expect(skuResults[0].id).toBe('s1');
    });
  });

  describe('6. Atomic Sequential Invoice Numbering & Branch Scoping', () => {
    it('generates properly formatted invoice numbers with branch code and year', () => {
      const invNum = formatSequenceNumber('sale', 'CAI01', 2026, 12);
      expect(invNum).toBe('INV-CAI01-2026-000012');

      const retNum = formatSequenceNumber('return', 'ALX02', 2026, 3);
      expect(retNum).toBe('RET-ALX02-2026-000003');

      const poNum = formatSequenceNumber('purchase_order', 'HQ', 2026, 85);
      expect(poNum).toBe('PO-HQ-2026-000085');
    });
  });
});
