/**
 * Product Catalog Repository
 * Manages Firestore CRUD operations with atomic SKU & Barcode uniqueness guarantees,
 * tenant isolation, and pagination.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit as fsLimit,
  startAfter,
  runTransaction,
  writeBatch,
  DocumentSnapshot,
} from 'firebase/firestore';
import type { Product, ProductVariant } from '@/types/retail.types';
import { validateProductForm } from './productValidators';
import { normalizeArabicText } from './products.service';
import { removeUndefinedFields } from '@/lib/utils';
import { firestoreLogger } from '@/lib/firestoreLogger';

/**
 * Computes derived stock status flags to enable O(1) compound queries
 * (e.g. where('isLowStock', '==', true)) without dynamic field-to-field comparisons.
 */
export function computeStockStatus(
  quantity: number = 0,
  minStock: number = 0
): { isLowStock: boolean; stockStatus: 'normal' | 'low' | 'out' } {
  const qty = Number(quantity || 0);
  const min = Number(minStock || 0);
  if (qty <= 0) {
    return { isLowStock: true, stockStatus: 'out' };
  }
  if (qty <= min) {
    return { isLowStock: true, stockStatus: 'low' };
  }
  return { isLowStock: false, stockStatus: 'normal' };
}

/**
 * Fast exact barcode search (1 Read).
 */
export async function searchProductsByBarcode(
  tenantId: string,
  barcode: string
): Promise<Product[]> {
  if (!tenantId || !barcode) return [];
  const clean = barcode.trim();
  const q = query(
    collection(db, 'products'),
    where('tenantId', '==', tenantId),
    where('barcode', '==', clean),
    fsLimit(5)
  );
  const snap = await getDocs(q);
  firestoreLogger.logOperation('products.repository.barcode', 'products', 'getDocs', snap.docs.length);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
}

/**
 * Fast exact SKU search (1 Read).
 */
export async function searchProductsBySku(
  tenantId: string,
  sku: string
): Promise<Product[]> {
  if (!tenantId || !sku) return [];
  const clean = sku.trim().toUpperCase();
  const q = query(
    collection(db, 'products'),
    where('tenantId', '==', tenantId),
    where('sku', '==', clean),
    fsLimit(5)
  );
  const snap = await getDocs(q);
  firestoreLogger.logOperation('products.repository.sku', 'products', 'getDocs', snap.docs.length);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
}

/**
 * Prefix name search using bounded range query (Up to maxLimit reads).
 */
export async function searchProductsByNamePrefix(
  tenantId: string,
  prefix: string,
  maxLimit: number = 20
): Promise<Product[]> {
  if (!tenantId || !prefix.trim()) return [];
  const term = prefix.trim();
  const q = query(
    collection(db, 'products'),
    where('tenantId', '==', tenantId),
    where('name', '>=', term),
    where('name', '<=', term + '\uf8ff'),
    fsLimit(maxLimit)
  );
  const snap = await getDocs(q);
  firestoreLogger.logOperation('products.repository.prefix', 'products', 'getDocs', snap.docs.length);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product));
}

export interface FetchProductsOptions {
  categoryId?: string;
  brandId?: string;
  productType?: string;
  includeArchived?: boolean;
  searchTerm?: string;
  pageSize?: number;
  lastVisible?: DocumentSnapshot;
}

export interface ProductsPageResult {
  products: Product[];
  lastVisible?: DocumentSnapshot;
  hasMore: boolean;
}

/**
 * Deterministic document key for SKU uniqueness index
 */
export function getSkuIndexDocId(tenantId: string, sku: string): string {
  return `${tenantId}___${sku.trim().toUpperCase()}`;
}

/**
 * Deterministic document key for Barcode uniqueness index
 */
export function getBarcodeIndexDocId(tenantId: string, barcode: string): string {
  return `${tenantId}___${barcode.trim()}`;
}

/**
 * Fetches products for a specific tenant with optional filters and pagination.
 */
export async function fetchProductsFromDb(
  tenantId: string,
  options: FetchProductsOptions = {}
): Promise<ProductsPageResult> {
  const {
    categoryId,
    brandId,
    productType,
    includeArchived = false,
    searchTerm = '',
    pageSize = 200,
  } = options;

  if (!tenantId) {
    return { products: [], hasMore: false };
  }

  try {
    // 1. Query by tenantId (simple query without composite index requirement)
    let q = query(collection(db, 'products'), where('tenantId', '==', tenantId));
    let snap = await getDocs(q);
    firestoreLogger.logOperation('products.repository.fetch', 'products', 'getDocs', snap.docs.length);

    // Fallback: check tenant_id if tenantId returned empty
    if (snap.empty) {
      const qAlt = query(collection(db, 'products'), where('tenant_id', '==', tenantId));
      const snapAlt = await getDocs(qAlt);
      firestoreLogger.logOperation('products.repository.fetchAlt', 'products', 'getDocs', snapAlt.docs.length);
      if (!snapAlt.empty) {
        snap = snapAlt;
      }
    }

    let allProducts = snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Product[];

    // 2. In-memory filtering (fast, zero composite index errors)
    if (!includeArchived) {
      allProducts = allProducts.filter((p) => !p.archived);
    }

    if (categoryId && categoryId !== 'all') {
      allProducts = allProducts.filter((p) => p.categoryId === categoryId);
    }

    if (brandId && brandId !== 'all') {
      allProducts = allProducts.filter((p) => p.brandId === brandId);
    }

    if (productType && productType !== 'all') {
      allProducts = allProducts.filter(
        (p) => p.productType === productType || (p as any).type === productType
      );
    }

    // 3. In-memory sort by createdAt descending (newest first)
    allProducts.sort((a, b) => {
      const timeA = new Date(a.createdAt || a.updatedAt || 0).getTime();
      const timeB = new Date(b.createdAt || b.updatedAt || 0).getTime();
      return timeB - timeA;
    });

    // 4. In-memory tolerant Arabic & Latin search
    if (searchTerm && searchTerm.trim() !== '') {
      const term = normalizeArabicText(searchTerm);
      allProducts = allProducts.filter((p) => {
        const nameNorm = normalizeArabicText(p.name || p.nameAr || '');
        const nameEn = (p.nameEn || '').toLowerCase();
        const sku = (p.sku || '').toLowerCase();
        const barcode = (p.barcode || '').toLowerCase();
        const author = normalizeArabicText(p.bookMetadata?.author || (p as any).author || '');
        const isbn = (p.bookMetadata?.isbn || (p as any).isbn || '').toLowerCase();

        const mainMatch =
          nameNorm.includes(term) ||
          nameEn.includes(term) ||
          sku.includes(term) ||
          barcode.includes(term) ||
          author.includes(term) ||
          isbn.includes(term);

        if (mainMatch) return true;

        if (p.variants && p.variants.length > 0) {
          return p.variants.some((v) => {
            const vName = normalizeArabicText(v.name);
            const vSku = (v.sku || '').toLowerCase();
            const vBarcode = (v.barcode || '').toLowerCase();
            return vName.includes(term) || vSku.includes(term) || vBarcode.includes(term);
          });
        }

        return false;
      });
    }

    const hasMore = pageSize ? allProducts.length > pageSize : false;
    const paginated = pageSize ? allProducts.slice(0, pageSize) : allProducts;

    return {
      products: paginated,
      lastVisible: snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : undefined,
      hasMore,
    };
  } catch (err) {
    console.error('Failed to fetch products from db:', err);
    return { products: [], hasMore: false };
  }
}

/**
 * Retrieves a single product by ID.
 */
export async function getProductByIdFromDb(
  tenantId: string,
  productId: string
): Promise<Product | null> {
  if (!tenantId || !productId) return null;
  const productRef = doc(db, 'products', productId);
  const snap = await getDoc(productRef);
  if (!snap.exists()) return null;

  const data = snap.data() as Product;
  if (data.tenantId !== tenantId) return null; // Strict tenant check
  return { id: snap.id, ...data };
}

/**
 * Searches product or variant by Barcode (with tenant isolation).
 */
export async function findProductOrVariantByBarcode(
  tenantId: string,
  barcode: string
): Promise<{ product: Product; variant?: ProductVariant } | null> {
  if (!tenantId || !barcode || barcode.trim() === '') return null;
  const cleanBarcode = barcode.trim();

  // 1. Direct query on parent product barcode
  const qParent = query(
    collection(db, 'products'),
    where('tenantId', '==', tenantId),
    where('barcode', '==', cleanBarcode),
    fsLimit(1)
  );
  const snapParent = await getDocs(qParent);
  if (!snapParent.empty) {
    const docData = snapParent.docs[0].data() as Product;
    return { product: { id: snapParent.docs[0].id, ...docData } };
  }

  // 2. Query in products that have variants
  const qVariants = query(
    collection(db, 'products'),
    where('tenantId', '==', tenantId),
    where('hasVariants', '==', true)
  );
  const snapVariants = await getDocs(qVariants);
  for (const docSnap of snapVariants.docs) {
    const p = { id: docSnap.id, ...docSnap.data() } as Product;
    if (p.variants) {
      const foundVar = p.variants.find((v) => v.barcode === cleanBarcode);
      if (foundVar) {
        return { product: p, variant: foundVar };
      }
    }
  }

  return null;
}

/**
 * Searches product or variant by SKU (with tenant isolation).
 */
export async function findProductOrVariantBySku(
  tenantId: string,
  sku: string
): Promise<{ product: Product; variant?: ProductVariant } | null> {
  if (!tenantId || !sku || sku.trim() === '') return null;
  const cleanSku = sku.trim().toUpperCase();

  // 1. Direct parent SKU check
  const qParent = query(
    collection(db, 'products'),
    where('tenantId', '==', tenantId),
    where('sku', '==', cleanSku),
    fsLimit(1)
  );
  const snapParent = await getDocs(qParent);
  if (!snapParent.empty) {
    const docData = snapParent.docs[0].data() as Product;
    return { product: { id: snapParent.docs[0].id, ...docData } };
  }

  // 2. Variant SKU check
  const qVariants = query(
    collection(db, 'products'),
    where('tenantId', '==', tenantId),
    where('hasVariants', '==', true)
  );
  const snapVariants = await getDocs(qVariants);
  for (const docSnap of snapVariants.docs) {
    const p = { id: docSnap.id, ...docSnap.data() } as Product;
    if (p.variants) {
      const foundVar = p.variants.find((v) => v.sku.toUpperCase() === cleanSku);
      if (foundVar) {
        return { product: p, variant: foundVar };
      }
    }
  }

  return null;
}

/**
 * Creates a new product with atomic SKU & Barcode uniqueness locks inside a Firestore Transaction.
 */
export async function createProductInDb(
  tenantId: string,
  productData: Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>,
  userId?: string
): Promise<{ success: boolean; product?: Product; error?: string }> {
  if (!tenantId) {
    return { success: false, error: 'معرف المؤسسة (Tenant ID) غير متوفر' };
  }

  const validation = validateProductForm({ ...productData, tenantId });
  if (!validation.isValid) {
    const firstErr = Object.values(validation.errors)[0];
    return { success: false, error: firstErr };
  }

  const now = new Date().toISOString();
  const productRef = doc(collection(db, 'products'));

  // Collect all SKUs and Barcodes that must be uniquely locked
  const skusToLock = [productData.sku.trim().toUpperCase()];
  const barcodesToLock: string[] = [];
  if (productData.barcode && productData.barcode.trim() !== '') {
    barcodesToLock.push(productData.barcode.trim());
  }

  if (productData.hasVariants && productData.variants) {
    for (const v of productData.variants) {
      if (v.sku) skusToLock.push(v.sku.trim().toUpperCase());
      if (v.barcode && v.barcode.trim() !== '') barcodesToLock.push(v.barcode.trim());
    }
  }

  try {
    const createdProduct = await runTransaction(db, async (transaction) => {
      // 1. ALL READS FIRST: Verify all SKUs
      const skuLocks: { ref: any; sku: string }[] = [];
      for (const sku of skusToLock) {
        const skuLockRef = doc(db, 'product_skus', getSkuIndexDocId(tenantId, sku));
        const skuSnap = await transaction.get(skuLockRef);
        if (skuSnap.exists() && skuSnap.data().productId !== productRef.id) {
          const isArchived = !!skuSnap.data().archived;
          throw new Error(`رمز الصنف (SKU) "${sku}" محجوز مسبقاً ${isArchived ? '(لمنتج مؤرشف)' : 'لمنتج آخر'}. لا يمكن إعادة استخدام رموز الأصناف.`);
        }
        skuLocks.push({ ref: skuLockRef, sku });
      }

      // 2. ALL READS FIRST: Verify all Barcodes
      const barcodeLocks: { ref: any; barcode: string }[] = [];
      for (const barcode of barcodesToLock) {
        const barcodeLockRef = doc(db, 'product_barcodes', getBarcodeIndexDocId(tenantId, barcode));
        const bSnap = await transaction.get(barcodeLockRef);
        if (bSnap.exists() && bSnap.data().productId !== productRef.id) {
          const isArchived = !!bSnap.data().archived;
          throw new Error(`الباركود "${barcode}" محجوز مسبقاً ${isArchived ? '(لمنتج مؤرشف)' : 'لمنتج آخر'}. لا يمكن إعادة استخدام الباركود.`);
        }
        barcodeLocks.push({ ref: barcodeLockRef, barcode });
      }

      // 3. ALL WRITES AFTER ALL READS: Lock SKUs
      for (const item of skuLocks) {
        transaction.set(item.ref, {
          tenantId,
          productId: productRef.id,
          sku: item.sku,
          archived: false,
          updatedAt: now,
        });
      }

      // 4. Lock Barcodes
      for (const item of barcodeLocks) {
        transaction.set(item.ref, {
          tenantId,
          productId: productRef.id,
          barcode: item.barcode,
          archived: false,
          updatedAt: now,
        });
      }

      // 5. Compute derived low stock flags and Save Product Document
      const qty = Number(productData.quantity || 0);
      const minStock = Number(productData.minimumStock || 0);
      const stockDerived = computeStockStatus(qty, minStock);

      const rawProduct: Product = {
        id: productRef.id,
        tenantId,
        ...productData,
        quantity: qty,
        isLowStock: stockDerived.isLowStock,
        stockStatus: stockDerived.stockStatus,
        averageCost: productData.averageCost || productData.purchasePrice || 0,
        archived: false,
        active: productData.active !== undefined ? productData.active : true,
        createdAt: now,
        updatedAt: now,
        createdBy: userId || '',
        updatedBy: userId || '',
      };

      const finalProduct = removeUndefinedFields(rawProduct);
      transaction.set(productRef, finalProduct);

      return finalProduct;
    });

    return { success: true, product: createdProduct };
  } catch (err: any) {
    console.error('Failed to create product:', err);
    return { success: false, error: err?.message || 'فشل في حفظ المنتج' };
  }
}

/**
 * Updates an existing product with updated SKU and Barcode locks.
 */
export async function updateProductInDb(
  tenantId: string,
  productId: string,
  updateData: Partial<Product>,
  userId?: string
): Promise<{ success: boolean; product?: Product; error?: string }> {
  if (!tenantId || !productId) {
    return { success: false, error: 'معرف المنتج أو المؤسسة غير صالح' };
  }

  const existingProduct = await getProductByIdFromDb(tenantId, productId);
  if (!existingProduct) {
    return { success: false, error: 'المنتج غير موجود أو لا تملك صلاحية الوصول إليه' };
  }

  const merged = { ...existingProduct, ...updateData };
  const validation = validateProductForm(merged);
  if (!validation.isValid) {
    const firstErr = Object.values(validation.errors)[0];
    return { success: false, error: firstErr };
  }

  const now = new Date().toISOString();
  const productRef = doc(db, 'products', productId);

  // New SKUs and Barcodes
  const newSkus = [merged.sku.trim().toUpperCase()];
  const newBarcodes: string[] = [];
  if (merged.barcode && merged.barcode.trim() !== '') {
    newBarcodes.push(merged.barcode.trim());
  }

  if (merged.hasVariants && merged.variants) {
    for (const v of merged.variants) {
      if (v.sku) newSkus.push(v.sku.trim().toUpperCase());
      if (v.barcode && v.barcode.trim() !== '') newBarcodes.push(v.barcode.trim());
    }
  }

  try {
    const updated = await runTransaction(db, async (transaction) => {
      // 1. ALL READS FIRST: Verify new SKUs
      const skuLocks: { ref: any; sku: string }[] = [];
      for (const sku of newSkus) {
        const skuLockRef = doc(db, 'product_skus', getSkuIndexDocId(tenantId, sku));
        const skuSnap = await transaction.get(skuLockRef);
        if (skuSnap.exists() && skuSnap.data().productId !== productId) {
          const isArchived = !!skuSnap.data().archived;
          throw new Error(`رمز الصنف (SKU) "${sku}" محجوز مسبقاً ${isArchived ? '(لمنتج مؤرشف)' : 'لمنتج آخر'}. لا يمكن إعادة استخدام رموز الأصناف.`);
        }
        skuLocks.push({ ref: skuLockRef, sku });
      }

      // 2. ALL READS FIRST: Verify new Barcodes
      const barcodeLocks: { ref: any; barcode: string }[] = [];
      for (const barcode of newBarcodes) {
        const barcodeLockRef = doc(db, 'product_barcodes', getBarcodeIndexDocId(tenantId, barcode));
        const bSnap = await transaction.get(barcodeLockRef);
        if (bSnap.exists() && bSnap.data().productId !== productId) {
          const isArchived = !!bSnap.data().archived;
          throw new Error(`الباركود "${barcode}" محجوز مسبقاً ${isArchived ? '(لمنتج مؤرشف)' : 'لمنتج آخر'}. لا يمكن إعادة استخدام الباركود.`);
        }
        barcodeLocks.push({ ref: barcodeLockRef, barcode });
      }

      // 3. ALL WRITES AFTER ALL READS: Update SKU locks
      for (const item of skuLocks) {
        transaction.set(item.ref, {
          tenantId,
          productId,
          sku: item.sku,
          archived: !!merged.archived,
          updatedAt: now,
        });
      }

      // 4. Update Barcode locks
      for (const item of barcodeLocks) {
        transaction.set(item.ref, {
          tenantId,
          productId,
          barcode: item.barcode,
          archived: !!merged.archived,
          updatedAt: now,
        });
      }

      // 5. Compute derived low stock flags and Update Product document
      const qty = Number(merged.quantity !== undefined ? merged.quantity : (existingProduct.quantity || 0));
      const minStock = Number(merged.minimumStock !== undefined ? merged.minimumStock : (existingProduct.minimumStock || 0));
      const stockDerived = computeStockStatus(qty, minStock);

      const rawProduct: Product = {
        ...merged,
        quantity: qty,
        isLowStock: stockDerived.isLowStock,
        stockStatus: stockDerived.stockStatus,
        updatedAt: now,
        updatedBy: userId || '',
      };

      const finalProduct = removeUndefinedFields(rawProduct);
      transaction.set(productRef, finalProduct);
      return finalProduct;
    });

    return { success: true, product: updated };
  } catch (err: any) {
    console.error('Failed to update product:', err);
    return { success: false, error: err?.message || 'فشل في تحديث بيانات المنتج' };
  }
}

/**
 * Archives a product (soft delete with permanent SKU/Barcode reservation and historical integrity).
 */
export async function archiveProductInDb(
  tenantId: string,
  productId: string,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  return updateProductInDb(tenantId, productId, { archived: true, active: false }, userId);
}

/**
 * Restores an archived product.
 */
export async function restoreProductInDb(
  tenantId: string,
  productId: string,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  return updateProductInDb(tenantId, productId, { archived: false, active: true }, userId);
}

/**
 * Hard deletes a product ONLY if it has zero transaction history and zero stock movements.
 * If any stock movement or balance exists, hard delete is strictly rejected.
 */
export async function safeHardDeleteProductInDb(
  tenantId: string,
  productId: string
): Promise<{ success: boolean; error?: string }> {
  if (!tenantId || !productId) {
    return { success: false, error: 'معرف المنتج أو المؤسسة غير صالح' };
  }

  // 1. Verify existence
  const product = await getProductByIdFromDb(tenantId, productId);
  if (!product) {
    return { success: false, error: 'المنتج غير موجود' };
  }

  // 2. Check for historical stock movements
  const movementsQuery = query(
    collection(db, 'stock_movements'),
    where('tenantId', '==', tenantId),
    where('productId', '==', productId),
    fsLimit(1)
  );
  const movementsSnap = await getDocs(movementsQuery);
  if (!movementsSnap.empty) {
    return {
      success: false,
      error: 'لا يمكن الحذف النهائي لمنتج يمتلك حركات مخزنية تاريخية. يرجى أرشفة المنتج للحفاظ على النزاهة المحاسبية.',
    };
  }

  // 3. Check for stock balance > 0
  const stockQuery = query(
    collection(db, 'branch_stock'),
    where('tenantId', '==', tenantId),
    where('productId', '==', productId),
    fsLimit(5)
  );
  const stockSnap = await getDocs(stockQuery);
  const hasActiveStock = stockSnap.docs.some((d) => (d.data().quantity || d.data().onHandQuantity || 0) > 0);
  if (hasActiveStock) {
    return {
      success: false,
      error: 'لا يمكن حذف منتج يمتلك رصيداً مخزنياً حالياً في أحد الفروع.',
    };
  }

  // 4. Safe delete inside transaction (remove product and release SKU/barcode locks)
  const productRef = doc(db, 'products', productId);
  const skusToRelease = [product.sku.trim().toUpperCase()];
  const barcodesToRelease: string[] = [];
  if (product.barcode && product.barcode.trim() !== '') {
    barcodesToRelease.push(product.barcode.trim());
  }
  if (product.hasVariants && product.variants) {
    for (const v of product.variants) {
      if (v.sku) skusToRelease.push(v.sku.trim().toUpperCase());
      if (v.barcode && v.barcode.trim() !== '') barcodesToRelease.push(v.barcode.trim());
    }
  }

  try {
    await runTransaction(db, async (transaction) => {
      // Remove SKU locks
      for (const sku of skusToRelease) {
        const skuLockRef = doc(db, 'product_skus', getSkuIndexDocId(tenantId, sku));
        transaction.delete(skuLockRef);
      }
      // Remove Barcode locks
      for (const barcode of barcodesToRelease) {
        const barcodeLockRef = doc(db, 'product_barcodes', getBarcodeIndexDocId(tenantId, barcode));
        transaction.delete(barcodeLockRef);
      }
      // Delete product doc
      transaction.delete(productRef);
    });

    return { success: true };
  } catch (err: any) {
    console.error('Failed to safely hard delete product:', err);
    return { success: false, error: err?.message || 'فشل في حذف المنتج' };
  }
}

export interface ProductsStockBackfillResult {
  totalProductsInDatabase: number;
  productsScanned: number;
  productsUpdated: number;
  productsSkipped: number;
  lowStockProducts: number;
  outOfStockProducts: number;
}

/**
 * Safely backfills derived stock status fields (isLowStock and stockStatus) for all existing
 * products in a tenant catalog based on existing quantity and minimumStock.
 * STRICT GUARANTEE: Does NOT modify product quantity, prices, or any other warehouse records.
 */
export async function backfillProductsStockDerivedFields(
  tenantId: string
): Promise<ProductsStockBackfillResult> {
  if (!tenantId) {
    return {
      totalProductsInDatabase: 0,
      productsScanned: 0,
      productsUpdated: 0,
      productsSkipped: 0,
      lowStockProducts: 0,
      outOfStockProducts: 0,
    };
  }

  let snap = await getDocs(query(collection(db, 'products'), where('tenantId', '==', tenantId)));
  if (snap.empty) {
    snap = await getDocs(query(collection(db, 'products'), where('tenant_id', '==', tenantId)));
  }

  let productsScanned = snap.docs.length;
  let productsUpdated = 0;
  let lowStockProducts = 0;
  let outOfStockProducts = 0;

  const BATCH_SIZE = 400;
  let currentBatch = writeBatch(db);
  let batchOps = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as Product;
    const qty = Number(data.quantity ?? 0);
    const minStock = Number(data.minimumStock ?? 0);
    const derived = computeStockStatus(qty, minStock);

    if (derived.isLowStock) lowStockProducts++;
    if (derived.stockStatus === 'out') outOfStockProducts++;

    const needsUpdate =
      data.isLowStock !== derived.isLowStock ||
      data.stockStatus !== derived.stockStatus;

    if (needsUpdate) {
      currentBatch.update(docSnap.ref, {
        isLowStock: derived.isLowStock,
        stockStatus: derived.stockStatus,
      });
      batchOps++;
      productsUpdated++;

      if (batchOps >= BATCH_SIZE) {
        await currentBatch.commit();
        currentBatch = writeBatch(db);
        batchOps = 0;
      }
    }
  }

  if (batchOps > 0) {
    await currentBatch.commit();
  }

  return {
    totalProductsInDatabase: productsScanned,
    productsScanned,
    productsUpdated,
    productsSkipped: productsScanned - productsUpdated,
    lowStockProducts,
    outOfStockProducts,
  };
}

