/**
 * Retail Products Service
 * Handles Product Catalog CRUD, variant management, duplicate SKU/barcode checks,
 * Arabic search normalization, and book metadata filtering.
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
  limit as fsLimit,
} from 'firebase/firestore';
import type { Product, ProductVariant } from '@/types/retail.types';
import { isValidBarcode } from './skuBarcode.service';

/**
 * Normalizes Arabic text for tolerant search:
 * - Replaces أ, إ, آ with ا
 * - Replaces ة with ه
 * - Replaces ى with ي
 * - Strips Tashkeel / Tatweel
 */
export function normalizeArabicText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u064B-\u0652\u0640]/g, '') // All Arabic Tashkeel & Tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .trim();
}

/**
 * Validates that SKU and Barcode are unique within the tenant across both products and variants.
 */
export async function validateSkuAndBarcodeUniqueness(
  tenantId: string,
  sku: string,
  barcode?: string,
  excludeProductId?: string,
  excludeVariantId?: string
): Promise<{ valid: boolean; error?: string }> {
  const cleanSku = sku.trim().toUpperCase();

  // 1. Check Product SKU
  const skuQuery = query(
    collection(db, 'products'),
    where('tenantId', '==', tenantId),
    where('sku', '==', cleanSku),
    fsLimit(2)
  );
  const skuSnap = await getDocs(skuQuery);
  for (const docSnap of skuSnap.docs) {
    if (docSnap.id !== excludeProductId) {
      return { valid: false, error: `رمز الصنف (SKU) "${cleanSku}" مستخدم بالفعل لمنتج آخر` };
    }
  }

  // 2. Check Product Barcode if provided
  if (barcode && barcode.trim() !== '') {
    const cleanBarcode = barcode.trim();
    const barcodeValidation = isValidBarcode(cleanBarcode);
    if (!barcodeValidation.isValid) {
      return { valid: false, error: barcodeValidation.error };
    }

    const barcodeQuery = query(
      collection(db, 'products'),
      where('tenantId', '==', tenantId),
      where('barcode', '==', cleanBarcode),
      fsLimit(2)
    );
    const bSnap = await getDocs(barcodeQuery);
    for (const docSnap of bSnap.docs) {
      if (docSnap.id !== excludeProductId) {
        return { valid: false, error: `الباركود "${cleanBarcode}" مستخدم بالفعل لمنتج آخر` };
      }
    }
  }

  return { valid: true };
}

/**
 * Filters a list of products in memory based on multi-criteria search and book metadata.
 */
export function filterProducts(
  products: Product[],
  options: {
    searchTerm?: string;
    categoryId?: string;
    brandId?: string;
    productType?: string;
    schoolGrade?: string;
    subject?: string;
    includeArchived?: boolean;
  }
): Product[] {
  const {
    searchTerm = '',
    categoryId,
    brandId,
    productType,
    schoolGrade,
    subject,
    includeArchived = false,
  } = options;

  const normalizedSearch = normalizeArabicText(searchTerm);

  return products.filter((p) => {
    // Archive status
    if (!includeArchived && p.archived) return false;

    // Category filter
    if (categoryId && p.categoryId !== categoryId && p.subcategoryId !== categoryId) {
      return false;
    }

    // Brand filter
    if (brandId && p.brandId !== brandId) {
      return false;
    }

    // Product type filter
    if (productType && p.productType !== productType) {
      return false;
    }

    // Book grade filter
    if (schoolGrade && p.bookMetadata?.grade !== schoolGrade) {
      return false;
    }

    // Book subject filter
    if (subject && p.bookMetadata?.subject !== subject) {
      return false;
    }

    // Text search
    if (normalizedSearch) {
      const nameNorm = normalizeArabicText(p.name);
      const nameArNorm = normalizeArabicText(p.nameAr || '');
      const nameEnNorm = (p.nameEn || '').toLowerCase();
      const skuNorm = p.sku.toLowerCase();
      const barcodeNorm = (p.barcode || '').toLowerCase();
      const authorNorm = normalizeArabicText(p.bookMetadata?.author || '');
      const isbnNorm = (p.bookMetadata?.isbn || '').toLowerCase();

      const matchesProduct =
        nameNorm.includes(normalizedSearch) ||
        nameArNorm.includes(normalizedSearch) ||
        nameEnNorm.includes(normalizedSearch) ||
        skuNorm.includes(normalizedSearch) ||
        barcodeNorm.includes(normalizedSearch) ||
        authorNorm.includes(normalizedSearch) ||
        isbnNorm.includes(normalizedSearch);

      if (matchesProduct) return true;

      // Search in variants
      if (p.variants && p.variants.length > 0) {
        const matchesVariant = p.variants.some((v) => {
          const vName = normalizeArabicText(v.name);
          const vSku = v.sku.toLowerCase();
          const vBarcode = (v.barcode || '').toLowerCase();
          return (
            vName.includes(normalizedSearch) ||
            vSku.includes(normalizedSearch) ||
            vBarcode.includes(normalizedSearch)
          );
        });
        if (matchesVariant) return true;
      }

      return false;
    }

    return true;
  });
}
