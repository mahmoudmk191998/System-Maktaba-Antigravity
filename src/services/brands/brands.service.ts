/**
 * Brands Management Service for Bookstore & Stationery
 * Manages stationery brands (BIC, Staedtler, Faber-Castell, etc.) and publishers.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
} from 'firebase/firestore';
import type { Brand } from '@/types/retail.types';

export const POPULAR_DEFAULT_BRANDS = [
  'BIC',
  'Faber-Castell',
  'Staedtler',
  'Rotring',
  'Casio',
  'Pilot',
  'Uni-ball',
  'Zebra',
  'Double A',
  'HP',
  'Canon',
  'سلاح التلميذ',
  'الأضواء',
  'المعاصر',
  'دار الشروق',
  'دار المعارف',
];

export async function fetchBrandsFromDb(tenantId: string): Promise<Brand[]> {
  if (!tenantId) return [];

  const q = query(collection(db, 'brands'), where('tenantId', '==', tenantId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as Brand[];
}

export async function saveBrandToDb(
  tenantId: string,
  brandData: Omit<Brand, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'> & { id?: string }
): Promise<{ success: boolean; brand?: Brand; error?: string }> {
  if (!tenantId) {
    return { success: false, error: 'معرف المؤسسة غير متوفر' };
  }

  if (!brandData.name || brandData.name.trim() === '') {
    return { success: false, error: 'اسم الماركة أو دار النشر مطلوب' };
  }

  const brandId = brandData.id || doc(collection(db, 'brands')).id;
  const now = new Date().toISOString();
  const brandRef = doc(db, 'brands', brandId);

  const finalBrand: Brand = {
    id: brandId,
    tenantId,
    name: brandData.name.trim(),
    nameAr: brandData.nameAr || brandData.name.trim(),
    nameEn: brandData.nameEn || '',
    logo: brandData.logo || '',
    active: brandData.active !== undefined ? brandData.active : true,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(brandRef, finalBrand);
    return { success: true, brand: finalBrand };
  } catch (err: any) {
    console.error('Failed to save brand:', err);
    return { success: false, error: err?.message || 'فشل في حفظ الماركة' };
  }
}

export async function deleteBrandFromDb(
  tenantId: string,
  brandId: string
): Promise<{ success: boolean; error?: string }> {
  if (!tenantId || !brandId) {
    return { success: false, error: 'معرف غير صالح' };
  }

  // Check if any product is using this brand
  const qProd = query(
    collection(db, 'products'),
    where('tenantId', '==', tenantId),
    where('brandId', '==', brandId)
  );
  const snap = await getDocs(qProd);
  if (!snap.empty) {
    return {
      success: false,
      error: `لا يمكن حذف هذه العلامة التجارية لأنها مرتبطة بـ ${snap.docs.length} منتج مسجل. يمكنك تعطيلها بدلاً من حذفها.`,
    };
  }

  try {
    await deleteDoc(doc(db, 'brands', brandId));
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'فشل في حذف العلامة التجارية' };
  }
}
