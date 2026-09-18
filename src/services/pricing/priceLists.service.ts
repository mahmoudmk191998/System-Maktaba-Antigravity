/**
 * Retail Price Lists & Customer Contract Prices Service (Phase 8)
 * Manages price lists, items with quantity tiers, and customer-specific contract prices.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import type {
  PriceList,
  PriceListItem,
  CustomerProductPrice,
  CustomerType,
} from '@/types/retail.types';

export interface CreatePriceListInput {
  tenantId: string;
  name: string;
  description?: string;
  customerType?: CustomerType;
  priority?: number;
  validFrom?: string;
  validTo?: string;
}

export interface SetPriceListItemInput {
  tenantId: string;
  priceListId: string;
  productId: string;
  variantId?: string | null;
  productNameSnapshot?: string;
  skuSnapshot?: string;
  price: number;
  minimumQuantity?: number;
}

/**
 * Creates a new Price List
 */
export async function createPriceList(input: CreatePriceListInput): Promise<PriceList> {
  const { tenantId, name, description, customerType, priority = 1, validFrom, validTo } = input;
  if (!tenantId || !name) throw new Error('اسم قائمة الأسعار ومُعرّف المؤسسة إلزامي');

  const ref = doc(collection(db, 'price_lists'));
  const now = new Date().toISOString();

  const priceList: PriceList = {
    id: ref.id,
    tenantId,
    name: name.trim(),
    description: description?.trim() || '',
    customerType,
    active: true,
    priority: Number(priority) || 1,
    validFrom: validFrom || undefined,
    validTo: validTo || undefined,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(ref, priceList);
  return priceList;
}

/**
 * Updates an existing Price List
 */
export async function updatePriceList(
  priceListId: string,
  tenantId: string,
  updates: Partial<CreatePriceListInput> & { active?: boolean }
): Promise<void> {
  const ref = doc(db, 'price_lists', priceListId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('قائمة الأسعار غير موجودة');
  if (snap.data().tenantId !== tenantId) throw new Error('غير مصرح بتعديل هذه القائمة');

  await updateDoc(ref, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Sets (creates or updates) an item price inside a Price List
 */
export async function setPriceListItem(input: SetPriceListItemInput): Promise<PriceListItem> {
  const {
    tenantId,
    priceListId,
    productId,
    variantId = null,
    productNameSnapshot = '',
    skuSnapshot = '',
    price,
    minimumQuantity = 1,
  } = input;

  const docId = `${priceListId}_${productId}_${variantId || 'base'}`;
  const ref = doc(db, 'price_list_items', docId);

  const item: PriceListItem = {
    id: docId,
    priceListId,
    tenantId,
    productId,
    variantId: variantId || null,
    productNameSnapshot,
    skuSnapshot,
    price: Number(price),
    minimumQuantity: Math.max(1, Number(minimumQuantity) || 1),
    active: true,
  };

  await setDoc(ref, item, { merge: true });
  return item;
}

/**
 * Fetches all items for a Price List
 */
export async function getPriceListItems(priceListId: string): Promise<PriceListItem[]> {
  const q = query(
    collection(db, 'price_list_items'),
    where('priceListId', '==', priceListId),
    where('active', '==', true)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as PriceListItem);
}

/**
 * Fetches all active Price Lists for tenant
 */
export async function getPriceLists(tenantId: string): Promise<PriceList[]> {
  const q = query(
    collection(db, 'price_lists'),
    where('tenantId', '==', tenantId),
    where('active', '==', true),
    orderBy('priority', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as PriceList);
}

/**
 * Sets a customer-specific contractual price for a product
 */
export async function setCustomerProductPrice(
  tenantId: string,
  customerId: string,
  productId: string,
  variantId: string | null,
  specialPrice: number,
  notes?: string
): Promise<CustomerProductPrice> {
  const docId = `${customerId}_${productId}_${variantId || 'base'}`;
  const ref = doc(db, 'customer_product_prices', docId);
  const now = new Date().toISOString();

  const record: CustomerProductPrice = {
    id: docId,
    tenantId,
    customerId,
    productId,
    variantId: variantId || null,
    specialPrice: Number(specialPrice),
    notes: notes || '',
    active: true,
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(ref, record, { merge: true });
  return record;
}

/**
 * Fetches all customer-specific special prices for a customer
 */
export async function getCustomerProductPrices(
  tenantId: string,
  customerId: string
): Promise<CustomerProductPrice[]> {
  const q = query(
    collection(db, 'customer_product_prices'),
    where('tenantId', '==', tenantId),
    where('customerId', '==', customerId),
    where('active', '==', true)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as CustomerProductPrice);
}
