/**
 * Held Sales (Suspended Cart) Service
 * Allows cashiers to park/suspend an active cart and serve another customer.
 * Suspended carts are drafts that do NOT deduct on-hand stock.
 * Full revalidation of prices and stock occurs at final checkout upon resuming.
 */

import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  deleteDoc,
} from 'firebase/firestore';
import type { HeldSale, SaleItem } from '@/types/retail.types';

export interface HoldSaleParams {
  tenantId: string;
  branchId: string;
  cashierId: string;
  items: SaleItem[];
  customerSnapshot?: any;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  notes?: string;
}

/**
 * Saves a suspended cart to Firestore
 */
export async function holdCurrentSale(
  params: HoldSaleParams
): Promise<{ success: boolean; heldId?: string; error?: string }> {
  const { tenantId, branchId, cashierId, items, customerSnapshot, subtotal, discount, tax, total, notes } = params;

  if (!items || items.length === 0) {
    return { success: false, error: 'لا يمكن تعليق سلة فارغة' };
  }

  const now = new Date().toISOString();
  const heldData: Omit<HeldSale, 'id'> = {
    tenantId,
    branchId,
    cashierId,
    customerSnapshot: customerSnapshot || null,
    items,
    subtotal,
    discount,
    tax,
    total,
    heldAt: now,
    notes: notes || '',
  };

  const docRef = await addDoc(collection(db, 'held_sales'), heldData);
  return { success: true, heldId: docRef.id };
}

/**
 * Retrieves all held sales for a branch
 */
export async function fetchHeldSales(
  tenantId: string,
  branchId: string
): Promise<HeldSale[]> {
  if (!tenantId || !branchId) return [];

  const q = query(
    collection(db, 'held_sales'),
    where('tenantId', '==', tenantId),
    where('branchId', '==', branchId),
    orderBy('heldAt', 'desc')
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as HeldSale));
}

/**
 * Deletes or discards a held sale (e.g. after it was resumed or cancelled)
 */
export async function removeHeldSale(heldId: string): Promise<boolean> {
  if (!heldId) return false;
  try {
    await deleteDoc(doc(db, 'held_sales', heldId));
    return true;
  } catch (err) {
    console.error('Failed to remove held sale:', err);
    return false;
  }
}
