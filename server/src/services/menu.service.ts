import { getFirestoreDb } from '../config/firebase.js';
import { PublicBranch, PublicCategory, PublicMenuItem } from '../types/public.types.js';
import { NotFoundError } from '../utils/errors.js';
import { defaultBranchesService, BranchesService } from './branches.service.js';

import { env } from '../config/environment.js';

const CATEGORIES_COLLECTION = 'menu_categories';
const PRODUCTS_COLLECTION = 'menu_items';

// In-memory test stores
const inMemoryCategories = new Map<string, any>();
const inMemoryProducts = new Map<string, any>();

export interface GetProductsOptions {
  category_id?: string;
  search?: string;
  available_only?: boolean;
  limit?: number;
  offset?: number;
}

export class MenuService {
  private useMemory: boolean;
  private branchesService: BranchesService;

  constructor(useMemory: boolean = env.NODE_ENV === 'test', branchesService: BranchesService = defaultBranchesService) {
    this.useMemory = useMemory;
    this.branchesService = branchesService;
  }

  /**
   * Fetch categories belonging to the authenticated tenant, sorted by sort_order.
   */
  async getCategories(tenantId: string): Promise<PublicCategory[]> {
    let rawCategories: any[] = [];

    if (this.useMemory) {
      rawCategories = Array.from(inMemoryCategories.values()).filter(
        (c) => c.tenant_id === tenantId
      );
    } else {
      try {
        const db = getFirestoreDb();
        const snapshot = await db
          .collection(CATEGORIES_COLLECTION)
          .where('tenant_id', '==', tenantId)
          .get();

        rawCategories = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (err) {
        rawCategories = Array.from(inMemoryCategories.values()).filter(
          (c) => c.tenant_id === tenantId
        );
      }
    }

    // Sort by sort_order
    rawCategories.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    // Map to public-safe fields only
    return rawCategories.map((c) => ({
      id: c.id,
      name: c.name || '',
      name_en: c.name_en || c.nameEn || undefined,
      icon: c.icon || undefined,
      color: c.color || undefined,
      sort_order: typeof c.sort_order === 'number' ? c.sort_order : c.sortOrder || 0,
    }));
  }

  /**
   * Fetch menu products belonging to the authenticated tenant with filtering and limits.
   */
  async getProducts(tenantId: string, options: GetProductsOptions = {}): Promise<PublicMenuItem[]> {
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    let rawProducts: any[] = [];

    if (this.useMemory) {
      rawProducts = Array.from(inMemoryProducts.values()).filter(
        (p) => p.tenant_id === tenantId
      );
    } else {
      try {
        const db = getFirestoreDb();
        let q: FirebaseFirestore.Query = db
          .collection(PRODUCTS_COLLECTION)
          .where('tenant_id', '==', tenantId);

        if (options.category_id) {
          q = q.where('category_id', '==', options.category_id);
        }

        const snapshot = await q.get();
        rawProducts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      } catch (err) {
        rawProducts = Array.from(inMemoryProducts.values()).filter(
          (p) => p.tenant_id === tenantId
        );
      }
    }

    // In-memory filter for category if query was memory-based
    if (options.category_id) {
      rawProducts = rawProducts.filter(
        (p) => p.category_id === options.category_id || p.categoryId === options.category_id
      );
    }

    // Filter available_only
    if (options.available_only) {
      rawProducts = rawProducts.filter(
        (p) => p.is_available !== false && p.isAvailable !== false
      );
    }

    // Filter search text across name, name_en, description
    if (options.search && options.search.trim().length > 0) {
      const qLower = options.search.trim().toLowerCase();
      rawProducts = rawProducts.filter((p) => {
        const name = (p.name || '').toLowerCase();
        const nameEn = (p.name_en || p.nameEn || '').toLowerCase();
        const desc = (p.description || '').toLowerCase();
        return name.includes(qLower) || nameEn.includes(qLower) || desc.includes(qLower);
      });
    }

    // Sort consistently
    rawProducts.sort((a, b) => {
      const orderA = a.sort_order !== undefined ? a.sort_order : a.sortOrder !== undefined ? a.sortOrder : 0;
      const orderB = b.sort_order !== undefined ? b.sort_order : b.sortOrder !== undefined ? b.sortOrder : 0;
      if (orderA !== orderB) return orderA - orderB;
      return (a.name || '').localeCompare(b.name || '');
    });

    // Apply pagination slice
    const paginated = rawProducts.slice(offset, offset + limit);

    // Map strictly to public-safe fields (stripping cost, recipe info, audit details)
    return paginated.map((p) => ({
      id: p.id,
      category_id: p.category_id || p.categoryId || null,
      name: p.name || '',
      name_en: p.name_en || p.nameEn || undefined,
      description: p.description || undefined,
      description_en: p.description_en || p.descriptionEn || undefined,
      price: Number(p.price) || 0,
      image_url: p.image_url || p.imageUrl || p.image || null,
      preparation_time: Number(p.preparation_time || p.preparationTime) || undefined,
      calories: p.calories !== undefined ? Number(p.calories) : null,
      allergens: Array.isArray(p.allergens) ? p.allergens : null,
      is_available: p.is_available !== false && p.isAvailable !== false,
    }));
  }

  /**
   * Fetch a single product by ID, verifying tenant ownership.
   * Returns 404 if not found or belongs to another tenant.
   */
  async getProductById(tenantId: string, productId: string): Promise<PublicMenuItem> {
    let productData: any = null;

    if (this.useMemory) {
      const p = inMemoryProducts.get(productId);
      if (p && p.tenant_id === tenantId) {
        productData = p;
      }
    } else {
      try {
        const db = getFirestoreDb();
        const doc = await db.collection(PRODUCTS_COLLECTION).doc(productId).get();
        if (doc.exists) {
          const data = doc.data();
          if (data?.tenant_id === tenantId) {
            productData = { id: doc.id, ...data };
          }
        }
      } catch (err) {
        const p = inMemoryProducts.get(productId);
        if (p && p.tenant_id === tenantId) {
          productData = p;
        }
      }
    }

    if (!productData) {
      throw new NotFoundError(`Product '${productId}' not found`);
    }

    return {
      id: productData.id,
      category_id: productData.category_id || productData.categoryId || null,
      name: productData.name || '',
      name_en: productData.name_en || productData.nameEn || undefined,
      description: productData.description || undefined,
      description_en: productData.description_en || productData.descriptionEn || undefined,
      price: Number(productData.price) || 0,
      image_url: productData.image_url || productData.imageUrl || productData.image || null,
      preparation_time: Number(productData.preparation_time || productData.preparationTime) || undefined,
      calories: productData.calories !== undefined ? Number(productData.calories) : null,
      allergens: Array.isArray(productData.allergens) ? productData.allergens : null,
      is_available: productData.is_available !== false && productData.isAvailable !== false,
    };
  }

  /**
   * Fetch full catalog (categories + products + optional branch context) in parallel.
   */
  async getFullMenu(
    tenantId: string,
    branchId?: string
  ): Promise<{ categories: PublicCategory[]; products: PublicMenuItem[]; branch?: PublicBranch }> {
    const [categories, products] = await Promise.all([
      this.getCategories(tenantId),
      this.getProducts(tenantId, { limit: 100 }),
    ]);

    let branch: PublicBranch | undefined = undefined;
    if (branchId) {
      try {
        branch = await this.branchesService.getBranchById(tenantId, branchId);
      } catch (_) {}
    }

    return {
      categories,
      products,
      ...(branch ? { branch } : {}),
    };
  }

  // Test helpers
  setMemoryCategory(id: string, data: any) {
    inMemoryCategories.set(id, { id, ...data });
  }

  setMemoryProduct(id: string, data: any) {
    inMemoryProducts.set(id, { id, ...data });
  }

  clearMemory() {
    inMemoryCategories.clear();
    inMemoryProducts.clear();
  }
}

export const defaultMenuService = new MenuService();
