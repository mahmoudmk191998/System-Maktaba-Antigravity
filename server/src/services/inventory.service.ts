import { getFirestoreDb } from '../config/firebase.js';
import { ProductAvailabilityResult } from '../types/public.types.js';
import { defaultBranchesService, BranchesService } from './branches.service.js';
import { defaultMenuService, MenuService } from './menu.service.js';

import { env } from '../config/environment.js';

// In-memory test stores
const inMemoryRecipes = new Map<string, any>();
const inMemoryIngredients = new Map<string, any[]>();
const inMemoryBranchStock = new Map<string, number>(); // key: `${branchId}_${itemId}`

export class InventoryService {
  private useMemory: boolean;
  private menuService: MenuService;
  private branchesService: BranchesService;

  constructor(
    useMemory: boolean = env.NODE_ENV === 'test',
    menuService: MenuService = defaultMenuService,
    branchesService: BranchesService = defaultBranchesService
  ) {
    this.useMemory = useMemory;
    this.menuService = menuService;
    this.branchesService = branchesService;
  }

  /**
   * Check if a product is available for ordering in a branch context.
   * Examines product status, branch status, and recipe raw material inventory.
   */
  async checkProductAvailability(
    tenantId: string,
    productId: string,
    branchId?: string
  ): Promise<ProductAvailabilityResult> {
    // 1. Verify product existence & tenant ownership
    let product;
    try {
      product = await this.menuService.getProductById(tenantId, productId);
    } catch (_) {
      return { available: false, reason: 'not_found' };
    }

    // 2. Check direct availability toggle
    if (!product.is_available) {
      return { available: false, reason: 'disabled' };
    }

    // 3. If no branch context specified, product is generally available
    if (!branchId) {
      return { available: true, reason: null };
    }

    // 4. Verify branch validity & active status
    try {
      const branch = await this.branchesService.getBranchById(tenantId, branchId);
      if (!branch.is_active) {
        return { available: false, reason: 'branch_unavailable' };
      }
    } catch (_) {
      return { available: false, reason: 'branch_unavailable' };
    }

    // 5. Check Recipe Ingredients against Branch Stock
    try {
      if (this.useMemory) {
        const recipe = inMemoryRecipes.get(productId);
        if (recipe && recipe.tenant_id === tenantId) {
          const ingredients = inMemoryIngredients.get(recipe.id) || [];
          for (const ing of ingredients) {
            const stockKey = `${branchId}_${ing.item_id}`;
            const qty = inMemoryBranchStock.get(stockKey) ?? 100; // default in test
            if (qty <= 0 || (ing.quantity && qty < ing.quantity)) {
              return { available: false, reason: 'out_of_stock' };
            }
          }
        }
      } else {
        const db = getFirestoreDb();
        const recipesSnap = await db
          .collection('recipes')
          .where('tenant_id', '==', tenantId)
          .where('menu_item_id', '==', productId)
          .limit(1)
          .get();

        if (!recipesSnap.empty) {
          const recipeDoc = recipesSnap.docs[0];
          const recipeId = recipeDoc.id;

          const ingsSnap = await db
            .collection('recipe_ingredients')
            .where('recipe_id', '==', recipeId)
            .get();

          for (const ingDoc of ingsSnap.docs) {
            const ingData = ingDoc.data();
            const itemId = ingData.item_id;
            const requiredQty = Number(ingData.quantity) || 1;

            if (itemId) {
              const stockSnap = await db
                .collection('branch_stock')
                .where('branch_id', '==', branchId)
                .where('item_id', '==', itemId)
                .limit(1)
                .get();

              if (stockSnap.empty) {
                // No stock record exists for this ingredient
                return { available: false, reason: 'out_of_stock' };
              }

              const stockQty = Number(stockSnap.docs[0].data().quantity) || 0;
              if (stockQty < requiredQty) {
                return { available: false, reason: 'out_of_stock' };
              }
            }
          }
        }
      }
    } catch (err) {
      // In case of query failure, fallback safely to direct product availability
      console.warn('Inventory check warning:', (err as Error).message);
    }

    return { available: true, reason: null };
  }

  // Test helpers
  setMemoryRecipe(productId: string, recipeId: string, tenantId: string, ingredients: any[]) {
    inMemoryRecipes.set(productId, { id: recipeId, menu_item_id: productId, tenant_id: tenantId });
    inMemoryIngredients.set(recipeId, ingredients);
  }

  setMemoryStock(branchId: string, itemId: string, quantity: number) {
    inMemoryBranchStock.set(`${branchId}_${itemId}`, quantity);
  }

  clearMemory() {
    inMemoryRecipes.clear();
    inMemoryIngredients.clear();
    inMemoryBranchStock.clear();
  }
}

export const defaultInventoryService = new InventoryService();
