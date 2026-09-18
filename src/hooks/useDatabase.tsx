import { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, doc, query, where, orderBy, getDocs, addDoc, updateDoc, deleteDoc, setDoc, getDoc, limit as fsLimit, increment, runTransaction } from 'firebase/firestore';
import { useAuth } from './useAuth';
import { useAppStore } from '@/lib/store';
import { toast } from 'sonner';
import { hashPin } from '@/lib/attendanceSecurity';
import { notifyLowStock, resolveLowStock } from '@/services/notifications.service';

const fetchCollection = async (
  colPath: string, 
  tenantId: string | null, 
  fieldObj: string = 'tenant_id', 
  orderByField?: string,
  orderByDir: 'asc' | 'desc' = 'asc',
  maxLimit?: number
) => {
  if (!tenantId) return [];
  const constraints: any[] = [where(fieldObj, '==', tenantId)];
  if (maxLimit && maxLimit > 0) {
    constraints.push(fsLimit(maxLimit));
  }
  const q = query(collection(db, colPath), ...constraints);
  const snap = await getDocs(q);
  const data = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
  
  if (orderByField) {
    data.sort((a, b) => {
      const valA = a[orderByField];
      const valB = b[orderByField];
      // Handle string or number sorting
      if (valA < valB) return orderByDir === 'asc' ? -1 : 1;
      if (valA > valB) return orderByDir === 'asc' ? 1 : -1;
      return 0;
    });
  }
  return data;
};

// Get or create tenant and branch for current user
export function useTenantBranch() {
  const { user } = useAuth();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const init = async () => {
      try {
        const profileRef = doc(db, 'profiles', user.uid);
        const profileSnap = await getDoc(profileRef);
        let profile = profileSnap.exists() ? profileSnap.data() : null;

        const effectiveTenantId = profile?.tenantId || profile?.tenant_id;
        if (effectiveTenantId) {
          setTenantId(effectiveTenantId);

          // Guarantee profile document contains role for Firestore security rules
          if (!profile.role) {
            try {
              const rolesQ = query(collection(db, 'user_roles'), where('user_id', '==', user.uid), fsLimit(1));
              const rolesSnap = await getDocs(rolesQ);
              const userRole = !rolesSnap.empty ? rolesSnap.docs[0].data().role : 'admin';
              await updateDoc(profileRef, { role: userRole });
              profile.role = userRole;
            } catch {
              // Non-blocking sync
            }
          }
          
          let resolvedBranchId = profile.branchId || profile.branch_id;
          let branchName = 'الفرع الرئيسي';
          let branchAddress = '';
          let branchPhone = '';
          let branchOpeningTime = '08:00';
          let branchClosingTime = '23:00';

          if (resolvedBranchId) {
            setBranchId(resolvedBranchId);
            const bDoc = await getDoc(doc(db, 'branches', resolvedBranchId));
            if (bDoc.exists()) {
              const bData = bDoc.data();
              branchName = bData.name || 'الفرع الرئيسي';
              branchAddress = bData.address || '';
              branchPhone = bData.phone || '';
              branchOpeningTime = bData.opening_time || '08:00';
              branchClosingTime = bData.closing_time || '23:00';
            }
          } else {
            // Get first branch
            const q = query(collection(db, 'branches'), where('tenant_id', '==', effectiveTenantId), fsLimit(1));
            const branchSnap = await getDocs(q);
            if (!branchSnap.empty) {
              const bId = branchSnap.docs[0].id;
              setBranchId(bId);
              resolvedBranchId = bId;
              const bData = branchSnap.docs[0].data();
              branchName = bData.name || 'الفرع الرئيسي';
              branchAddress = bData.address || '';
              branchPhone = bData.phone || '';
              branchOpeningTime = bData.opening_time || '08:00';
              branchClosingTime = bData.closing_time || '23:00';
            } else {
              // Create default branch
              const newBranch = await addDoc(collection(db, 'branches'), { 
                tenant_id: effectiveTenantId, 
                name: 'الفرع الرئيسي',
                address: '',
                phone: '',
                opening_time: '08:00',
                closing_time: '23:00'
              });
              setBranchId(newBranch.id);
              await updateDoc(profileRef, { branch_id: newBranch.id });
              resolvedBranchId = newBranch.id;
            }
          }
          
          // Load tenant and settings from db
          const tenantSnap = await getDoc(doc(db, 'tenants', effectiveTenantId));
          if (tenantSnap.exists()) {
            const tData = tenantSnap.data();
            useAppStore.getState().setCurrentTenant({ 
              id: effectiveTenantId, 
              name: tData.name || 'MK',
              nameEn: tData.name_en || '',
              taxNumber: tData.tax_number || '',
              logo: tData.logo || ''
            });
            if (tData.settings) {
              useAppStore.getState().updateSettings(tData.settings);
            }
          }

          if (resolvedBranchId) {
            useAppStore.getState().setCurrentBranch({ 
              id: resolvedBranchId, 
              tenantId: profile.tenant_id, 
              name: branchName, 
              address: branchAddress, 
              phone: branchPhone, 
              openingTime: branchOpeningTime,
              closingTime: branchClosingTime,
              isActive: true 
            });
          }
        } else {
          // Create tenant, branch, assign to profile
          const newTenant = await addDoc(collection(db, 'tenants'), { name: 'MK' });
          setTenantId(newTenant.id);
          const newBranch = await addDoc(collection(db, 'branches'), { tenant_id: newTenant.id, name: 'الفرع الرئيسي' });
          setBranchId(newBranch.id);
          await setDoc(profileRef, { tenant_id: newTenant.id, branch_id: newBranch.id, role: 'admin' }, { merge: true });
          
          useAppStore.getState().setCurrentTenant({ id: newTenant.id, name: 'MK' });
          useAppStore.getState().setCurrentBranch({ 
            id: newBranch.id, 
            tenantId: newTenant.id, 
            name: 'الفرع الرئيسي', 
            address: '', 
            phone: '', 
            isActive: true 
          });
          
          await addDoc(collection(db, 'user_roles'), { user_id: user.uid, role: 'admin' });
          
          const defaultUnits = [
            // Weight
            { name: 'كيلوجرام', abbreviation: 'كجم', type: 'weight', tenant_id: newTenant.id },
            { name: 'جرام', abbreviation: 'جم', type: 'weight', tenant_id: newTenant.id },
            { name: 'مليجرام', abbreviation: 'مجم', type: 'weight', tenant_id: newTenant.id },
            { name: 'أوقية (أونصة)', abbreviation: 'oz', type: 'weight', tenant_id: newTenant.id },
            { name: 'رطل (باوند)', abbreviation: 'lb', type: 'weight', tenant_id: newTenant.id },
            // Volume
            { name: 'لتر', abbreviation: 'لتر', type: 'volume', tenant_id: newTenant.id },
            { name: 'مليلتر', abbreviation: 'مل', type: 'volume', tenant_id: newTenant.id },
            { name: 'جالون', abbreviation: 'gal', type: 'volume', tenant_id: newTenant.id },
            { name: 'كوب', abbreviation: 'كوب', type: 'volume', tenant_id: newTenant.id },
            { name: 'ملعقة كبيرة', abbreviation: 'م.ك', type: 'volume', tenant_id: newTenant.id },
            { name: 'ملعقة صغيرة', abbreviation: 'م.ص', type: 'volume', tenant_id: newTenant.id },
            // Count/Pieces
            { name: 'قطعة', abbreviation: 'قطعة', type: 'count', tenant_id: newTenant.id },
            { name: 'حبة', abbreviation: 'حبة', type: 'count', tenant_id: newTenant.id },
            { name: 'كرتونة', abbreviation: 'كرتونة', type: 'count', tenant_id: newTenant.id },
            { name: 'علبة', abbreviation: 'علبة', type: 'count', tenant_id: newTenant.id },
            { name: 'دستة', abbreviation: 'دستة', type: 'count', tenant_id: newTenant.id },
            { name: 'كيس', abbreviation: 'كيس', type: 'count', tenant_id: newTenant.id },
            { name: 'شريحة', abbreviation: 'شريحة', type: 'count', tenant_id: newTenant.id },
            { name: 'حزمة', abbreviation: 'حزمة', type: 'count', tenant_id: newTenant.id },
            // Length
            { name: 'متر', abbreviation: 'م', type: 'length', tenant_id: newTenant.id },
            { name: 'سنتيمتر', abbreviation: 'سم', type: 'length', tenant_id: newTenant.id },
          ];
          for (const u of defaultUnits) await addDoc(collection(db, 'units'), u);
          
          const allPerms = [
            'dashboard.view','pos.view','pos.create_order','pos.edit_order','pos.cancel_order','pos.apply_discount','pos.void_item','pos.refund','pos.open_drawer','pos.close_session',
            'kitchen.view','kitchen.update_status','kitchen.recall_order',
            'tables.view','tables.manage','reservations.view','reservations.create','reservations.edit','reservations.cancel',
            'menu.view','menu.create','menu.edit','menu.delete','menu.change_price','menu.toggle_availability','recipes.view','recipes.manage',
            'inventory.view','inventory.add','inventory.edit','inventory.delete','inventory.adjust','inventory.transfer','inventory.count',
            'purchasing.view','purchasing.create','purchasing.approve','purchasing.receive','suppliers.view','suppliers.manage',
            'delivery.view','delivery.assign','delivery.update_status','drivers.manage','zones.manage',
            'customers.view','customers.create','customers.edit','customers.delete','loyalty.view','loyalty.manage',
            'promotions.view','promotions.create','promotions.edit','promotions.delete','coupons.manage',
            'hr.view_employees','hr.manage_employees','hr.view_salaries','hr.manage_salaries','hr.manage_shifts','hr.view_attendance',
            'reports.sales','reports.inventory','reports.financial','reports.employees','reports.export',
            'settings.view','settings.general','settings.branch','settings.taxes','settings.printers',
            'audit.view','permissions.manage','users.manage',
          ];
          for (const p of allPerms) await addDoc(collection(db, 'user_permissions'), { user_id: user.uid, permission: p, granted_by: user.uid });
        }
      } catch (e) {
        console.error('Init error:', e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [user]);

  return { tenantId, branchId, loading };
}

// Generic CRUD hooks
export function useMenuCategories(tenantId: string | null) {
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const data = await fetchCollection('menu_categories', tenantId, 'tenant_id', 'sort_order');
    setCategories(data);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async (cat: any) => {
    try { await addDoc(collection(db, 'menu_categories'), { ...cat, tenant_id: tenantId }); toast.success('تمت إضافة الفئة'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };
  const update = async (id: string, cat: any) => {
    try { await updateDoc(doc(db, 'menu_categories', id), cat); toast.success('تم تحديث الفئة'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };
  const remove = async (id: string) => {
    try { await deleteDoc(doc(db, 'menu_categories', id)); toast.success('تم حذف الفئة'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };

  return { categories, loading, add, update, remove, refresh: fetch };
}

export function useMenuItems(tenantId: string | null) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!tenantId) return;
    const data = await fetchCollection('menu_items', tenantId, 'tenant_id', 'sort_order');
    // Simulate join with menu_categories if needed, for now just set data
    setItems(data);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async (item: any) => {
    try { await addDoc(collection(db, 'menu_items'), { ...item, tenant_id: tenantId }); toast.success('تمت إضافة الصنف'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };
  const update = async (id: string, item: any) => {
    try { await updateDoc(doc(db, 'menu_items', id), item); toast.success('تم تحديث الصنف'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };
  const remove = async (id: string) => {
    try { await deleteDoc(doc(db, 'menu_items', id)); toast.success('تم حذف الصنف'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };

  return { items, loading, add, update, remove, refresh: fetch };
}

export function useTables(branchId: string | null) {
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const data = await fetchCollection('tables', branchId, 'branch_id', 'table_number');
    setTables(data);
    setLoading(false);
  }, [branchId]);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async (table: any) => {
    try { await addDoc(collection(db, 'tables'), { ...table, branch_id: branchId }); toast.success('تمت إضافة الطاولة'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };
  const update = async (id: string, table: any) => {
    try { await updateDoc(doc(db, 'tables', id), table); toast.success('تم تحديث الطاولة'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };
  const remove = async (id: string) => {
    try { await deleteDoc(doc(db, 'tables', id)); toast.success('تم حذف الطاولة'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };

  return { tables, loading, add, update, remove, refresh: fetch };
}

export function useReservations(branchId: string | null) {
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const data = await fetchCollection('reservations', branchId, 'branch_id', 'reservation_date', 'desc');
    setReservations(data);
    setLoading(false);
  }, [branchId]);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async (res: any) => {
    try { await addDoc(collection(db, 'reservations'), { ...res, branch_id: branchId }); toast.success('تمت إضافة الحجز'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };
  const update = async (id: string, res: any) => {
    try { await updateDoc(doc(db, 'reservations', id), res); toast.success('تم تحديث الحجز'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };
  const remove = async (id: string) => {
    try { await deleteDoc(doc(db, 'reservations', id)); toast.success('تم حذف الحجز'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };

  return { reservations, loading, add, update, remove, refresh: fetch };
}

export function useInventoryItems(tenantId: string | null) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const data = await fetchCollection('inventory_items', tenantId, 'tenant_id', 'name');
    setItems(data);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async (item: any) => {
    try { 
      const docRef = await addDoc(collection(db, 'inventory_items'), { ...item, tenant_id: tenantId }); 
      toast.success('تمت إضافة الصنف'); 
      await fetch(); 
      return docRef.id; 
    } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };
  const update = async (id: string, item: any) => {
    try { await updateDoc(doc(db, 'inventory_items', id), item); toast.success('تم تحديث الصنف'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };
  const remove = async (id: string) => {
    try { await deleteDoc(doc(db, 'inventory_items', id)); toast.success('تم حذف الصنف'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };

  return { items, loading, add, update, remove, refresh: fetch };
}

export function useSuppliers(tenantId: string | null) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const data = await fetchCollection('suppliers', tenantId, 'tenant_id', 'name');
    setSuppliers(data);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async (supplier: any) => {
    try { await addDoc(collection(db, 'suppliers'), { ...supplier, tenant_id: tenantId }); toast.success('تمت إضافة المورد'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };
  const update = async (id: string, supplier: any) => {
    try { await updateDoc(doc(db, 'suppliers', id), supplier); toast.success('تم تحديث المورد'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };
  const remove = async (id: string) => {
    try { await deleteDoc(doc(db, 'suppliers', id)); toast.success('تم حذف المورد'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };

  return { suppliers, loading, add, update, remove, refresh: fetch };
}

export function usePurchaseOrders(tenantId: string | null) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const data = await fetchCollection('purchase_orders', tenantId, 'tenant_id', 'created_at', 'desc');
    setOrders(data);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async (order: any) => {
    try { await addDoc(collection(db, 'purchase_orders'), { ...order, tenant_id: tenantId }); toast.success('تمت إضافة أمر الشراء'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };
  const update = async (id: string, order: any) => {
    try { await updateDoc(doc(db, 'purchase_orders', id), order); toast.success('تم تحديث أمر الشراء'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };
  const remove = async (id: string) => {
    try { await deleteDoc(doc(db, 'purchase_orders', id)); toast.success('تم حذف أمر الشراء'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };

  return { orders, loading, add, update, remove, refresh: fetch };
}

export function useUnits(tenantId: string | null) {
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!tenantId) return;
    const data = await fetchCollection('units', tenantId, 'tenant_id', 'name');
    setUnits(data);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async (unit: any) => {
    try { await addDoc(collection(db, 'units'), { ...unit, tenant_id: tenantId }); toast.success('تمت إضافة الوحدة'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };
  const update = async (id: string, unit: any) => {
    try { await updateDoc(doc(db, 'units', id), unit); toast.success('تم تحديث الوحدة'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };
  const remove = async (id: string) => {
    try { await deleteDoc(doc(db, 'units', id)); toast.success('تم حذف الوحدة'); await fetch(); return true; } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };

  const seedStandardUnits = async () => {
    if (!tenantId) return;
    
    // First, fetch current units to avoid duplicates
    const currentUnits = await fetchCollection('units', tenantId, 'tenant_id', 'name');
    const existingNames = currentUnits.map((u: any) => u.name);

    const defaultUnits = [
      // Weight
      { name: 'كيلوجرام', abbreviation: 'كجم', type: 'weight' },
      { name: 'جرام', abbreviation: 'جم', type: 'weight' },
      { name: 'مليجرام', abbreviation: 'مجم', type: 'weight' },
      { name: 'أوقية (أونصة)', abbreviation: 'oz', type: 'weight' },
      { name: 'رطل (باوند)', abbreviation: 'lb', type: 'weight' },
      // Volume
      { name: 'لتر', abbreviation: 'لتر', type: 'volume' },
      { name: 'مليلتر', abbreviation: 'مل', type: 'volume' },
      { name: 'جالون', abbreviation: 'gal', type: 'volume' },
      { name: 'كوب', abbreviation: 'كوب', type: 'volume' },
      { name: 'ملعقة كبيرة', abbreviation: 'م.ك', type: 'volume' },
      { name: 'ملعقة صغيرة', abbreviation: 'م.ص', type: 'volume' },
      // Count/Pieces
      { name: 'قطعة', abbreviation: 'قطعة', type: 'count' },
      { name: 'حبة', abbreviation: 'حبة', type: 'count' },
      { name: 'كرتونة', abbreviation: 'كرتونة', type: 'count' },
      { name: 'علبة', abbreviation: 'علبة', type: 'count' },
      { name: 'دستة', abbreviation: 'دستة', type: 'count' },
      { name: 'كيس', abbreviation: 'كيس', type: 'count' },
      { name: 'شريحة', abbreviation: 'شريحة', type: 'count' },
      { name: 'حزمة', abbreviation: 'حزمة', type: 'count' },
      // Length
      { name: 'متر', abbreviation: 'م', type: 'length' },
      { name: 'سنتيمتر', abbreviation: 'سم', type: 'length' },
    ];

    let addedCount = 0;
    try {
      for (const u of defaultUnits) {
        if (!existingNames.includes(u.name)) {
          await addDoc(collection(db, 'units'), { ...u, tenant_id: tenantId });
          addedCount++;
        }
      }
      if (addedCount > 0) {
        toast.success(`تم إضافة ${addedCount} وحدة قياس قياسية بنجاح`);
        await fetch();
      } else {
        toast.info('جميع الوحدات القياسية موجودة بالفعل');
      }
      return true;
    } catch (e: any) {
      toast.error('خطأ في إضافة الوحدات القياسية: ' + e.message);
      return false;
    }
  };

  return { units, loading, add, update, remove, seedStandardUnits, refresh: fetch };
}

export function useRecipes(tenantId: string | null) {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!tenantId) return;
    try {
      const recipesData = await fetchCollection('recipes', tenantId, 'tenant_id', 'name');
      const ingredientsQ = query(collection(db, 'recipe_ingredients'));
      const ingredientsSnap = await getDocs(ingredientsQ);
      const allIngredients = ingredientsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      
      const itemsData = await fetchCollection('inventory_items', tenantId, 'tenant_id');

      const recipesWithIngredients = recipesData.map((rec: any) => {
        const recIngs = allIngredients.filter(ing => ing.recipe_id === rec.id).map(ing => {
          const matchedItem = itemsData.find((i: any) => i.id === ing.item_id);
          return { ...ing, inventory_items: matchedItem };
        });
        return { ...rec, recipe_ingredients: recIngs };
      });
      
      setRecipes(recipesWithIngredients);
    } catch(e) { console.error('Error fetching recipes', e); }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetch(); }, [fetch]);

  const add = async (recipe: any, ingredients: any[]) => {
    try {
      const recDoc = await addDoc(collection(db, 'recipes'), { ...recipe, tenant_id: tenantId });
      if (ingredients.length > 0) {
        for (const ing of ingredients) {
          await addDoc(collection(db, 'recipe_ingredients'), { ...ing, recipe_id: recDoc.id });
        }
      }
      toast.success('تمت إضافة الوصفة');
      await fetch();
      return true;
    } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };

  const remove = async (id: string) => {
    try {
      // Ignore deleting from recipe_ingredients since no atomic delete easily, just delete recipe
      await deleteDoc(doc(db, 'recipes', id));
      toast.success('تم حذف الوصفة');
      await fetch();
      return true;
    } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };

  const update = async (id: string, recipe: any, ingredients: any[]) => {
    try {
      // 1. Update recipe basic info
      await updateDoc(doc(db, 'recipes', id), recipe);
      
      // 2. Clear old ingredients
      const ingredientsQ = query(collection(db, 'recipe_ingredients'), where('recipe_id', '==', id));
      const ingredientsSnap = await getDocs(ingredientsQ);
      for (const d of ingredientsSnap.docs) {
        await deleteDoc(doc(db, 'recipe_ingredients', d.id));
      }

      // 3. Add new ingredients
      if (ingredients.length > 0) {
        for (const ing of ingredients) {
          await addDoc(collection(db, 'recipe_ingredients'), { ...ing, recipe_id: id });
        }
      }
      
      toast.success('تم تحديث الوصفة بنجاح');
      await fetch();
      return true;
    } catch (e: any) { 
      toast.error('خطأ في التحديث: ' + e.message); 
      return false; 
    }
  };

  return { recipes, loading, add, update, remove, refresh: fetch };
}

export function usePOSShift(tenantId: string | null, branchId: string | null, userId: string | null) {
  const [activeShift, setActiveShift] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchActiveShift = useCallback(async () => {
    if (!tenantId || !branchId || !userId) {
      setLoading(false);
      return;
    }
    try {
      // Fetch by branch to avoid composite index errors, then filter locally
      const q = query(collection(db, 'pos_shifts'), where('branch_id', '==', branchId));
      const snap = await getDocs(q);
      const shifts = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      const active = shifts.find(s => s.cashier_id === userId && s.status === 'active');
      setActiveShift(active || null);
    } catch (e) {
      console.error('Error fetching POS shift:', e);
    } finally {
      setLoading(false);
    }
  }, [tenantId, branchId, userId]);

  useEffect(() => {
    fetchActiveShift();
  }, [fetchActiveShift]);

  const startShift = async (startingCash: number, cashierName: string, cashierRole: string = 'كاشير') => {
    try {
      const shiftData = {
        tenant_id: tenantId,
        branch_id: branchId,
        cashier_id: userId,
        cashier_name: cashierName,
        cashier_role: cashierRole,
        start_time: new Date().toISOString(),
        starting_cash: startingCash,
        status: 'active'
      };
      const docRef = await addDoc(collection(db, 'pos_shifts'), shiftData);
      setActiveShift({ id: docRef.id, ...shiftData });
      toast.success('تم فتح الشيفت بنجاح');
      return docRef.id;
    } catch (e: any) {
      toast.error('خطأ في فتح الشيفت: ' + e.message);
      return null;
    }
  };

  const closeShift = async (shiftId: string, closingData: any) => {
    try {
      await updateDoc(doc(db, 'pos_shifts', shiftId), {
        ...closingData,
        end_time: new Date().toISOString(),
        status: 'closed'
      });
      setActiveShift(null);
      toast.success('تم إغلاق الشيفت بنجاح');
      return true;
    } catch (e: any) {
      toast.error('خطأ في إغلاق الشيفت: ' + e.message);
      return false;
    }
  };

  return { activeShift, loading, startShift, closeShift, refresh: fetchActiveShift };
}

export function useOrders(tenantId: string | null, branchId: string | null) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const data = await fetchCollection('orders', tenantId, 'tenant_id', 'created_at', 'desc');
    setOrders(data);
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetch(); }, [fetch]);

  const createOrder = async (orderData: any, items: any[]) => {
    try {
      if (!branchId || !tenantId) throw new Error("Branch ID or Tenant ID missing");

      // Generate continuous Sequential Order Number using transactions, reusing deleted numbers if available
      const counterRef = doc(db, 'branch_counters', branchId);
      const newOrderNumber = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let newNumber = 1;
        if (counterDoc.exists()) {
          const data = counterDoc.data();
          const reusableNumbers: number[] = data.reusable_numbers || [];
          
          if (reusableNumbers.length > 0) {
            // Find the smallest reusable number to fill the gap
            newNumber = Math.min(...reusableNumbers);
            // Remove it from the reusable list
            const updatedReusable = reusableNumbers.filter(n => n !== newNumber);
            transaction.update(counterRef, { reusable_numbers: updatedReusable });
            return newNumber;
          }
          
          newNumber = (data.last_order_number || 0) + 1;
          transaction.update(counterRef, { last_order_number: newNumber });
        } else {
          transaction.set(counterRef, { last_order_number: newNumber, branch_id: branchId, reusable_numbers: [] });
        }
        return newNumber;
      });

      const orderNumberStr = `#${newOrderNumber}`;

      const order = await addDoc(collection(db, 'orders'), {
        tenant_id: tenantId,
        branch_id: branchId,
        order_number: orderNumberStr,
        order_type: orderData.orderType || 'dine_in',
        table_id: orderData.tableId || null,
        table_number: orderData.tableNumber || null,
        customer_id: orderData.customerId || null,
        customer_name: orderData.customerName || null,
        customer_phone: orderData.customerPhone || null,
        customer_address: orderData.customerAddress || null,
        delivery_zone_id: orderData.delivery_zone_id || null,
        delivery_fee: orderData.delivery_fee || 0,
        subtotal: orderData.subtotal,
        discount_amount: orderData.discount || 0,
        total: orderData.total,
        status: 'pending',
        payment_status: 'pending',
        payment_method: orderData.paymentMethod || 'cash',
        created_by: orderData.createdBy,
        shift_id: orderData.shiftId || null,
        notes: orderData.notes || null,
        created_at: new Date().toISOString()
      });

      if (items.length > 0) {
        for (const item of items) {
          await addDoc(collection(db, 'order_items'), {
            order_id: order.id,
            menu_item_id: item.menuItemId || null,
            category_id: item.categoryId || 'general',
            name: item.name,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            cost: item.cost || 0,
            status: 'pending'
          });
        }
      }

      await fetch();
      return { id: order.id, order_number: orderNumberStr };
    } catch (e: any) { toast.error('خطأ في إنشاء الطلب: ' + e.message); return null; }
  };

  return { orders, loading, createOrder, refresh: fetch };
}

export const confirmKitchenOrder = async (orderId: string) => {
  try {
    const orderDoc = await getDoc(doc(db, 'orders', orderId));
    if (!orderDoc.exists()) return false;
    const orderData = orderDoc.data();
    
    // Prevent double processing
    if (orderData.payment_status === 'paid' && orderData.status === 'ready') return true;
    
    const tenantId = orderData.tenant_id;
    const branchId = orderData.branch_id;
    const orderNumber = orderData.order_number;

    // 1. Mark status
    await updateDoc(doc(db, 'orders', orderId), {
      status: 'ready',
      payment_status: 'paid',
      updated_at: new Date().toISOString()
    });

    // 2. Add payment
    if (orderData.payment_method) {
      await addDoc(collection(db, 'payments'), {
        order_id: orderId,
        amount: orderData.total,
        method: orderData.payment_method,
        received_by: orderData.created_by || 'system',
        created_at: new Date().toISOString()
      });
    }

    // 3. Customer loyalty
    if (orderData.customer_id) {
       const pointsEarned = Math.floor(orderData.total / 10);
       const custRef = doc(db, 'customers', orderData.customer_id);
       await updateDoc(custRef, {
         total_spent: increment(orderData.total),
         points: increment(pointsEarned),
         visits: increment(1),
         last_visit: new Date().toISOString()
       });
    }

    // 4. Inventory Deduction (Recipes)
    const itemsQ = query(collection(db, 'order_items'), where('order_id', '==', orderId));
    const itemsSnap = await getDocs(itemsQ);
    const items = itemsSnap.docs.map(d => d.data());

    if (items.length > 0 && tenantId && branchId) {
       const recipesQ = query(collection(db, 'recipes'), where('tenant_id', '==', tenantId));
       const recipesSnap = await getDocs(recipesQ);
       const allRecipes = recipesSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

       if (allRecipes.length > 0) {
         const ingredientsQ = query(collection(db, 'recipe_ingredients'));
         const ingredientsSnap = await getDocs(ingredientsQ);
         const allIngredients = ingredientsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
         
         for (const item of items) {
           if (!item.menu_item_id) continue;
           const recipe = allRecipes.find((r: any) => r.menu_item_id === item.menu_item_id);
           if (recipe) {
             const recipeIng = allIngredients.filter((ri: any) => ri.recipe_id === recipe.id);
             for (const ing of recipeIng) {
                const consumedQty = Number(ing.quantity) * Number(item.quantity);
                if (consumedQty > 0) {
                  await addDoc(collection(db, 'stock_movements'), {
                     tenant_id: tenantId,
                     branch_id: branchId,
                     item_id: ing.item_id,
                     movement_type: 'consumption',
                     quantity: -consumedQty,
                     notes: `مبيعات للطلب ${orderNumber}`,
                     created_at: new Date().toISOString()
                  });
                  
                  const stockQ = query(collection(db, 'branch_stock'), where('branch_id', '==', branchId), where('item_id', '==', ing.item_id));
                  const exist = await getDocs(stockQ);
                  if (!exist.empty) {
                    const stockDoc = exist.docs[0];
                    await updateDoc(doc(db, 'branch_stock', stockDoc.id), {
                      quantity: increment(-consumedQty)
                    });
                  } else {
                     await addDoc(collection(db, 'branch_stock'), {
                       branch_id: branchId,
                       item_id: ing.item_id,
                       quantity: -consumedQty
                     });
                  }
                }
             }
           }
         }
       }
    }
    return true;
  } catch (err) {
    console.error("Error confirming order", err);
    return false;
  }
};

export function useKitchenOrders(tenantId: string | null, branchId: string | null, dateRangeObj?: { start: Date, end: Date }) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!tenantId || !branchId) return;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      const ordersQ = query(collection(db, 'orders'), where('branch_id', '==', branchId));
      const ordersSnap = await getDocs(ordersQ);
      const allOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      
      const activeOrders = allOrders.filter(o => {
        if (!o.created_at) return false;
        if (dateRangeObj) {
          const date = new Date(o.created_at);
          return date >= dateRangeObj.start && date <= dateRangeObj.end;
        } else {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const todayISO = today.toISOString();
          return o.created_at >= todayISO && (o.status === 'pending' || o.status === 'preparing' || o.status === 'ready' || o.status === 'delivered');
        }
      });
      
      if (activeOrders.length === 0) {
        setTickets([]);
        setLoading(false);
        return;
      }

      // Fetch items - simplify by fetching all for the active orders (in chunks if needed, but this is an MVP)
      const itemsQ = query(collection(db, 'order_items'));
      const itemsSnap = await getDocs(itemsQ);
      const allItems = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      const activeOrderIds = activeOrders.map(o => o.id);
      const activeItems = allItems.filter(i => activeOrderIds.includes(i.order_id));

      const constructedTickets = activeOrders.map(order => {
        const orderItems = activeItems.filter(i => i.order_id === order.id);
        // Skip orders with no items or all completed items
        if (orderItems.length === 0 || orderItems.every(i => i.status === 'completed')) return null;

        return {
          id: order.id,
          orderNumber: order.order_number,
          tableNumber: order.table_number || order.table_id || null,
          customerName: order.customer_name || null,
          type: order.order_type,
          status: order.status,
          priority: 'normal',
          createdAt: new Date(order.created_at),
          updatedAt: order.updated_at ? new Date(order.updated_at) : null,
          items: orderItems.map(i => ({
            id: i.id,
            categoryId: i.category_id || 'general',
            name: i.name,
            quantity: i.quantity,
            status: i.status || 'pending',
            notes: i.notes
          }))
        };
      }).filter(Boolean);

      constructedTickets.sort((a: any, b: any) => a.createdAt.getTime() - b.createdAt.getTime());
      setTickets(constructedTickets);
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [tenantId, branchId, dateRangeObj?.start, dateRangeObj?.end]);

  useEffect(() => { fetch(); }, [fetch]);

  const updateItemStatus = async (itemId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'order_items', itemId), { status: newStatus, updated_at: new Date().toISOString() });
      await fetch();
    } catch (e) { toast.error('خطأ في التحديث'); }
  };
  
  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status: newStatus, updated_at: new Date().toISOString() });
      await fetch();
    } catch (e) { toast.error('خطأ في التحديث'); }
  };

  return { tickets, loading, updateItemStatus, updateOrderStatus, refresh: fetch };
}

export function useBranchStock(branchId: string | null) {
  const [stock, setStock] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const data = await fetchCollection('branch_stock', branchId, 'branch_id');
    setStock(data);
    setLoading(false);
  }, [branchId]);

  useEffect(() => { fetch(); }, [fetch]);

  const initStock = async (itemId: string, quantity: number = 0) => {
    if (!branchId) return;
    try {
      const stockQ = query(collection(db, 'branch_stock'), where('branch_id', '==', branchId), where('item_id', '==', itemId));
      const exist = await getDocs(stockQ);
      if (exist.empty) {
        await addDoc(collection(db, 'branch_stock'), { branch_id: branchId, item_id: itemId, quantity });
      } else {
        await updateDoc(doc(db, 'branch_stock', exist.docs[0].id), { quantity });
      }
      await fetch();
    } catch (e) { console.error('Error init stock', e); }
  };

  return { stock, loading, initStock, refresh: fetch };
}

export function useStockMovements(branchId: string | null) {
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    const data = await fetchCollection('stock_movements', branchId, 'branch_id', 'created_at', 'desc');
    setMovements(data);
    setLoading(false);
  }, [branchId]);

  useEffect(() => { fetch(); }, [fetch]);

  const addMovement = async (movement: any) => {
    try {
      await addDoc(collection(db, 'stock_movements'), { ...movement, branch_id: branchId, created_at: new Date().toISOString() });
      if (movement.item_id) {
        const stockQ = query(collection(db, 'branch_stock'), where('branch_id', '==', branchId), where('item_id', '==', movement.item_id));
        const exist = await getDocs(stockQ);
        let finalQty = 0;
        if (!exist.empty) {
          const currentQty = exist.docs[0].data().quantity || 0;
          finalQty = Math.max(Number(currentQty) + Number(movement.quantity), 0);
          await updateDoc(doc(db, 'branch_stock', exist.docs[0].id), { quantity: finalQty, last_count_date: new Date().toISOString() });
        } else {
          finalQty = Math.max(Number(movement.quantity) || 0, 0);
          await addDoc(collection(db, 'branch_stock'), { branch_id: branchId, item_id: movement.item_id, quantity: finalQty });
        }

        if (branchId && movement.item_id) {
          try {
            const itemDoc = await getDoc(doc(db, 'inventory_items', movement.item_id));
            if (itemDoc.exists()) {
              const itemData = itemDoc.data();
              const minStock = Number(itemData?.min_stock_level || 0);
              if (minStock > 0) {
                if (finalQty <= minStock) {
                  await notifyLowStock(branchId, { id: movement.item_id, name: itemData.name, min_stock_level: minStock }, finalQty);
                } else {
                  await resolveLowStock(branchId, movement.item_id);
                }
              }
            }
          } catch (_) {}
        }
      }
      toast.success('تمت إضافة الحركة');
      await fetch();
      return true;
    } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };

  const updateMovement = async (id: string, oldMovement: any, newMovement: any) => {
    try {
      await updateDoc(doc(db, 'stock_movements', id), newMovement);
      if (oldMovement.item_id === newMovement.item_id) {
         const stockQ = query(collection(db, 'branch_stock'), where('branch_id', '==', branchId), where('item_id', '==', newMovement.item_id));
         const exist = await getDocs(stockQ);
         if (!exist.empty) {
           const currentQty = exist.docs[0].data().quantity || 0;
           const newQty = Math.max(Number(currentQty) - Number(oldMovement.quantity) + Number(newMovement.quantity), 0);
           await updateDoc(doc(db, 'branch_stock', exist.docs[0].id), { quantity: newQty, last_count_date: new Date().toISOString() });
         }
      } else {
         const oldStockQ = query(collection(db, 'branch_stock'), where('branch_id', '==', branchId), where('item_id', '==', oldMovement.item_id));
         const oldExist = await getDocs(oldStockQ);
         if (!oldExist.empty) {
           const currentQty = oldExist.docs[0].data().quantity || 0;
           await updateDoc(doc(db, 'branch_stock', oldExist.docs[0].id), { quantity: Math.max(Number(currentQty) - Number(oldMovement.quantity), 0) });
         }
         const newStockQ = query(collection(db, 'branch_stock'), where('branch_id', '==', branchId), where('item_id', '==', newMovement.item_id));
         const newExist = await getDocs(newStockQ);
         if (!newExist.empty) {
           const currentQty = newExist.docs[0].data().quantity || 0;
           await updateDoc(doc(db, 'branch_stock', newExist.docs[0].id), { quantity: Math.max(Number(currentQty) + Number(newMovement.quantity), 0) });
         } else {
           await addDoc(collection(db, 'branch_stock'), { branch_id: branchId, item_id: newMovement.item_id, quantity: Math.max(newMovement.quantity, 0) });
         }
      }
      toast.success('تم تحديث الحركة بنجاح');
      await fetch();
      return true;
    } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };

  const deleteMovement = async (id: string, itemId: string, oldQuantity: number) => {
    try {
      await deleteDoc(doc(db, 'stock_movements', id));
      if (itemId) {
         const stockQ = query(collection(db, 'branch_stock'), where('branch_id', '==', branchId), where('item_id', '==', itemId));
         const exist = await getDocs(stockQ);
         if (!exist.empty) {
           const currentQty = exist.docs[0].data().quantity || 0;
           const newQty = Math.max(Number(currentQty) - Number(oldQuantity), 0);
           await updateDoc(doc(db, 'branch_stock', exist.docs[0].id), { quantity: newQty, last_count_date: new Date().toISOString() });
         }
      }
      toast.success('تم حذف الحركة بنجاح');
      await fetch();
      return true;
    } catch (e: any) { toast.error('خطأ: ' + e.message); return false; }
  };

  return { movements, loading, addMovement, updateMovement, deleteMovement, refresh: fetch };
}

export function useDashboardStats(tenantId: string | null, branchId: string | null) {
  const [stats, setStats] = useState({
    todaySales: 0,
    yesterdaySales: 0,
    ordersCount: 0,
    yesterdayOrdersCount: 0,
    averageOrderValue: 0,
    pendingOrders: 0,
    completedOrders: 0,
    yesterdayCompletedOrders: 0,
    reservationsToday: 0,
    lowStockItems: 0,
    recentOrders: [] as any[],
    topSellingItems: [] as any[],
    revenueData: [] as any[],
    orderDistribution: [] as { name: string; value: number; fill: string }[],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    const fetchStats = async () => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayISO = today.toISOString();

        // Sales processing from live retail 'sales' collection
        let salesQ = query(collection(db, 'sales'), where('tenantId', '==', tenantId));
        let salesSnap = await getDocs(salesQ);
        let allOrders = salesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (allOrders.length === 0) {
          // Fallback to legacy orders if sales collection is empty
          const ordersSnap = await getDocs(query(collection(db, 'orders'), where('tenant_id', '==', tenantId)));
          allOrders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        }

        const todayTimestamp = today.getTime();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayTimestamp = yesterday.getTime();

        const todayOrders = allOrders.filter((s: any) => {
          if (branchId && branchId !== 'all' && (s.branchId || s.branch_id) && (s.branchId || s.branch_id) !== branchId) return false;
          const sDate = s.createdAt || s.created_at;
          if (!sDate) return false;
          return new Date(sDate).getTime() >= todayTimestamp;
        });
        const yesterdayOrders = allOrders.filter((s: any) => {
          if (branchId && branchId !== 'all' && (s.branchId || s.branch_id) && (s.branchId || s.branch_id) !== branchId) return false;
          const sDate = s.createdAt || s.created_at;
          if (!sDate) return false;
          const time = new Date(sDate).getTime();
          return time >= yesterdayTimestamp && time < todayTimestamp;
        });

        const paidOrders = todayOrders.filter((s: any) => s.status !== 'cancelled' && s.saleStatus !== 'cancelled');
        const todaySales = paidOrders.reduce((sum, s: any) => sum + Number(s.total || s.total_amount || 0), 0);
        const completedOrders = paidOrders;
        const pendingOrders = todayOrders.filter((s: any) => s.status === 'pending').length;

        const yesterdayPaidOrders = yesterdayOrders.filter((s: any) => s.status !== 'cancelled' && s.saleStatus !== 'cancelled');
        const yesterdaySales = yesterdayPaidOrders.reduce((sum, s: any) => sum + Number(s.total || s.total_amount || 0), 0);
        const yesterdayCompletedOrders = yesterdayPaidOrders.length;

        // Calculate sales distribution for today (cash vs electronic)
        const cashToday = paidOrders.filter((s: any) => {
          const pms = s.payments || s.paymentMethods || [];
          return pms.some((p: any) => String(p.method || '').toLowerCase() === 'cash') || String(s.payment_method || '').toLowerCase() === 'cash';
        }).length;
        const electronicToday = paidOrders.length - cashToday;

        const orderDistribution = [
          { name: 'نقدي (كاش)', value: cashToday, fill: '#10b981' },
          { name: 'إلكتروني / بطاقة', value: Math.max(0, electronicToday), fill: '#3b82f6' }
        ].filter(d => d.value > 0);

        const sortedOrders = [...allOrders].sort((a: any, b: any) => (b.createdAt || b.created_at || '').localeCompare(a.createdAt || a.created_at || ''));
        const recentOrders = sortedOrders.slice(0, 5);

        // Reservations processing
        const todayResCount = 0;

        // Calculate 7-day revenue trend
        const revenueData = [];
        for (let i = 6; i >= 0; i--) {
          const dStart = new Date();
          dStart.setHours(0, 0, 0, 0);
          dStart.setDate(dStart.getDate() - i);
          
          const dEnd = new Date(dStart);
          dEnd.setDate(dEnd.getDate() + 1);
          
          const daySales = allOrders.filter((s: any) => {
             if (branchId && branchId !== 'all' && (s.branchId || s.branch_id) && (s.branchId || s.branch_id) !== branchId) return false;
             const sDate = s.createdAt || s.created_at;
             if (!sDate) return false;
             if (s.status === 'cancelled' || s.saleStatus === 'cancelled') return false;
             const time = new Date(sDate).getTime();
             return time >= dStart.getTime() && time < dEnd.getTime();
          });
          const dayRevenue = daySales.reduce((sum, s: any) => sum + Number(s.total || s.total_amount || 0), 0);
          
          revenueData.push({
            date: dStart.toLocaleDateString('ar-EG', { weekday: 'short' }),
            revenue: dayRevenue
          });
        }

        // TopSellingItems calculation directly from items in sales
        const orderItemsMap = new Map();
        paidOrders.forEach((sale: any) => {
          const items = sale.items || [];
          items.forEach((item: any) => {
            const name = item.productName || item.name || 'صنف';
            const qty = Number(item.quantity || 0);
            const rev = Number(item.lineFinalTotal ?? item.lineTotal ?? (qty * (item.unitSellingPrice ?? item.price ?? 0)));
            const cur = orderItemsMap.get(name) || { count: 0, revenue: 0 };
            orderItemsMap.set(name, {
              count: cur.count + qty,
              revenue: cur.revenue + rev
            });
          });
        });

        const topSellingItems = Array.from(orderItemsMap.entries())
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);

        // Low stock items
        let stockQ = query(collection(db, 'branch_stock'), where('tenantId', '==', tenantId));
        let stockSnap = await getDocs(stockQ);
        if (stockSnap.empty) {
          stockSnap = await getDocs(query(collection(db, 'branch_stock'), where('branch_id', '==', branchId || '')));
        }
        const lowStockItemsCount = stockSnap.docs.filter(d => {
          const data = d.data();
          if (branchId && branchId !== 'all' && (data.branchId || data.branch_id) && (data.branchId || data.branch_id) !== branchId) return false;
          return Number(data.onHandQuantity ?? data.quantity ?? 0) < 10;
        }).length;

        setStats({
          todaySales,
          yesterdaySales,
          ordersCount: todayOrders.length,
          yesterdayOrdersCount: yesterdayOrders.length,
          averageOrderValue: paidOrders.length > 0 ? todaySales / paidOrders.length || 0 : 0,
          pendingOrders,
          completedOrders: completedOrders.length,
          yesterdayCompletedOrders,
          reservationsToday: todayResCount,
          lowStockItems: lowStockItemsCount,
          recentOrders,
          topSellingItems,
          revenueData,
          orderDistribution,
        });
      } catch(e) {
        console.error("Error in useDashboardStats", e);
      }
      setLoading(false);
    };
    fetchStats();
  }, [tenantId, branchId]);

  return { stats, loading };
}

export function useCustomers(tenantId: string | null) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      const data = await fetchCollection('customers', tenantId);
      setCustomers(data);
    } catch (e: any) {
      toast.error('خطأ في جلب بيانات العملاء: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, [tenantId]);

  const addCustomer = async (data: any) => {
    if (!tenantId) return null;
    try {
      const docRef = await addDoc(collection(db, 'customers'), {
        ...data,
        tenant_id: tenantId,
        created_at: new Date().toISOString()
      });
      await fetch();
      toast.success('تمت إضافة العميل بنجاح');
      return docRef.id;
    } catch (e: any) { toast.error('خطأ في إضافة العميل: ' + e.message); return null; }
  };

  const updateCustomer = async (id: string, updates: any) => {
    try {
      await updateDoc(doc(db, 'customers', id), updates);
      await fetch();
      toast.success('تم تحديث بيانات العميل بنجاح');
      return true;
    } catch (e: any) { toast.error('خطأ في تحديث العميل: ' + e.message); return false; }
  };

  const deleteCustomer = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'customers', id));
      await fetch();
      toast.success('تم حذف العميل بنجاح');
      return true;
    } catch (e: any) { toast.error('خطأ في حذف العميل: ' + e.message); return false; }
  };

  return { customers, loading, addCustomer, updateCustomer, deleteCustomer, refresh: fetch };
}

export interface HrSettings {
  attendance_enabled: boolean;
  qr_attendance_enabled: boolean;
  attendance_token: string;
  attendance_token_rotated_at?: string;
  location_restriction: boolean;
  latitude: number | null;
  longitude: number | null;
  geofence_radius: number;
  default_grace_period: number;
  late_deduction_enabled: boolean;
  early_leave_deduction_enabled: boolean;
  overtime_enabled: boolean;
  public_app_url?: string;
}

const DEFAULT_HR_SETTINGS: HrSettings = {
  attendance_enabled: true,
  qr_attendance_enabled: true,
  attendance_token: '',
  location_restriction: false,
  latitude: null,
  longitude: null,
  geofence_radius: 100,
  default_grace_period: 10,
  late_deduction_enabled: false,
  early_leave_deduction_enabled: false,
  overtime_enabled: false,
  public_app_url: 'https://mksystem-rose.vercel.app',
};

export function useHR(tenantId: string | null) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [hrSettings, setHrSettings] = useState<HrSettings>(DEFAULT_HR_SETTINGS);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      const [empData, shiftsData, attData] = await Promise.all([
        fetchCollection('employees', tenantId),
        fetchCollection('shifts', tenantId),
        fetchCollection('attendance', tenantId, 'tenant_id', 'date', 'desc')
      ]);
      setEmployees(empData);
      setShifts(shiftsData);
      setAttendance(attData);

      // Fetch or init HR settings
      const settingsDocRef = doc(db, 'hr_settings', tenantId);
      const settingsSnap = await getDoc(settingsDocRef);
      if (settingsSnap.exists()) {
        setHrSettings({ ...DEFAULT_HR_SETTINGS, ...settingsSnap.data() as HrSettings });
      } else {
        // Check if token exists in tenant doc or generate new
        const tenantSnap = await getDoc(doc(db, 'tenants', tenantId));
        let token = tenantSnap.exists() ? tenantSnap.data()?.attendance_token : null;
        if (!token) {
          token = crypto.randomUUID();
        }
        const initialSettings: HrSettings = {
          ...DEFAULT_HR_SETTINGS,
          attendance_token: token,
        };
        await setDoc(settingsDocRef, { ...initialSettings, tenant_id: tenantId });
        setHrSettings(initialSettings);
      }
    } catch (e: any) {
      toast.error('خطأ في جلب بيانات الموارد البشرية');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [tenantId]);

  const addEmployee = async (data: any) => {
    if (!tenantId) return null;
    try {
      const payload: any = {
        ...data,
        tenant_id: tenantId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (data.pin) {
        if (!/^\d{4}$/.test(data.pin)) {
          toast.error('يجب أن يتكون رمز PIN من 4 أرقام بالضبط');
          return null;
        }
        payload.pin_hash = await hashPin(data.pin);
        payload.pin_set = true;
        delete payload.pin; // Do not store plaintext PIN!
      }

      const docRef = await addDoc(collection(db, 'employees'), payload);

      // Log to audit
      await addDoc(collection(db, 'audit_logs'), {
        tenant_id: tenantId,
        action: 'employee_created',
        entity: 'employee',
        target_id: docRef.id,
        user: 'المدير',
        details: `إضافة موظف جديد: ${payload.name} (${payload.role})`,
        severity: 'info',
        created_at: new Date().toISOString()
      });

      await fetchAll();
      toast.success('تمت إضافة الموظف بنجاح');
      return docRef.id;
    } catch (e: any) { toast.error('خطأ في إضافة الموظف: ' + e.message); return null; }
  };

  const updateEmployee = async (id: string, updates: any) => {
    try {
      const payload = { ...updates, updated_at: new Date().toISOString() };
      if (updates.pin) {
        if (!/^\d{4}$/.test(updates.pin)) {
          toast.error('يجب أن يتكون رمز PIN من 4 أرقام بالضبط');
          return false;
        }
        payload.pin_hash = await hashPin(updates.pin);
        payload.pin_set = true;
        delete payload.pin;
      }

      await updateDoc(doc(db, 'employees', id), payload);

      if (tenantId) {
        await addDoc(collection(db, 'audit_logs'), {
          tenant_id: tenantId,
          action: 'employee_updated',
          entity: 'employee',
          target_id: id,
          user: 'المدير',
          details: `تحديث بيانات الموظف: ${updates.name || id}`,
          severity: 'info',
          created_at: new Date().toISOString()
        });
      }

      await fetchAll();
      toast.success('تم تحديث بيانات الموظف بنجاح');
      return true;
    } catch (e: any) { toast.error('خطأ في تحديث الموظف: ' + e.message); return false; }
  };

  const changeEmployeePin = async (id: string, newPin: string) => {
    if (!/^\d{4}$/.test(newPin)) {
      toast.error('يجب أن يتكون رمز PIN من 4 أرقام بالضبط');
      return false;
    }
    try {
      const pin_hash = await hashPin(newPin);
      await updateDoc(doc(db, 'employees', id), {
        pin_hash,
        pin_set: true,
        updated_at: new Date().toISOString()
      });

      if (tenantId) {
        await addDoc(collection(db, 'audit_logs'), {
          tenant_id: tenantId,
          action: 'employee_pin_changed',
          entity: 'employee',
          target_id: id,
          user: 'المدير',
          details: `تغيير الرمز السري PIN للموظف`,
          severity: 'warning',
          created_at: new Date().toISOString()
        });
      }

      await fetchAll();
      toast.success('تم تحديث رمز PIN بنجاح');
      return true;
    } catch (e: any) {
      toast.error('خطأ في تغيير الرمز السري: ' + e.message);
      return false;
    }
  };

  const deleteEmployee = async (id: string) => {
    try {
      const emp = employees.find(e => e.id === id);
      await deleteDoc(doc(db, 'employees', id));

      if (tenantId) {
        await addDoc(collection(db, 'audit_logs'), {
          tenant_id: tenantId,
          action: 'employee_deleted',
          entity: 'employee',
          target_id: id,
          user: 'المدير',
          details: `حذف الموظف: ${emp?.name || id}`,
          severity: 'error',
          created_at: new Date().toISOString()
        });
      }

      await fetchAll();
      toast.success('تم حذف الموظف بنجاح');
      return true;
    } catch (e: any) { toast.error('خطأ في حذف الموظف: ' + e.message); return false; }
  };

  const addAttendance = async (data: any) => {
    if (!tenantId) return null;
    try {
      const docRef = await addDoc(collection(db, 'attendance'), {
        ...data,
        tenant_id: tenantId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      await fetchAll();
      toast.success('تم تسجيل الحضور بنجاح');
      return docRef.id;
    } catch (e: any) { toast.error('خطأ في التسجيل: ' + e.message); return null; }
  };

  const updateAttendance = async (id: string, updates: any) => {
    try {
      await updateDoc(doc(db, 'attendance', id), {
        ...updates,
        updated_at: new Date().toISOString()
      });
      await fetchAll();
      toast.success('تم تحديث السجل بنجاح');
      return true;
    } catch (e: any) { toast.error('خطأ في التحديث: ' + e.message); return false; }
  };

  const manualCorrectAttendance = async (recordId: string | null, payload: any) => {
    if (!tenantId) return false;
    try {
      const nowIso = new Date().toISOString();
      const correctionData = {
        ...payload,
        isManualCorrection: true,
        correctionAdminId: 'المدير',
        updated_at: nowIso
      };

      let finalId = recordId;
      if (recordId) {
        await updateDoc(doc(db, 'attendance', recordId), correctionData);
      } else {
        const ref = await addDoc(collection(db, 'attendance'), {
          ...correctionData,
          tenant_id: tenantId,
          created_at: nowIso
        });
        finalId = ref.id;
      }

      // Record in audit_logs
      await addDoc(collection(db, 'audit_logs'), {
        tenant_id: tenantId,
        action: 'attendance_manually_corrected',
        entity: 'attendance',
        target_id: finalId,
        user: 'المدير',
        details: `تعديل يدوي لحضور الموظف: ${payload.employee_name || payload.employee_id} لتاريخ ${payload.date}. السبب: ${payload.correctionReason}`,
        severity: 'warning',
        created_at: nowIso
      });

      await fetchAll();
      toast.success('تم تصحيح وتوثيق سجل الحضور بنجاح');
      return true;
    } catch (e: any) {
      toast.error('خطأ في تصحيح الحضور: ' + e.message);
      return false;
    }
  };

  const addShift = async (data: any) => {
    if (!tenantId) return null;
    try {
      const docRef = await addDoc(collection(db, 'shifts'), {
        ...data,
        gracePeriod: Number(data.gracePeriod ?? 10),
        breakMinutes: Number(data.breakMinutes ?? 0),
        tenant_id: tenantId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      await fetchAll();
      toast.success('تمت إضافة الوردية بنجاح');
      return docRef.id;
    } catch (e: any) { toast.error('خطأ في الإضافة: ' + e.message); return null; }
  };

  const updateShift = async (id: string, updates: any) => {
    try {
      await updateDoc(doc(db, 'shifts', id), {
        ...updates,
        gracePeriod: Number(updates.gracePeriod ?? 10),
        breakMinutes: Number(updates.breakMinutes ?? 0),
        updated_at: new Date().toISOString()
      });
      await fetchAll();
      toast.success('تم تحديث الوردية بنجاح');
      return true;
    } catch (e: any) { toast.error('خطأ في تحديث الوردية: ' + e.message); return false; }
  };

  const deleteShift = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'shifts', id));
      await fetchAll();
      toast.success('تم حذف الوردية بنجاح');
      return true;
    } catch (e: any) { toast.error('خطأ في الحذف: ' + e.message); return false; }
  };

  const deleteAttendance = async (attendanceId: string) => {
    if (!attendanceId) return false;
    try {
      const record = attendance.find(a => a.id === attendanceId);
      await deleteDoc(doc(db, 'attendance', attendanceId));

      if (tenantId) {
        await addDoc(collection(db, 'audit_logs'), {
          tenant_id: tenantId,
          action: 'attendance_record_deleted',
          entity: 'attendance',
          target_id: attendanceId,
          user: 'المدير',
          details: `حذف سجل حضور للموظف: ${record?.employee_name || record?.employee_id || attendanceId} - تاريخ: ${record?.date || 'غير محدد'}`,
          severity: 'warning',
          created_at: new Date().toISOString()
        });
      }

      await fetchAll();
      toast.success('تم حذف سجل الحضور بنجاح');
      return true;
    } catch (e: any) {
      toast.error('خطأ في حذف سجل الحضور: ' + e.message);
      return false;
    }
  };

  const updateHrSettings = async (updates: Partial<HrSettings>) => {
    if (!tenantId) return false;
    try {
      const nextSettings = { ...hrSettings, ...updates };
      await setDoc(doc(db, 'hr_settings', tenantId), { ...nextSettings, tenant_id: tenantId }, { merge: true });
      if (updates.attendance_token) {
        await updateDoc(doc(db, 'tenants', tenantId), { attendance_token: updates.attendance_token }).catch(() => {});
      }
      setHrSettings(nextSettings);
      toast.success('تم حفظ إعدادات الموارد البشرية بنجاح');
      return true;
    } catch (e: any) {
      toast.error('خطأ في حفظ الإعدادات: ' + e.message);
      return false;
    }
  };

  const rotateQrToken = async () => {
    if (!tenantId) return null;
    try {
      const newToken = crypto.randomUUID();
      const rotatedAt = new Date().toISOString();
      await updateHrSettings({
        attendance_token: newToken,
        attendance_token_rotated_at: rotatedAt
      });

      // Also ensure sync to tenant doc
      await updateDoc(doc(db, 'tenants', tenantId), { attendance_token: newToken }).catch(() => {});

      // Log in audit
      await addDoc(collection(db, 'audit_logs'), {
        tenant_id: tenantId,
        action: 'attendance_token_rotated',
        entity: 'qr_token',
        user: 'المدير',
        details: 'تم تدوير رمز QR لتسجيل الحضور وإلغاء الرمز السابق',
        severity: 'info',
        created_at: rotatedAt
      });

      toast.success('تم تدوير رمز الـ QR بنجاح وتحديث الرابط');
      return newToken;
    } catch (e: any) {
      toast.error('فشل تدوير الرمز: ' + e.message);
      return null;
    }
  };

  return {
    employees,
    shifts,
    attendance,
    hrSettings,
    loading,
    addEmployee,
    updateEmployee,
    changeEmployeePin,
    deleteEmployee,
    addAttendance,
    updateAttendance,
    deleteAttendance,
    manualCorrectAttendance,
    addShift,
    updateShift,
    deleteShift,
    updateHrSettings,
    rotateQrToken,
    refresh: fetchAll
  };
}

export function useDelivery(tenantId: string | null) {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [deliveryZones, setDeliveryZones] = useState<any[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      const [drvs, zones, allOrders] = await Promise.all([
        fetchCollection('drivers', tenantId),
        fetchCollection('delivery_zones', tenantId),
        fetchCollection('orders', tenantId) // Fetch all orders, then filter
      ]);
      setDrivers(drvs);
      setDeliveryZones(zones);
      setDeliveryOrders(allOrders.filter((o: any) => o.type === 'delivery' || o.order_type === 'delivery'));
    } catch (e: any) {
      toast.error('خطأ في جلب بيانات التوصيل');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [tenantId]);

  const addDriver = async (data: any) => {
    if (!tenantId) return null;
    try {
      const docRef = await addDoc(collection(db, 'drivers'), {
        ...data,
        tenant_id: tenantId,
        created_at: new Date().toISOString()
      });
      await fetchAll();
      toast.success('تمت إضافة السائق بنجاح');
      return docRef.id;
    } catch(e: any) { toast.error(e.message); return null; }
  };

  const updateDriver = async (id: string, updates: any) => {
    try {
      await updateDoc(doc(db, 'drivers', id), updates);
      await fetchAll();
      toast.success('تم تحديث بيانات السائق');
      return true;
    } catch (e: any) { toast.error('خطأ في تحديث السائق: ' + e.message); return false; }
  };

  const deleteDriver = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'drivers', id));
      await fetchAll();
      toast.success('تم حذف السائق بنجاح');
      return true;
    } catch (e: any) { toast.error('خطأ في حذف السائق: ' + e.message); return false; }
  };

  const addDeliveryZone = async (data: any) => {
    if (!tenantId) return null;
    try {
      const docRef = await addDoc(collection(db, 'delivery_zones'), {
        ...data,
        tenant_id: tenantId,
        created_at: new Date().toISOString()
      });
      await fetchAll();
      toast.success('تمت إضافة المنطقة بنجاح');
      return docRef.id;
    } catch(e: any) { toast.error(e.message); return null; }
  };

  const updateDeliveryZone = async (id: string, updates: any) => {
    try {
      await updateDoc(doc(db, 'delivery_zones', id), updates);
      await fetchAll();
      toast.success('تم تحديث المنطقة بنجاح');
      return true;
    } catch (e: any) { toast.error('خطأ في تحديث المنطقة: ' + e.message); return false; }
  };

  const deleteDeliveryZone = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'delivery_zones', id));
      await fetchAll();
      toast.success('تم حذف المنطقة بنجاح');
      return true;
    } catch (e: any) { toast.error('خطأ في حذف المنطقة: ' + e.message); return false; }
  };

  const updateDeliveryOrderStatus = async (id: string, status: string, driverId?: string, ratingObj?: {rating: number, review?: string}) => {
    try {
      const updates: any = { status };
      if (driverId) updates.driver_id = driverId;
      await updateDoc(doc(db, 'orders', id), updates);

      // Handle Driver Stats
      const order = deliveryOrders.find(o => o.id === id);
      const actualDriverId = driverId || (order ? order.driver_id : null);
      
      if (actualDriverId) {
         const driverRef = doc(db, 'drivers', actualDriverId);
         const driver = drivers.find(d => d.id === actualDriverId);
         if (driver) {
             const driverUpdates: any = {};
             
             if (status === 'on_way') {
                driverUpdates.current_orders = (driver.current_orders || 0) + 1;
             } 
             else if (status === 'delivered') {
                driverUpdates.current_orders = Math.max(0, (driver.current_orders || 0) - 1);
                driverUpdates.completed_today = (driver.completed_today || 0) + 1;
                driverUpdates.total_deliveries = (driver.total_deliveries || 0) + 1;
                
                // Add rating logic
                if (ratingObj) {
                    const currentRating = driver.rating || 5;
                    const ratingsCount = driver.ratings_count || 1; 
                    const newCount = ratingsCount + 1;
                    const newRating = ((currentRating * ratingsCount) + ratingObj.rating) / newCount;
                    
                    driverUpdates.rating = Number(newRating.toFixed(1));
                    driverUpdates.ratings_count = newCount;
                }
             }
             
             if (Object.keys(driverUpdates).length > 0) {
                 await updateDoc(driverRef, driverUpdates);
             }
         }
      }

      await fetchAll();
      toast.success('تم تحديث حالة الطلب');
      return true;
    } catch (e: any) { toast.error('خطأ في تحديث الطلب: ' + e.message); return false; }
  };

  return { drivers, deliveryZones, deliveryOrders, loading, addDriver, updateDriver, deleteDriver, addDeliveryZone, updateDeliveryZone, deleteDeliveryZone, updateDeliveryOrderStatus, refresh: fetchAll };
}

export function usePromotions(tenantId: string | null) {
  const [promotions, setPromotions] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      const [promosData, couponsData] = await Promise.all([
        fetchCollection('promotions', tenantId),
        fetchCollection('coupons', tenantId)
      ]);
      setPromotions(promosData);
      setCoupons(couponsData);
    } catch (e: any) {
      toast.error('خطأ في جلب بيانات العروض');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [tenantId]);

  const addPromotion = async (data: any) => {
    if (!tenantId) return null;
    try {
      const docRef = await addDoc(collection(db, 'promotions'), { ...data, tenant_id: tenantId, created_at: new Date().toISOString() });
      await fetchAll();
      toast.success('تمت إضافة العرض بنجاح');
      return docRef.id;
    } catch(e: any) { toast.error(e.message); return null; }
  };

  const addCoupon = async (data: any) => {
    if (!tenantId) return null;
    try {
      const docRef = await addDoc(collection(db, 'coupons'), { ...data, tenant_id: tenantId, created_at: new Date().toISOString() });
      await fetchAll();
      toast.success('تمت إضافة الكوبون بنجاح');
      return docRef.id;
    } catch(e: any) { toast.error(e.message); return null; }
  };

  const updatePromotion = async (id: string, updates: any) => {
    try { await updateDoc(doc(db, 'promotions', id), updates); await fetchAll(); return true; } catch(e: any) { return false; }
  };

  const updateCoupon = async (id: string, updates: any) => {
    try { await updateDoc(doc(db, 'coupons', id), updates); await fetchAll(); return true; } catch(e: any) { return false; }
  };

  const deletePromotion = async (id: string) => {
    try { await deleteDoc(doc(db, 'promotions', id)); await fetchAll(); toast.success('تم حذف العرض'); return true; } catch(e: any) { return false; }
  };

  const deleteCoupon = async (id: string) => {
    try { await deleteDoc(doc(db, 'coupons', id)); await fetchAll(); toast.success('تم حذف الكوبون'); return true; } catch(e: any) { return false; }
  };

  return { promotions, coupons, loading, addPromotion, addCoupon, updatePromotion, updateCoupon, deletePromotion, deleteCoupon, refresh: fetchAll };
}

export function useProduction(tenantId: string | null) {
  const [productionBatches, setProductionBatches] = useState<any[]>([]);
  const [prepLists, setPrepLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      const [batches, prep] = await Promise.all([
        fetchCollection('production_batches', tenantId),
        fetchCollection('prep_lists', tenantId)
      ]);
      setProductionBatches(batches);
      setPrepLists(prep);
    } catch (e: any) {
      toast.error('خطأ في جلب بيانات الإنتاج');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [tenantId]);

  const addBatch = async (data: any) => {
    if (!tenantId) return null;
    try {
      const docRef = await addDoc(collection(db, 'production_batches'), { ...data, tenant_id: tenantId, created_at: new Date().toISOString() });
      await fetchAll();
      toast.success('تمت إضافة دفعة الإنتاج');
      return docRef.id;
    } catch(e: any) { toast.error(e.message); return null; }
  };

  const updateBatchStatus = async (id: string, status: string) => {
    try { await updateDoc(doc(db, 'production_batches', id), { status }); await fetchAll(); return true; } catch(e: any) { return false; }
  };

  const updateBatch = async (id: string, updates: any) => {
    try { await updateDoc(doc(db, 'production_batches', id), updates); await fetchAll(); return true; } catch(e: any) { return false; }
  };

  const deleteBatch = async (id: string) => {
    try { await deleteDoc(doc(db, 'production_batches', id)); await fetchAll(); toast.success('تم حذف دفعة الإنتاج'); return true; } catch(e: any) { return false; }
  };

  return { productionBatches, prepLists, loading, addBatch, updateBatchStatus, updateBatch, deleteBatch, refresh: fetchAll };
}

export function useAuditLog(tenantId: string | null) {
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      const logs = await fetchCollection('audit_logs', tenantId, 'tenant_id', 'created_at', 'desc', 300);
      setAuditLogs(logs);
    } catch (e: any) {
      toast.error('خطأ في جلب سجل التدقيق');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [tenantId]);

  const addLog = async (data: any) => {
    if (!tenantId) return null;
    try {
      // data should include: action, entity, user, details, severity
      const docRef = await addDoc(collection(db, 'audit_logs'), { ...data, tenant_id: tenantId, created_at: new Date().toISOString() });
      // Usually we don't await fetchAll for audit logs as they happen in background, but we can do it here for the UI
      await fetchAll();
      return docRef.id;
    } catch(e: any) { console.error('خطأ في إضافة سجل التدقيق: ', e); return null; }
  };

  return { auditLogs, loading, addLog, refresh: fetchAll };
}

export function useIntegrations(tenantId: string | null) {
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    try {
      const data = await fetchCollection('integrations', tenantId, 'tenant_id', 'name');
      setIntegrations(data);
    } catch (e: any) {
      toast.error('خطأ في جلب التكاملات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [tenantId]);

  const addIntegration = async (data: any) => {
    if (!tenantId) return null;
    try {
      const docRef = await addDoc(collection(db, 'integrations'), { ...data, tenant_id: tenantId, created_at: new Date().toISOString() });
      await fetchAll();
      toast.success('تمت إضافة التكامل');
      return docRef.id;
    } catch(e: any) { toast.error(e.message); return null; }
  };

  const updateIntegration = async (id: string, updates: any) => {
    try { await updateDoc(doc(db, 'integrations', id), updates); await fetchAll(); return true; } catch(e: any) { return false; }
  };

  return { integrations, loading, addIntegration, updateIntegration, refresh: fetchAll };
}

export function useSettings(tenantId: string | null) {
  const updateTenantSettings = async (settings: any) => {
    if (!tenantId) return false;
    try {
      await updateDoc(doc(db, 'tenants', tenantId), { settings });
      return true;
    } catch (e: any) {
      toast.error('خطأ في حفظ الإعدادات على الخادم: ' + e.message);
      return false;
    }
  };

  const updateTenantProfile = async (data: { name?: string; name_en?: string; tax_number?: string; settings?: any }) => {
    if (!tenantId) return false;
    try {
      await updateDoc(doc(db, 'tenants', tenantId), data);
      return true;
    } catch (e: any) {
      toast.error('خطأ في حفظ بيانات المؤسسة: ' + e.message);
      return false;
    }
  };

  const updateBranchProfile = async (branchId: string, data: { name?: string; phone?: string; address?: string; opening_time?: string; closing_time?: string }) => {
    try {
      await updateDoc(doc(db, 'branches', branchId), data);
      return true;
    } catch (e: any) {
      toast.error('خطأ في حفظ بيانات الفرع: ' + e.message);
      return false;
    }
  };

  const wipeAllTenantData = async (activeBranchId?: string | null) => {
    if (!tenantId) return false;
    try {
      const collectionsWithTenantId = [
        'menu_categories', 'menu_items', 'orders', 'tables', 'inventory_items', 'suppliers', 'supplier_products',
        'purchase_orders', 'goods_receipts', 'purchase_returns', 'supplier_ledger', 'supplier_payments', 'purchase_idempotency',
        'customer_ledger', 'customer_receivables', 'customer_payments', 'customer_payment_allocations', 'price_lists', 'price_list_items', 'customer_product_prices', 'customer_idempotency',
        'recipes', 'customers', 'employees', 'drivers',
        'promotions', 'coupons', 'production_batches', 'prep_lists', 'audit_logs', 'integrations', 'units',
        'expenses', 'maintenance_records', 'call_center_orders', 'accounting_records', 'pos_shifts',
        'sales', 'sale_items', 'sale_payments', 'sale_returns', 'sale_return_items', 'sale_refunds', 'sale_exchanges', 'return_idempotency', 'held_sales', 'cashier_shifts', 'cash_register_shifts', 'cash_register_transactions', 'sale_idempotency', 'sequence_counters',
        'branch_transfers', 'inventory_counts', 'damage_loss_records'
      ];
      
      const collectionsWithBranchId = [
        'branch_stock', 'stock_movements', 'reservations', 'shifts', 'branch_shifts', 'attendance', 'delivery_zones'
      ];

      // Gather IDs of entities with subcollections
      const orderIds: string[] = [];
      const recipesIds: string[] = [];

      try {
        const ordersSnap = await getDocs(query(collection(db, 'orders'), where('tenant_id', '==', tenantId)));
        ordersSnap.forEach(d => orderIds.push(d.id));

        const recipesSnap = await getDocs(query(collection(db, 'recipes'), where('tenant_id', '==', tenantId)));
        recipesSnap.forEach(d => recipesIds.push(d.id));
      } catch(e) { console.warn('Could not fetch orders or recipes for wiping'); }

      // 1. Delete collections mapped by tenant_id or tenantId
      for (const colName of collectionsWithTenantId) {
        try {
          // Check snake_case
          const q1 = query(collection(db, colName), where('tenant_id', '==', tenantId));
          const snap1 = await getDocs(q1);
          const deletes1 = snap1.docs.map(d => deleteDoc(d.ref));
          
          // Check camelCase
          const q2 = query(collection(db, colName), where('tenantId', '==', tenantId));
          const snap2 = await getDocs(q2);
          const deletes2 = snap2.docs.map(d => deleteDoc(d.ref));

          await Promise.all([...deletes1, ...deletes2]);
        } catch (e) {
          console.warn(`Could not wipe collection ${colName} directly by tenant_id/tenantId`);
        }
      }

      // 2. Delete collections mapped by branch_id
      let branchIds: string[] = [];
      try {
        const branchesSnap1 = await getDocs(query(collection(db, 'branches'), where('tenant_id', '==', tenantId)));
        const branchesSnap2 = await getDocs(query(collection(db, 'branches'), where('tenantId', '==', tenantId)));
        branchIds = [...branchesSnap1.docs.map(d => d.id), ...branchesSnap2.docs.map(d => d.id)];
        if (activeBranchId) branchIds.push(activeBranchId);
        branchIds = Array.from(new Set(branchIds));
        
        for (const colName of collectionsWithBranchId) {
          for (const bId of branchIds) {
            try {
              // Check snake_case
              const q1 = query(collection(db, colName), where('branch_id', '==', bId));
              const snap1 = await getDocs(q1);
              const deletes1 = snap1.docs.map(d => deleteDoc(d.ref));

              // Check camelCase
              const q2 = query(collection(db, colName), where('branchId', '==', bId));
              const snap2 = await getDocs(q2);
              const deletes2 = snap2.docs.map(d => deleteDoc(d.ref));

              await Promise.all([...deletes1, ...deletes2]);
            } catch(e) { console.warn(`Could not wipe ${colName} for branch ${bId}`); }
          }
        }
      } catch(e) { console.warn('Could not fetch branches for wiping branch-level data'); }

      // Helper to chunk arrays for 'in' queries
      const chunkArray = (arr: string[], size: number) => {
        const chunks = [];
        for (let i = 0; i < arr.length; i += size) {
          chunks.push(arr.slice(i, i + size));
        }
        return chunks;
      };

      // 3. Delete order items and payments
      if (orderIds.length > 0) {
        for (const chunk of chunkArray(orderIds, 10)) {
          try {
            const qItems = query(collection(db, 'order_items'), where('order_id', 'in', chunk));
            const snapItems = await getDocs(qItems);
            await Promise.all(snapItems.docs.map(d => deleteDoc(d.ref)));

            const qPayments = query(collection(db, 'payments'), where('order_id', 'in', chunk));
            const snapPayments = await getDocs(qPayments);
            await Promise.all(snapPayments.docs.map(d => deleteDoc(d.ref)));
          } catch(e) { console.warn('Could not wipe order items chunk'); }
        }
      }

      // 4. Delete recipe ingredients
      if (recipesIds.length > 0) {
        for (const chunk of chunkArray(recipesIds, 10)) {
          try {
            const qIngs = query(collection(db, 'recipe_ingredients'), where('recipe_id', 'in', chunk));
            const snapIngs = await getDocs(qIngs);
            await Promise.all(snapIngs.docs.map(d => deleteDoc(d.ref)));
          } catch(e) { console.warn('Could not wipe recipe ingredients chunk'); }
        }
      }

      // 5. Delete branches last
      if (branchIds.length > 0) {
        for (const bId of branchIds) {
          try {
            await deleteDoc(doc(db, 'branches', bId));
          } catch(e) { console.warn(`Could not wipe branch ${bId}`); }
        }
      }
      
      return true;
    } catch (e: any) {
      toast.error('خطأ أثاء مسح البيانات: ' + e.message);
      return false;
    }
  };

  return { updateTenantSettings, updateTenantProfile, updateBranchProfile, wipeAllTenantData };
}
