/**
 * Product Categories Service
 * Supports nested hierarchy, parent/child relationships, and circular dependency prevention.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import type { ProductCategory } from '@/types/retail.types';

export interface CategoryTreeNode extends ProductCategory {
  children: CategoryTreeNode[];
}

/**
 * Checks if assigning `newParentId` to `categoryId` would create a circular loop in the category tree.
 */
export function willCreateCircularHierarchy(
  categoryId: string,
  newParentId: string | null | undefined,
  allCategories: ProductCategory[]
): boolean {
  if (!newParentId) return false;
  if (categoryId === newParentId) return true; // Direct self-reference

  const categoryMap = new Map<string, ProductCategory>();
  for (const cat of allCategories) {
    categoryMap.set(cat.id, cat);
  }

  // Traverse up the chain from newParentId
  let currentId: string | null | undefined = newParentId;
  const visited = new Set<string>();

  while (currentId) {
    if (currentId === categoryId) {
      return true; // Loop detected
    }
    if (visited.has(currentId)) {
      return true; // Loop in existing data
    }
    visited.add(currentId);

    const parentCat = categoryMap.get(currentId);
    currentId = parentCat?.parentId;
  }

  return false;
}

/**
 * Builds a hierarchical tree structure from flat category list.
 */
export function buildCategoryTree(categories: ProductCategory[]): CategoryTreeNode[] {
  const nodeMap = new Map<string, CategoryTreeNode>();
  const rootNodes: CategoryTreeNode[] = [];

  // 1. Initialize all nodes
  for (const cat of categories) {
    nodeMap.set(cat.id, { ...cat, children: [] });
  }

  // 2. Build parent-child relationships
  for (const cat of categories) {
    const node = nodeMap.get(cat.id)!;
    if (cat.parentId && nodeMap.has(cat.parentId)) {
      const parentNode = nodeMap.get(cat.parentId)!;
      parentNode.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  // Sort nodes by sortOrder
  const sortNodes = (nodes: CategoryTreeNode[]) => {
    nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    for (const n of nodes) {
      if (n.children.length > 0) {
        sortNodes(n.children);
      }
    }
  };

  sortNodes(rootNodes);
  return rootNodes;
}

/**
 * Fetches all categories for a given tenant from Firestore.
 */
export async function fetchCategoriesFromDb(tenantId: string): Promise<ProductCategory[]> {
  if (!tenantId) return [];

  try {
    // Single equality filter: does NOT require a Firestore composite index!
    const q1 = query(
      collection(db, 'categories'),
      where('tenantId', '==', tenantId)
    );

    const snap1 = await getDocs(q1);
    let docs = snap1.docs;

    // Fallback if legacy or imported categories used snake_case tenant_id
    if (docs.length === 0) {
      const q2 = query(
        collection(db, 'categories'),
        where('tenant_id', '==', tenantId)
      );
      const snap2 = await getDocs(q2);
      docs = snap2.docs;
    }

    const items = docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as ProductCategory[];

    // Sort in memory to guarantee perfect order without requiring a Firestore index
    return items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  } catch (err: any) {
    console.error('Error fetching categories from Firestore:', err);
    return [];
  }
}

/**
 * Creates or updates a category with circular hierarchy protection.
 */
export async function saveCategoryToDb(
  tenantId: string,
  categoryData: Omit<ProductCategory, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  existingCategories: ProductCategory[]
): Promise<{ success: boolean; category?: ProductCategory; error?: string }> {
  if (!tenantId) {
    return { success: false, error: 'معرف المؤسسة غير متوفر' };
  }

  if (!categoryData.name || categoryData.name.trim() === '') {
    return { success: false, error: 'اسم التصنيف مطلوب' };
  }

  const categoryId = categoryData.id || doc(collection(db, 'categories')).id;

  // Check circular hierarchy
  if (categoryData.parentId) {
    const isCircular = willCreateCircularHierarchy(categoryId, categoryData.parentId, existingCategories);
    if (isCircular) {
      return { success: false, error: 'لا يمكن تعيين هذا التصنيف كأب لأنه يؤدي إلى حلقة تسلسلية دائرية مغلقة' };
    }
  }

  const now = new Date().toISOString();
  const categoryRef = doc(db, 'categories', categoryId);

  const finalCategory: any = {
    id: categoryId,
    tenantId,
    tenant_id: tenantId, // Dual compatibility
    name: categoryData.name.trim(),
    nameAr: categoryData.nameAr || categoryData.name.trim(),
    nameEn: categoryData.nameEn || '',
    parentId: categoryData.parentId || null,
    description: categoryData.description || '',
    image: categoryData.image || '',
    sortOrder: categoryData.sortOrder || 0,
    active: categoryData.active !== undefined ? categoryData.active : true,
    createdAt: categoryData.id ? (existingCategories.find((c) => c.id === categoryId)?.createdAt || now) : now,
    updatedAt: now,
  };

  try {
    await setDoc(categoryRef, finalCategory);
    return { success: true, category: finalCategory as ProductCategory };
  } catch (err: any) {
    console.error('Failed to save category:', err);
    return { success: false, error: err?.message || 'فشل في حفظ التصنيف' };
  }
}

/**
 * Deletes or deactivates a category with dependency safety check.
 */
export async function deleteCategoryFromDb(
  tenantId: string,
  categoryId: string,
  existingCategories: ProductCategory[]
): Promise<{ success: boolean; error?: string }> {
  if (!tenantId || !categoryId) {
    return { success: false, error: 'معرف غير صالح' };
  }

  // Check if has children
  const hasChildren = existingCategories.some((c) => c.parentId === categoryId);
  if (hasChildren) {
    return { success: false, error: 'لا يمكن حذف التصنيف لوجود تصنيفات فرعية تابعة له. يرجى نقلها أو حذفها أولاً.' };
  }

  // Check if has products in Firestore
  const qProducts = query(
    collection(db, 'products'),
    where('tenantId', '==', tenantId),
    where('categoryId', '==', categoryId)
  );
  const snapProd = await getDocs(qProducts);
  if (!snapProd.empty) {
    return { success: false, error: `لا يمكن حذف هذا التصنيف لأنه مرتبط بـ ${snapProd.docs.length} منتج مسجل في النظام. يمكنك تعطيله بدلاً من حذفه.` };
  }

  try {
    await deleteDoc(doc(db, 'categories', categoryId));
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'فشل في حذف التصنيف' };
  }
}
