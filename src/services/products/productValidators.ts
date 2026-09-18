/**
 * Product & Variant Validation Rules for Bookstore & Stationery
 * Validates names, SKUs, Barcodes, Pricing bounds, and ISBNs.
 */

import type { Product, ProductVariant } from '@/types/retail.types';
import { isValidBarcode } from './skuBarcode.service';

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  warnings?: string[];
}

/**
 * Validates ISBN-10 or ISBN-13 format and check digits.
 */
export function validateISBN(isbn: string): { isValid: boolean; format?: 'ISBN10' | 'ISBN13'; error?: string } {
  if (!isbn || isbn.trim() === '') {
    return { isValid: true }; // Optional field
  }

  const clean = isbn.replace(/[-\s]/g, '').toUpperCase();

  // 1. ISBN-10 check
  if (/^\d{9}[\dX]$/.test(clean)) {
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(clean[i], 10) * (10 - i);
    }
    const lastChar = clean[9];
    sum += lastChar === 'X' ? 10 : parseInt(lastChar, 10);

    if (sum % 11 === 0) {
      return { isValid: true, format: 'ISBN10' };
    }
    return { isValid: false, error: 'الرقم التأكيدي للـ ISBN-10 غير صحيح' };
  }

  // 2. ISBN-13 check
  if (/^\d{13}$/.test(clean)) {
    if (!clean.startsWith('978') && !clean.startsWith('979')) {
      return { isValid: false, error: 'رقم ISBN-13 يجب أن يبدأ بـ 978 أو 979' };
    }

    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(clean[i], 10);
      sum += i % 2 === 0 ? digit : digit * 3;
    }
    const checkDigit = (10 - (sum % 10)) % 10;

    if (parseInt(clean[12], 10) === checkDigit) {
      return { isValid: true, format: 'ISBN13' };
    }
    return { isValid: false, error: `الرقم التأكيدي للـ ISBN-13 غير صحيح (المتوقع ${checkDigit})` };
  }

  return { isValid: false, error: 'صيغة رقم الإيداع الدولي ISBN غير صالحة (يجب أن يكون 10 أو 13 رقماً)' };
}

/**
 * Validates full product creation or update payload.
 */
export function validateProductForm(data: Partial<Product>): ValidationResult {
  const errors: Record<string, string> = {};
  const warnings: string[] = [];

  // Name
  if (!data.name || data.name.trim().length < 2) {
    errors.name = 'اسم المنتج مطلوب ويجب ألا يقل عن حرفين';
  }

  // Category
  if (!data.categoryId || data.categoryId.trim() === '') {
    errors.categoryId = 'يرجى اختيار تصنيف للمنتج';
  }

  // Product Type
  if (!data.productType) {
    errors.productType = 'يرجى اختيار نوع المنتج';
  }

  // SKU
  if (!data.sku || data.sku.trim() === '') {
    errors.sku = 'رمز الصنف (SKU) مطلوب';
  } else if (!/^[A-Za-z0-9\-_./]{2,32}$/.test(data.sku.trim())) {
    errors.sku = 'رمز الصنف يجب أن يحتوي على حروف وأرقام وعلامات ربط فقط بدون مسافات';
  }

  // Barcode (if provided)
  if (data.barcode && data.barcode.trim() !== '') {
    const barcodeRes = isValidBarcode(data.barcode);
    if (!barcodeRes.isValid) {
      errors.barcode = barcodeRes.error || 'صيغة الباركود غير صحيحة';
    }
  }

  // Pricing
  const purchasePrice = Number(data.purchasePrice);
  const sellingPrice = Number(data.sellingPrice);
  const wholesalePrice = data.wholesalePrice != null ? Number(data.wholesalePrice) : undefined;
  const minPrice = data.minimumSellingPrice != null ? Number(data.minimumSellingPrice) : undefined;

  if (isNaN(purchasePrice) || purchasePrice < 0) {
    errors.purchasePrice = 'سعر الشراء يجب أن يكون رقماً موجباً أو صفراً';
  }

  if (isNaN(sellingPrice) || sellingPrice < 0) {
    errors.sellingPrice = 'سعر البيع قطاعي مطلوب ويجب أن يكون رقماً موجباً';
  } else if (purchasePrice > 0 && sellingPrice < purchasePrice) {
    warnings.push('سعر البيع قطاعي أقل من سعر الشراء (قد يتسبب في خسارة)');
  }

  if (wholesalePrice !== undefined && (isNaN(wholesalePrice) || wholesalePrice < 0)) {
    errors.wholesalePrice = 'سعر الجملة يجب أن يكون رقماً موجباً';
  }

  if (minPrice !== undefined && (isNaN(minPrice) || minPrice < 0)) {
    errors.minimumSellingPrice = 'الحد الأدنى لسعر البيع يجب أن يكون رقماً موجباً';
  }

  if (minPrice !== undefined && sellingPrice < minPrice) {
    errors.sellingPrice = `سعر البيع (${sellingPrice}) لا يمكن أن يكون أقل من الحد الأدنى للبيع (${minPrice})`;
  }

  if (wholesalePrice !== undefined && minPrice !== undefined && wholesalePrice < minPrice) {
    errors.wholesalePrice = `سعر الجملة (${wholesalePrice}) لا يمكن أن يكون أقل من الحد الأدنى للبيع (${minPrice})`;
  }

  // Inventory limits
  if (data.minimumStock != null && (isNaN(Number(data.minimumStock)) || Number(data.minimumStock) < 0)) {
    errors.minimumStock = 'حد الطلب الأدنى يجب أن يكون صفراً أو أكثر';
  }

  if (data.reorderPoint != null && (isNaN(Number(data.reorderPoint)) || Number(data.reorderPoint) < 0)) {
    errors.reorderPoint = 'نقطة إعادة الطلب يجب أن تكون رقماً موجباً';
  }

  // Book Metadata validation if applicable
  if (data.productType === 'book' && data.bookMetadata?.isbn) {
    const isbnRes = validateISBN(data.bookMetadata.isbn);
    if (!isbnRes.isValid) {
      errors.isbn = isbnRes.error || 'رقم ISBN غير صحيح';
    }
  }

  // Variants validation
  if (data.hasVariants && data.variants && data.variants.length > 0) {
    const skuSet = new Set<string>();
    const barcodeSet = new Set<string>();

    if (data.sku) {
      skuSet.add(data.sku.trim().toUpperCase());
    }
    if (data.barcode) {
      barcodeSet.add(data.barcode.trim());
    }

    data.variants.forEach((variant, index) => {
      if (!variant.name || variant.name.trim() === '') {
        errors[`variant_${index}_name`] = `اسم الخاصية/المتغير رقم ${index + 1} مطلوب`;
      }

      const vSku = (variant.sku || '').trim().toUpperCase();
      if (!vSku) {
        errors[`variant_${index}_sku`] = `رمز SKU للخاصية "${variant.name || index + 1}" مطلوب`;
      } else if (skuSet.has(vSku)) {
        errors[`variant_${index}_sku`] = `رمز SKU "${vSku}" مكرر داخل نفس المنتج أو المتغيرات`;
      } else {
        skuSet.add(vSku);
      }

      if (variant.barcode && variant.barcode.trim() !== '') {
        const vBarcode = variant.barcode.trim();
        const bRes = isValidBarcode(vBarcode);
        if (!bRes.isValid) {
          errors[`variant_${index}_barcode`] = `باركود الخاصية "${variant.name}": ${bRes.error}`;
        } else if (barcodeSet.has(vBarcode)) {
          errors[`variant_${index}_barcode`] = `الباركود "${vBarcode}" مكرر داخل نفس المنتج أو المتغيرات`;
        } else {
          barcodeSet.add(vBarcode);
        }
      }
    });
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    warnings,
  };
}
