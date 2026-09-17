import { useState, useEffect, useCallback, useMemo } from 'react';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import { db, firebaseConfig } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, deleteDoc, addDoc, updateDoc, setDoc } from 'firebase/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { useTenantBranch } from '@/hooks/useDatabase';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Shield, Users, UserPlus, Save, Search, Edit, Trash2, Eye,
  ShoppingCart, ChefHat, Package, Truck, BarChart3, Settings, FileText,
  CalendarDays, UtensilsCrossed, Percent, UserCog, Puzzle, LayoutDashboard,
  AlertTriangle, ChevronLeft, RotateCcw, CheckCircle2, XCircle, Building2, Check, X
} from 'lucide-react';
import {
  PERMISSION_CATEGORIES,
  ROLE_TEMPLATES,
  ALL_PERMISSION_IDS,
  calculateEffectivePermissions,
  getRoleLabel,
  isOwnerRole,
  isAdminOrOwnerRole,
} from '@/lib/permissionsModel';
import { notifySecurityRoleChanged } from '@/services/notifications.service';

interface UserEntry {
  id: string;
  full_name: string;
  email: string;
  role: string;
  permissions: string[];
  status: 'active' | 'disabled';
  branch_id?: string | null;
}

interface BranchItem {
  id: string;
  name: string;
}

// Icon mapping helper for categories
const iconMap: Record<string, any> = {
  LayoutDashboard,
  ShoppingCart,
  ChefHat,
  Package,
  CalendarDays,
  BarChart3,
  Settings,
};

export default function Permissions() {
  const { user } = useAuth();
  const { tenantId, branchId } = useTenantBranch();
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [branches, setBranches] = useState<BranchItem[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserEntry | null>(null);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [permissionSearch, setPermissionSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Add User Dialog State
  const [showAddUser, setShowAddUser] = useState(false);
  const [addingUser, setAddingUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'cashier',
    branchId: 'all',
  });
  const [useGoogleAuth, setUseGoogleAuth] = useState(false);

  // Delete User Confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);

  // Fetch branches
  useEffect(() => {
    if (!tenantId) return;
    const fetchBranches = async () => {
      try {
        const bSnap = await getDocs(query(collection(db, 'branches'), where('tenant_id', '==', tenantId)));
        const branchList = bSnap.docs.map((d) => ({ id: d.id, name: d.data().name || 'فرع بدون اسم' }));
        setBranches(branchList);
      } catch (err) {
        console.warn('Error fetching branches for permissions:', err);
      }
    };
    fetchBranches();
  }, [tenantId]);

  // Fetch all users in tenant
  const fetchUsers = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const profilesQ = query(collection(db, 'profiles'), where('tenant_id', '==', tenantId));
      const profilesSnap = await getDocs(profilesQ);
      const profiles = profilesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      if (profiles.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      const userEntries: UserEntry[] = [];
      for (const p of profiles) {
        // Fetch user roles
        const rolesQ = query(collection(db, 'user_roles'), where('user_id', '==', p.id));
        const rolesSnap = await getDocs(rolesQ);
        const roles = rolesSnap.docs.map((d) => d.data());

        // Fetch user permissions
        const permsQ = query(collection(db, 'user_permissions'), where('user_id', '==', p.id));
        const permsSnap = await getDocs(permsQ);
        const perms = permsSnap.docs.map((d) => d.data());

        const role = roles[0]?.role || (p as any).role || 'viewer';
        const userStatus: 'active' | 'disabled' = (p as any).status === 'disabled' ? 'disabled' : 'active';

        userEntries.push({
          id: p.id,
          full_name: (p as any).full_name || (p as any).email?.split('@')[0] || 'مستخدم',
          email: (p as any).email || '',
          role,
          permissions: perms.map((x: any) => x.permission),
          status: userStatus,
          branch_id: (p as any).branch_id || null,
        });
      }

      setUsers(userEntries);

      // Keep selected user state updated
      if (selectedUser) {
        const updated = userEntries.find((u) => u.id === selectedUser.id);
        if (updated) setSelectedUser(updated);
      }
    } catch (e: any) {
      console.error('Error fetching users in permissions:', e);
      toast.error('حدث خطأ أثناء تحميل المستخدمين');
    } finally {
      setLoading(false);
    }
  }, [tenantId, selectedUser?.id]);

  useEffect(() => {
    fetchUsers();
  }, [tenantId]);

  const handleSelectUser = (u: UserEntry) => {
    setSelectedUser(u);
    setEditPermissions([...u.permissions]);
  };

  const isSelectedCurrentUser = user?.uid === selectedUser?.id;

  // Check how many active admins/owners exist in this tenant
  const activeAdminCount = useMemo(() => {
    return users.filter((u) => u.status === 'active' && isAdminOrOwnerRole(u.role)).length;
  }, [users]);

  // Toggle individual permission
  const togglePermission = (permId: string) => {
    // Safety check: Cannot remove permissions.manage from self
    if (isSelectedCurrentUser && permId === 'permissions.manage' && editPermissions.includes(permId)) {
      toast.error('لا يمكنك إزالة صلاحية إدارة الصلاحيات من حسابك الحالي لتجنب إغلاق النظام');
      return;
    }

    setEditPermissions((prev) =>
      prev.includes(permId) ? prev.filter((p) => p !== permId) : [...prev, permId]
    );
  };

  // Toggle all permissions in a category
  const toggleCategory = (categoryId: string) => {
    const category = PERMISSION_CATEGORIES.find((c) => c.id === categoryId);
    if (!category) return;
    const catPerms = category.permissions.map((p) => p.id);
    const allEnabled = catPerms.every((p) => editPermissions.includes(p));

    if (allEnabled) {
      // If current user, do not disable permissions.manage
      setEditPermissions((prev) =>
        prev.filter((p) => {
          if (isSelectedCurrentUser && p === 'permissions.manage') return true;
          return !catPerms.includes(p);
        })
      );
    } else {
      setEditPermissions((prev) => [...new Set([...prev, ...catPerms])]);
    }
  };

  // Reset a single category to role template defaults
  const resetCategoryToRoleDefault = (categoryId: string) => {
    if (!selectedUser) return;
    const category = PERMISSION_CATEGORIES.find((c) => c.id === categoryId);
    if (!category) return;
    const catPerms = category.permissions.map((p) => p.id);

    const roleDefaults = ROLE_TEMPLATES[selectedUser.role]?.permissions || [];
    const defaultsInThisCategory = catPerms.filter((p) => roleDefaults.includes('*') || roleDefaults.includes(p));

    setEditPermissions((prev) => {
      const otherPerms = prev.filter((p) => !catPerms.includes(p));
      return [...new Set([...otherPerms, ...defaultsInThisCategory])];
    });
    toast.info(`تمت استعادة الصلاحيات الافتراضية لقسم "${category.label}"`);
  };

  // Reset all permissions of selected user to their role template defaults
  const resetAllToRoleDefaults = () => {
    if (!selectedUser) return;
    const template = ROLE_TEMPLATES[selectedUser.role];
    if (template) {
      if (template.permissions.includes('*')) {
        setEditPermissions([...ALL_PERMISSION_IDS]);
      } else {
        setEditPermissions([...template.permissions]);
      }
      toast.success(`تمت استعادة الصلاحيات الافتراضية لدور "${template.label}"`);
    }
  };

  // Apply Role Template directly
  const applyRoleTemplate = async (roleKey: string) => {
    if (!selectedUser) return;

    // Safety: check if demoting the last admin
    if (
      isAdminOrOwnerRole(selectedUser.role) &&
      !isAdminOrOwnerRole(roleKey) &&
      activeAdminCount <= 1
    ) {
      toast.error('لا يمكن تغيير دور هذا المستخدم، لأنه المدير الوحيد النشط في المنشأة.');
      return;
    }

    const template = ROLE_TEMPLATES[roleKey];
    if (!template) return;

    const newPerms = template.permissions.includes('*') ? [...ALL_PERMISSION_IDS] : [...template.permissions];
    setEditPermissions(newPerms);

    setLoading(true);
    try {
      // 1. Update user_roles collection
      const rolesQ = query(collection(db, 'user_roles'), where('user_id', '==', selectedUser.id));
      const rolesSnap = await getDocs(rolesQ);
      for (const rDoc of rolesSnap.docs) {
        await deleteDoc(rDoc.ref);
      }
      await addDoc(collection(db, 'user_roles'), {
        user_id: selectedUser.id,
        role: roleKey,
        tenant_id: tenantId,
        updated_at: new Date().toISOString(),
      });

      // 2. Update profiles collection
      await updateDoc(doc(db, 'profiles', selectedUser.id), {
        role: roleKey,
        updated_at: new Date().toISOString(),
      });

      // 3. Update user_permissions collection
      const permsQ = query(collection(db, 'user_permissions'), where('user_id', '==', selectedUser.id));
      const permsSnap = await getDocs(permsQ);
      for (const pDoc of permsSnap.docs) {
        await deleteDoc(pDoc.ref);
      }
      for (const p of newPerms) {
        await addDoc(collection(db, 'user_permissions'), {
          user_id: selectedUser.id,
          permission: p,
          granted_by: user?.uid,
          created_at: new Date().toISOString(),
        });
      }

      // 4. Record Audit Log
      await addDoc(collection(db, 'audit_logs'), {
        tenant_id: tenantId,
        action: 'ROLE_CHANGED',
        target_id: selectedUser.id,
        target_name: selectedUser.full_name,
        user: user?.email || 'المدير',
        details: `تغيير دور المستخدم ${selectedUser.full_name} إلى ${template.label}`,
        old_role: selectedUser.role,
        new_role: roleKey,
        created_at: new Date().toISOString(),
      });

      notifySecurityRoleChanged(
        user?.displayName || user?.email || 'المدير',
        selectedUser.full_name || selectedUser.email,
        template.label
      ).catch(() => {});

      toast.success(`تم تعيين دور "${template.label}" وحفظ الصلاحيات بنجاح`);
      setSelectedUser((prev) => (prev ? { ...prev, role: roleKey, permissions: newPerms } : null));
      await fetchUsers();
    } catch (err: any) {
      console.error('Error applying role template:', err);
      toast.error('حدث خطأ أثناء تطبيق قالب الدور');
    } finally {
      setLoading(false);
    }
  };

  // Toggle User Status (Active vs Disabled)
  const toggleUserStatus = async () => {
    if (!selectedUser) return;

    if (isSelectedCurrentUser) {
      toast.error('لا يمكنك تعطيل حسابك الشخصي الذي تستخدمه حالياً.');
      return;
    }

    const newStatus = selectedUser.status === 'active' ? 'disabled' : 'active';

    // Safety: Prevent disabling the only active admin/owner
    if (newStatus === 'disabled' && isAdminOrOwnerRole(selectedUser.role) && activeAdminCount <= 1) {
      toast.error('لا يمكن تعطيل هذا الحساب لأنه المدير الوحيد النشط في المنشأة.');
      return;
    }

    setLoading(true);
    try {
      await updateDoc(doc(db, 'profiles', selectedUser.id), {
        status: newStatus,
        updated_at: new Date().toISOString(),
      });

      // Audit log
      await addDoc(collection(db, 'audit_logs'), {
        tenant_id: tenantId,
        action: newStatus === 'disabled' ? 'USER_DISABLED' : 'USER_ACTIVATED',
        target_id: selectedUser.id,
        target_name: selectedUser.full_name,
        user: user?.email || 'المدير',
        details: `${newStatus === 'disabled' ? 'تعطيل' : 'تفعيل'} حساب المستخدم: ${selectedUser.full_name}`,
        created_at: new Date().toISOString(),
      });

      toast.success(newStatus === 'disabled' ? 'تم تعطيل الحساب بنجاح' : 'تم تنشيط الحساب بنجاح');
      setSelectedUser((prev) => (prev ? { ...prev, status: newStatus } : null));
      await fetchUsers();
    } catch (err: any) {
      console.error('Error toggling user status:', err);
      toast.error('حدث خطأ أثناء تغيير حالة الحساب');
    } finally {
      setLoading(false);
    }
  };

  // Update User Branch
  const handleBranchChange = async (newBranchId: string) => {
    if (!selectedUser) return;
    const finalBranchId = newBranchId === 'all' ? null : newBranchId;

    try {
      await updateDoc(doc(db, 'profiles', selectedUser.id), {
        branch_id: finalBranchId,
        updated_at: new Date().toISOString(),
      });
      setSelectedUser((prev) => (prev ? { ...prev, branch_id: finalBranchId } : null));
      toast.success('تم تحديث فرع المستخدم بنجاح');
      await fetchUsers();
    } catch (err) {
      toast.error('فشل في تحديث فرع المستخدم');
    }
  };

  // Save manual permission changes
  const savePermissions = async () => {
    if (!selectedUser) return;

    setLoading(true);
    try {
      // 1. Delete existing user_permissions
      const permsQ = query(collection(db, 'user_permissions'), where('user_id', '==', selectedUser.id));
      const permsSnap = await getDocs(permsQ);
      for (const pDoc of permsSnap.docs) {
        await deleteDoc(pDoc.ref);
      }

      // 2. Add updated permissions
      for (const p of editPermissions) {
        await addDoc(collection(db, 'user_permissions'), {
          user_id: selectedUser.id,
          permission: p,
          granted_by: user?.uid,
          created_at: new Date().toISOString(),
        });
      }

      // 3. Audit log
      await addDoc(collection(db, 'audit_logs'), {
        tenant_id: tenantId,
        action: 'PERMISSIONS_UPDATED',
        target_id: selectedUser.id,
        target_name: selectedUser.full_name,
        user: user?.email || 'المدير',
        details: `تحديث الصلاحيات للمستخدم ${selectedUser.full_name} (${editPermissions.length} صلاحية)`,
        created_at: new Date().toISOString(),
      });

      toast.success(`تم حفظ ${editPermissions.length} صلاحية للمستخدم بنجاح`);
      setSelectedUser((prev) => (prev ? { ...prev, permissions: editPermissions } : null));
      await fetchUsers();
    } catch (err: any) {
      console.error('Error saving permissions:', err);
      toast.error('حدث خطأ أثناء حفظ الصلاحيات');
    } finally {
      setLoading(false);
    }
  };

  // Add new user handler
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;

    if (!newUserForm.name.trim()) {
      toast.error('يرجى إدخال اسم الموظف');
      return;
    }
    if (!newUserForm.email.trim()) {
      toast.error('يرجى إدخال البريد الإلكتروني');
      return;
    }
    if (!useGoogleAuth && (!newUserForm.password || newUserForm.password.length < 6)) {
      toast.error('يجب أن تكون كلمة المرور 6 أحرف أو أكثر');
      return;
    }

    setAddingUser(true);
    try {
      let createdUid = '';

      if (useGoogleAuth) {
        createdUid = `user_${Date.now()}`;
      } else {
        const secondaryApp = initializeApp(firebaseConfig, `user-create-${Date.now()}`);
        const secondaryAuth = getAuth(secondaryApp);
        const cred = await createUserWithEmailAndPassword(secondaryAuth, newUserForm.email, newUserForm.password);
        createdUid = cred.user.uid;
        await updateProfile(cred.user, { displayName: newUserForm.name });
      }

      // Create profile document
      const branchVal = newUserForm.branchId === 'all' ? null : newUserForm.branchId;
      await setDoc(doc(db, 'profiles', createdUid), {
        full_name: newUserForm.name,
        email: newUserForm.email,
        tenant_id: tenantId,
        branch_id: branchVal,
        role: newUserForm.role,
        status: 'active',
        created_at: new Date().toISOString(),
      });

      // Add user_roles
      await addDoc(collection(db, 'user_roles'), {
        user_id: createdUid,
        role: newUserForm.role,
        tenant_id: tenantId,
        created_at: new Date().toISOString(),
      });

      // Apply initial role permissions
      const initialTemplate = ROLE_TEMPLATES[newUserForm.role];
      const initialPerms = initialTemplate
        ? initialTemplate.permissions.includes('*')
          ? ALL_PERMISSION_IDS
          : initialTemplate.permissions
        : [];

      for (const p of initialPerms) {
        await addDoc(collection(db, 'user_permissions'), {
          user_id: createdUid,
          permission: p,
          granted_by: user?.uid,
          created_at: new Date().toISOString(),
        });
      }

      // Log to audit
      await addDoc(collection(db, 'audit_logs'), {
        tenant_id: tenantId,
        action: 'USER_CREATED',
        target_id: createdUid,
        target_name: newUserForm.name,
        user: user?.email || 'المدير',
        details: `إضافة مستخدم جديد: ${newUserForm.name} بدور: ${getRoleLabel(newUserForm.role)}`,
        created_at: new Date().toISOString(),
      });

      toast.success('تمت إضافة المستخدم بنجاح');
      setShowAddUser(false);
      setNewUserForm({ name: '', email: '', password: '', role: 'cashier', branchId: 'all' });
      await fetchUsers();
    } catch (err: any) {
      console.error('Error creating user:', err);
      toast.error('حدث خطأ أثناء إنشاء المستخدم: ' + (err.message || ''));
    } finally {
      setAddingUser(false);
    }
  };

  // Delete User Handler
  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    if (isSelectedCurrentUser) {
      toast.error('لا يمكنك حذف حسابك الشخصي الذي تستخدمه حالياً.');
      return;
    }

    if (isAdminOrOwnerRole(selectedUser.role) && activeAdminCount <= 1) {
      toast.error('لا يمكن حذف هذا المستخدم لأنه المدير الوحيد في المنشأة.');
      return;
    }

    setDeletingUser(true);
    try {
      // 1. Delete roles
      const rolesQ = query(collection(db, 'user_roles'), where('user_id', '==', selectedUser.id));
      const rolesSnap = await getDocs(rolesQ);
      for (const d of rolesSnap.docs) await deleteDoc(d.ref);

      // 2. Delete permissions
      const permsQ = query(collection(db, 'user_permissions'), where('user_id', '==', selectedUser.id));
      const permsSnap = await getDocs(permsQ);
      for (const d of permsSnap.docs) await deleteDoc(d.ref);

      // 3. Delete profile
      await deleteDoc(doc(db, 'profiles', selectedUser.id));

      // 4. Audit log
      await addDoc(collection(db, 'audit_logs'), {
        tenant_id: tenantId,
        action: 'USER_DELETED',
        target_id: selectedUser.id,
        target_name: selectedUser.full_name,
        user: user?.email || 'المدير',
        details: `حذف المستخدم: ${selectedUser.full_name} (${selectedUser.email})`,
        created_at: new Date().toISOString(),
      });

      toast.success('تم حذف المستخدم بنجاح');
      setShowDeleteConfirm(false);
      setSelectedUser(null);
      await fetchUsers();
    } catch (err: any) {
      console.error('Error deleting user:', err);
      toast.error('حدث خطأ أثناء حذف المستخدم');
    } finally {
      setDeletingUser(false);
    }
  };

  // Filtered users
  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const q = searchTerm.toLowerCase();
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        getRoleLabel(u.role).toLowerCase().includes(q)
    );
  }, [users, searchTerm]);

  // Filtered permission categories based on search input
  const filteredCategories = useMemo(() => {
    if (!permissionSearch.trim()) return PERMISSION_CATEGORIES;
    const q = permissionSearch.toLowerCase();
    return PERMISSION_CATEGORIES.map((cat) => {
      const matchCat = cat.label.toLowerCase().includes(q);
      const matchPerms = cat.permissions.filter(
        (p) => p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
      );
      if (matchCat) return cat;
      return { ...cat, permissions: matchPerms };
    }).filter((cat) => cat.permissions.length > 0);
  }, [permissionSearch]);

  return (
    <MainLayout title="إدارة المستخدمين والصلاحيات" subtitle="نظام تحكم شامل ومحكم بالأدوار والصلاحيات (RBAC)">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative">
        {/* Left / Top Users List Panel */}
        <div className="lg:col-span-4 flex flex-col space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="بحث عن مستخدم أو دور..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10 rounded-2xl h-11 bg-card border-border/60 text-sm"
              />
            </div>
            <Button
              onClick={() => setShowAddUser(true)}
              className="h-11 rounded-2xl gap-2 font-bold shrink-0 shadow-md shadow-primary/20 px-4"
            >
              <UserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">إضافة مستخدم</span>
            </Button>
          </div>

          <div className="bg-card/40 backdrop-blur-xl border border-border/50 rounded-3xl p-3 flex flex-col space-y-2 max-h-[750px] overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="p-8 text-center space-y-3">
                <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-xs text-muted-foreground">جاري تحميل قائمة المستخدمين...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                لم يتم العثور على أي مستخدمين مطابقين.
              </div>
            ) : (
              filteredUsers.map((u) => {
                const isSelected = selectedUser?.id === u.id;
                const isCurrent = user?.uid === u.id;
                const isDisabledUser = u.status === 'disabled';

                return (
                  <div
                    key={u.id}
                    onClick={() => handleSelectUser(u)}
                    className={cn(
                      'p-4 rounded-2xl border transition-all duration-300 cursor-pointer text-right relative overflow-hidden',
                      isSelected
                        ? 'bg-primary/10 border-primary/40 shadow-md ring-1 ring-primary/20'
                        : 'bg-card/80 hover:bg-card border-border/40 hover:border-border/80',
                      isDisabledUser && 'opacity-60 grayscale-[30%]'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 font-black text-sm transition-all',
                            isSelected
                              ? 'bg-primary text-primary-foreground shadow-md'
                              : 'bg-muted text-muted-foreground'
                          )}
                        >
                          {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm text-foreground">{u.full_name}</h3>
                            {isCurrent && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 bg-primary/5 text-primary border-primary/20">
                                أنت
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground font-mono" dir="ltr">
                            {u.email}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <Badge
                          variant="secondary"
                          className={cn(
                            'text-[10px] font-bold tracking-wider px-2 py-0.5',
                            isOwnerRole(u.role) && 'bg-amber-500/10 text-amber-500 border border-amber-500/30',
                            u.role === 'admin' && 'bg-primary/10 text-primary border border-primary/30',
                            u.role === 'manager' && 'bg-blue-500/10 text-blue-500 border border-blue-500/30'
                          )}
                        >
                          {getRoleLabel(u.role)}
                        </Badge>
                        <span
                          className={cn(
                            'text-[10px] font-bold flex items-center gap-1',
                            isDisabledUser ? 'text-destructive' : 'text-emerald-500'
                          )}
                        >
                          {isDisabledUser ? 'معطل' : 'نشط'}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-border/30 flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Shield className="w-3.5 h-3.5 text-primary" />
                        <span>{u.permissions.length} صلاحية مخصصة</span>
                      </div>
                      <ChevronLeft className={cn('w-4 h-4 transition-transform', isSelected && 'text-primary translate-x-[-2px]')} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Details Panel */}
        <div className="lg:col-span-8 flex flex-col">
          {selectedUser ? (
            <div className="flex flex-col h-full bg-card/60 backdrop-blur-2xl border border-border/60 rounded-3xl relative overflow-hidden p-0 shadow-2xl">
              {/* Header */}
              <div className="p-6 md:p-8 border-b border-border/50 bg-gradient-to-l from-primary/5 via-transparent to-transparent flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      <Shield className="w-7 h-7 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-xl sm:text-2xl font-black text-foreground">{selectedUser.full_name}</h2>
                        {selectedUser.status === 'disabled' ? (
                          <Badge variant="destructive" className="font-bold">حساب معطل</Badge>
                        ) : (
                          <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/5 font-bold">نشط</Badge>
                        )}
                        {isSelectedCurrentUser && (
                          <Badge variant="secondary" className="font-bold text-xs bg-primary/10 text-primary">حسابك الحالي</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-1" dir="ltr">{selectedUser.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      onClick={savePermissions}
                      className="h-11 rounded-2xl gap-2 font-bold px-6 shadow-lg shadow-primary/25"
                    >
                      <Save className="w-4 h-4" />
                      حفظ الصلاحيات
                    </Button>

                    {!isSelectedCurrentUser && (
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-11 w-11 rounded-2xl text-destructive border-border/60 hover:border-destructive/40 hover:bg-destructive/10"
                        onClick={() => setShowDeleteConfirm(true)}
                        title="حذف المستخدم"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Configuration Row: Role Selector, Status Toggle, Branch, Reset to Default */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
                  {/* Role Selector */}
                  <div className="space-y-1.5 bg-background/50 p-3 rounded-2xl border border-border/40">
                    <Label className="text-xs text-muted-foreground font-bold">الدور الوظيفي (Role)</Label>
                    <Select value={selectedUser.role} onValueChange={applyRoleTemplate}>
                      <SelectTrigger className="h-9 rounded-xl text-xs font-bold border-border/60">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {Object.values(ROLE_TEMPLATES).map((tmpl) => (
                          <SelectItem key={tmpl.key} value={tmpl.key} className="text-xs font-bold cursor-pointer">
                            {tmpl.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Branch Assignment */}
                  <div className="space-y-1.5 bg-background/50 p-3 rounded-2xl border border-border/40">
                    <Label className="text-xs text-muted-foreground font-bold">الفرع المخصص</Label>
                    <Select value={selectedUser.branch_id || 'all'} onValueChange={handleBranchChange}>
                      <SelectTrigger className="h-9 rounded-xl text-xs font-bold border-border/60">
                        <SelectValue placeholder="اختر الفرع..." />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="all" className="text-xs font-bold cursor-pointer">كل الفروع (عام)</SelectItem>
                        {branches.map((b) => (
                          <SelectItem key={b.id} value={b.id} className="text-xs font-bold cursor-pointer">
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Account Status Switch */}
                  <div className="flex items-center justify-between bg-background/50 p-3 rounded-2xl border border-border/40">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-bold text-foreground">حالة الحساب</Label>
                      <p className="text-[10px] text-muted-foreground">
                        {selectedUser.status === 'active' ? 'مفعل وقيد الاستخدام' : 'معطل ومحظور الدخول'}
                      </p>
                    </div>
                    <Switch
                      checked={selectedUser.status === 'active'}
                      onCheckedChange={toggleUserStatus}
                      disabled={isSelectedCurrentUser}
                    />
                  </div>

                  {/* Reset to Role Defaults */}
                  <div className="flex items-center justify-center bg-background/50 p-3 rounded-2xl border border-border/40">
                    <Button
                      variant="outline"
                      onClick={resetAllToRoleDefaults}
                      className="w-full h-9 rounded-xl text-xs font-bold gap-1.5 border-border/60 hover:bg-primary/5 hover:text-primary"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      استعادة افتراضي الدور
                    </Button>
                  </div>
                </div>

                {/* Permissions Instant Search Bar */}
                <div className="relative mt-1">
                  <Search className="w-4 h-4 absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="ابحث عن صلاحية معينة (مثال: orders.cancel, payroll.pay, expenses)..."
                    value={permissionSearch}
                    onChange={(e) => setPermissionSearch(e.target.value)}
                    className="pr-10 rounded-2xl h-10 bg-background/60 border-border/60 text-xs font-mono"
                  />
                  {permissionSearch && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPermissionSearch('')}
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-7 px-2 text-xs"
                    >
                      مسح
                    </Button>
                  )}
                </div>
              </div>

              {/* Permissions Categories List */}
              <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 custom-scrollbar pb-12">
                {filteredCategories.map((category) => {
                  const Icon = iconMap[category.iconName] || Shield;
                  const catPerms = category.permissions.map((p) => p.id);
                  const enabledCount = catPerms.filter((p) => editPermissions.includes(p)).length;
                  const allEnabled = enabledCount === catPerms.length;

                  return (
                    <div
                      key={category.id}
                      className="rounded-3xl bg-card border border-border/50 hover:border-border/90 transition-all overflow-hidden shadow-sm"
                    >
                      {/* Category Header */}
                      <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 bg-muted/20">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                            enabledCount > 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                          )}>
                            <Icon className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-bold text-sm sm:text-base text-foreground">{category.label}</h3>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0 h-4 bg-background">
                                {enabledCount} / {catPerms.length}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">صلاحية مفعلة في هذا القسم</span>
                            </div>
                          </div>
                        </div>

                        {/* Category Quick Actions */}
                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleCategory(category.id)}
                            className="h-8 text-xs font-bold rounded-lg px-2.5 text-muted-foreground hover:text-foreground"
                          >
                            {allEnabled ? 'إلغاء الكل' : 'تحديد الكل'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => resetCategoryToRoleDefault(category.id)}
                            className="h-8 text-xs font-bold rounded-lg px-2.5 text-muted-foreground hover:text-primary gap-1"
                            title="إعادة الصلاحيات لهذا القسم إلى افتراضي الدور"
                          >
                            <RotateCcw className="w-3 h-3" />
                            افتراضي الدور
                          </Button>
                        </div>
                      </div>

                      {/* Permissions Grid */}
                      <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {category.permissions.map((perm) => {
                          const isChecked = editPermissions.includes(perm.id);
                          return (
                            <div
                              key={perm.id}
                              onClick={() => togglePermission(perm.id)}
                              className={cn(
                                'flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer select-none',
                                isChecked
                                  ? 'bg-primary/5 border-primary/20 text-foreground'
                                  : 'bg-muted/20 hover:bg-muted/40 border-transparent text-muted-foreground'
                              )}
                            >
                              <div className="space-y-0.5 pr-1">
                                <p className="text-xs sm:text-sm font-bold text-foreground">{perm.label}</p>
                                <p className="text-[10px] font-mono text-muted-foreground/70" dir="ltr">
                                  {perm.id}
                                </p>
                              </div>
                              <Switch
                                checked={isChecked}
                                onCheckedChange={() => togglePermission(perm.id)}
                                onClick={(e) => e.stopPropagation()}
                                className="scale-90"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[500px] flex items-center justify-center rounded-3xl border border-dashed border-border/60 bg-card/20 p-8 text-center">
              <div className="max-w-md space-y-4">
                <div className="w-20 h-20 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-inner">
                  <Shield className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-black text-foreground">مركز إدارة الصلاحيات والأدوار</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  اختر أحد الموظفين من القائمة لتعديل دوره الوظيفي، تخصيص صلاحياته، أو ربطه بفروع محددة.
                </p>
                <Button onClick={() => setShowAddUser(true)} className="rounded-2xl px-6 h-11 font-bold gap-2 shadow-md">
                  <UserPlus className="w-4 h-4" />
                  إضافة مستخدم جديد
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add User Dialog */}
      <Dialog open={showAddUser} onOpenChange={setShowAddUser}>
        <DialogContent className="max-w-md rounded-3xl font-cairo" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">إضافة موظف / مستخدم جديد</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleAddUser} className="space-y-4 py-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">الاسم الكامل للموظف</Label>
              <Input
                value={newUserForm.name}
                onChange={(e) => setNewUserForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="مثال: أحمد محمود"
                className="rounded-xl h-10"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold">البريد الإلكتروني (لتسجيل الدخول)</Label>
              <Input
                type="email"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="user@restaurant.com"
                className="rounded-xl h-10"
                required
                dir="ltr"
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-2xl bg-muted/20">
              <div className="space-y-0.5">
                <Label className="text-xs font-bold">تسجيل الدخول عبر Google</Label>
                <p className="text-[10px] text-muted-foreground">السماح بالدخول بحساب Google دون كلمة مرور</p>
              </div>
              <Switch checked={useGoogleAuth} onCheckedChange={setUseGoogleAuth} />
            </div>

            {!useGoogleAuth && (
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">كلمة المرور (6 أحرف على الأقل)</Label>
                <Input
                  type="password"
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="******"
                  className="rounded-xl h-10"
                  required={!useGoogleAuth}
                  dir="ltr"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">الدور الوظيفي المبدئي</Label>
                <Select
                  value={newUserForm.role}
                  onValueChange={(val) => setNewUserForm((f) => ({ ...f, role: val }))}
                >
                  <SelectTrigger className="rounded-xl h-10 text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {Object.values(ROLE_TEMPLATES).map((tmpl) => (
                      <SelectItem key={tmpl.key} value={tmpl.key} className="text-xs font-bold">
                        {tmpl.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">الفرع المخصص</Label>
                <Select
                  value={newUserForm.branchId}
                  onValueChange={(val) => setNewUserForm((f) => ({ ...f, branchId: val }))}
                >
                  <SelectTrigger className="rounded-xl h-10 text-xs font-bold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="all" className="text-xs font-bold">كل الفروع</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id} className="text-xs font-bold">
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="pt-3 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddUser(false)}
                className="rounded-xl h-10 text-xs font-bold"
              >
                إلغاء
              </Button>
              <Button
                type="submit"
                disabled={addingUser}
                className="rounded-xl h-10 text-xs font-bold gap-2 px-5"
              >
                {addingUser ? 'جاري الإضافة...' : 'إنشاء المستخدم'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete User Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-sm rounded-3xl font-cairo" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              تأكيد حذف المستخدم
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm text-muted-foreground leading-relaxed">
            <p>
              هل أنت متأكد من رغبتك في حذف حساب المستخدم{' '}
              <strong className="text-foreground">{selectedUser?.full_name}</strong> نهائياً؟
            </p>
            <p className="text-xs text-destructive/90 bg-destructive/10 p-2.5 rounded-xl border border-destructive/20">
              سيتم سحب جميع الصلاحيات والأدوار فوراً وحذف ملف الدخول.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-xl text-xs font-bold h-10"
            >
              إلغاء
            </Button>
            <Button
              variant="destructive"
              disabled={deletingUser}
              onClick={handleDeleteUser}
              className="rounded-xl text-xs font-bold h-10 gap-2"
            >
              {deletingUser ? 'جاري الحذف...' : 'تأكيد الحذف النهائي'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
