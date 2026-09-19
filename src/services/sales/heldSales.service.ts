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
  addDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import type { HeldSale, SaleItem } from '@/types/retail.types';
import { removeUndefinedFields } from '@/lib/utils';

export interface HoldSaleParams {
  tenantId: string;
  branchId: string;
  cashierId: string;
  items: SaleItem[] | any[];
  customerSnapshot?: any;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  notes?: string;
  cartDiscountType?: 'percentage' | 'fixed';
  cartDiscountValue?: number;
}

const LOCAL_STORAGE_PREFIX = 'pos_held_sales_';

function getLocalHeldSales(tenantId: string): HeldSale[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${tenantId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalHeldSales(tenantId: string, sales: HeldSale[]): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${tenantId}`, JSON.stringify(sales));
  } catch (err) {
    console.warn('Failed saving held sales to localStorage:', err);
  }
}

/**
 * Saves a suspended cart to Firestore and localStorage
 */
export async function holdCurrentSale(
  params: HoldSaleParams
): Promise<{ success: boolean; heldId?: string; error?: string }> {
  const { tenantId, branchId, cashierId, items, customerSnapshot, subtotal, discount, tax, total, notes, cartDiscountType, cartDiscountValue } = params;

  if (!items || items.length === 0) {
    return { success: false, error: 'لا يمكن تعليق سلة فارغة' };
  }

  const now = new Date().toISOString();
  const effTenant = tenantId || 'default-tenant';
  const effBranch = branchId || 'main';

  const rawData: any = {
    tenantId: effTenant,
    branchId: effBranch,
    cashierId: cashierId || 'كاشير',
    customerSnapshot: customerSnapshot || null,
    items,
    subtotal: subtotal || 0,
    discount: discount || 0,
    tax: tax || 0,
    total: total || 0,
    heldAt: now,
    notes: notes || '',
    cartDiscountType: cartDiscountType || 'fixed',
    cartDiscountValue: cartDiscountValue || 0,
  };

  const cleanData = removeUndefinedFields(rawData);

  let generatedId = `held_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Try saving to Firestore
  try {
    const docRef = await addDoc(collection(db, 'held_sales'), cleanData);
    if (docRef?.id) {
      generatedId = docRef.id;
    }
  } catch (err) {
    console.warn('Firestore addDoc for held sale failed, using local storage fallback:', err);
  }

  // Dual sync to localStorage
  try {
    const localSales = getLocalHeldSales(effTenant);
    const newEntry: HeldSale = {
      id: generatedId,
      ...cleanData,
    };
    const updated = [newEntry, ...localSales.filter((s) => s.id !== generatedId)];
    saveLocalHeldSales(effTenant, updated);
  } catch (err) {
    console.warn('localStorage sync failed for held sale:', err);
  }

  return { success: true, heldId: generatedId };
}

/**
 * Retrieves all held sales for a branch safely (no index requirement)
 */
export async function fetchHeldSales(
  tenantId: string,
  branchId?: string
): Promise<HeldSale[]> {
  const effTenant = tenantId || 'default-tenant';
  const effBranch = branchId || 'main';

  let firestoreSales: HeldSale[] = [];

  try {
    // Only filter by tenantId to avoid composite index requirement
    const q = query(collection(db, 'held_sales'), where('tenantId', '==', effTenant));
    const snap = await getDocs(q);
    firestoreSales = snap.docs.map((d) => ({ id: d.id, ...d.data() } as HeldSale));
  } catch (err) {
    console.warn('Failed querying held_sales from Firestore, using localStorage:', err);
  }

  // Merge with localStorage
  const localSales = getLocalHeldSales(effTenant);
  const salesMap = new Map<string, HeldSale>();

  for (const s of firestoreSales) {
    salesMap.set(s.id, s);
  }
  for (const s of localSales) {
    if (!salesMap.has(s.id)) {
      salesMap.set(s.id, s);
    }
  }

  let allSales = Array.from(salesMap.values());

  // In-memory branch filter
  if (effBranch && effBranch !== 'all') {
    allSales = allSales.filter((s) => !s.branchId || s.branchId === effBranch || s.branchId === 'main');
  }

  // In-memory sort by heldAt descending
  allSales.sort((a, b) => new Date(b.heldAt || 0).getTime() - new Date(a.heldAt || 0).getTime());

  return allSales;
}

/**
 * Deletes or discards a held sale (e.g. after it was resumed or cancelled)
 */
export async function removeHeldSale(heldId: string, tenantId?: string): Promise<boolean> {
  if (!heldId) return false;

  // Try Firestore deletion
  try {
    await deleteDoc(doc(db, 'held_sales', heldId));
  } catch (err) {
    console.warn('Failed removing held sale from Firestore:', err);
  }

  // Remove from localStorage
  try {
    const effTenant = tenantId || 'default-tenant';
    const localSales = getLocalHeldSales(effTenant);
    saveLocalHeldSales(effTenant, localSales.filter((s) => s.id !== heldId));
  } catch (err) {
    console.warn('Failed removing held sale from localStorage:', err);
  }

  return true;
}

/**
 * Gets the total count of currently held sales
 */
export async function getHeldSalesCount(tenantId: string, branchId?: string): Promise<number> {
  try {
    const sales = await fetchHeldSales(tenantId, branchId);
    return sales.length;
  } catch {
    return 0;
  }
}

/**
 * Subscribes to real-time changes of held sales in Firestore (with localStorage fallback and window event)
 */
export function subscribeToHeldSales(
  tenantId: string,
  branchId: string | undefined,
  callback: (sales: HeldSale[]) => void
): () => void {
  const effTenant = tenantId || 'default-tenant';
  const effBranch = branchId || 'main';

  let unsubFirestore: (() => void) | null = null;

  const pushMerged = (firestoreSales: HeldSale[]) => {
    const localSales = getLocalHeldSales(effTenant);
    const salesMap = new Map<string, HeldSale>();

    for (const s of firestoreSales) {
      salesMap.set(s.id, s);
    }
    for (const s of localSales) {
      if (!salesMap.has(s.id)) {
        salesMap.set(s.id, s);
      }
    }

    let allSales = Array.from(salesMap.values());
    if (effBranch && effBranch !== 'all') {
      allSales = allSales.filter((s) => !s.branchId || s.branchId === effBranch || s.branchId === 'main');
    }
    allSales.sort((a, b) => new Date(b.heldAt || 0).getTime() - new Date(a.heldAt || 0).getTime());
    callback(allSales);
  };

  // Initial local push
  pushMerged([]);

  try {
    const q = query(collection(db, 'held_sales'), where('tenantId', '==', effTenant));
    unsubFirestore = onSnapshot(
      q,
      (snap) => {
        const firestoreSales = snap.docs.map((d) => ({ id: d.id, ...d.data() } as HeldSale));
        pushMerged(firestoreSales);
      },
      (err) => {
        console.warn('onSnapshot error in subscribeToHeldSales, using local data:', err);
        pushMerged([]);
      }
    );
  } catch (err) {
    console.warn('Failed setting onSnapshot for held sales:', err);
  }

  // Also listen for cross-window / same-tab storage events
  const onStorage = (e: StorageEvent) => {
    if (e.key === `${LOCAL_STORAGE_PREFIX}${effTenant}`) {
      pushMerged([]);
    }
  };
  window.addEventListener('storage', onStorage);

  return () => {
    if (unsubFirestore) unsubFirestore();
    window.removeEventListener('storage', onStorage);
  };
}

