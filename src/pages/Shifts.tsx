import { useState, useEffect, useRef, useMemo } from 'react';
import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Clock, Plus, Edit, Trash2, Search, Eye, Printer, DollarSign, Activity, Users, Wallet, TrendingUp, AlertCircle, Timer, CheckCircle2, ChevronRight, Calendar, ArrowRight, Package } from "lucide-react";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { motion } from 'framer-motion';
import { useTenantBranch, useHR } from '@/hooks/useDatabase';
import { useAuth } from '@/hooks/useAuth';
import { useAppStore } from '@/lib/store';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { printShiftReport } from '@/lib/thermalPrinter';
import { parseToDate } from '@/services/analytics/reportingTimezone';

const LiveShiftTimer = ({ startTime }: { startTime: string }) => {
  const [duration, setDuration] = useState('00:00:00');

  useEffect(() => {
    if (!startTime) return;
    const start = new Date(startTime).getTime();
    
    const updateTimer = () => {
      const now = new Date().getTime();
      const diff = Math.max(0, now - start);
      
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      
      setDuration(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  return <span className="font-mono tabular-nums tracking-wider">{duration}</span>;
};

export default function Shifts() {
  const { branchId, tenantId } = useTenantBranch();
  const { employees: dbEmployees } = useHR(tenantId);
  const { toast } = useToast();
  const { settings, currentBranch } = useAppStore();

  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // POS Shifts State
  const [posShifts, setPosShifts] = useState<any[]>([]);
  const [loadingPosShifts, setLoadingPosShifts] = useState(true);
  const [viewingShift, setViewingShift] = useState<any>(null);
  const [shiftOrders, setShiftOrders] = useState<any[]>([]);
  const [shiftExpenses, setShiftExpenses] = useState<any[]>([]);
  const [loadingShiftDetails, setLoadingShiftDetails] = useState(false);

  // Form State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<any>(null);
  const [employeeName, setEmployeeName] = useState('');
  const [shiftType, setShiftType] = useState('morning');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch POS cashier shifts
  const fetchPosShifts = async () => {
    if (!branchId && !tenantId) return;
    setLoadingPosShifts(true);
    try {
      // 1. Query modern cashier_shifts collection
      let q = branchId
        ? query(collection(db, 'cashier_shifts'), where('branchId', '==', branchId))
        : query(collection(db, 'cashier_shifts'), where('tenantId', '==', tenantId));
      let snapshot = await getDocs(q);

      // Fallback: check snake_case branch_id
      if (snapshot.empty && branchId) {
        const qSnake = query(collection(db, 'cashier_shifts'), where('branch_id', '==', branchId));
        const snapSnake = await getDocs(qSnake);
        if (!snapSnake.empty) snapshot = snapSnake;
      }

      // Fallback: check tenant_id if still empty
      if (snapshot.empty && tenantId) {
        const qTenant = query(collection(db, 'cashier_shifts'), where('tenant_id', '==', tenantId));
        const snapTenant = await getDocs(qTenant);
        if (!snapTenant.empty) snapshot = snapTenant;
      }

      // Fallback: check legacy pos_shifts if cashier_shifts has no rows
      if (snapshot.empty && branchId) {
        const qLegacy = query(collection(db, 'pos_shifts'), where('branch_id', '==', branchId));
        const snapLegacy = await getDocs(qLegacy);
        if (!snapLegacy.empty) snapshot = snapLegacy;
      }

      const data = snapshot.docs.map((doc) => {
        const d = doc.data() as any;
        const totalSalesVal =
          d.totalSales ??
          (Number(d.totalSalesCash) || 0) +
            (Number(d.totalSalesCard) || 0) +
            (Number(d.totalSalesOther) || 0) ??
          d.total_sales ??
          0;

        return {
          id: doc.id,
          ...d,
          cashier_name: d.cashierNameSnapshot || d.cashier_name || d.cashierId || 'كاشير',
          cashier_role: d.cashierRole || d.cashier_role || 'كاشير',
          status: d.status === 'open' || d.status === 'active' ? 'active' : 'closed',
          start_time: d.openedAt || d.start_time || d.created_at,
          end_time: d.closedAt || d.end_time || null,
          starting_cash: d.openingCash ?? d.starting_cash ?? d.opening_cash ?? 0,
          total_sales: totalSalesVal,
          cash_sales: d.totalSalesCash ?? d.cash_sales ?? 0,
          card_sales: d.totalSalesCard ?? d.card_sales ?? 0,
          wallet_sales: d.totalSalesOther ?? d.wallet_sales ?? 0,
          total_discounts: d.totalDiscounts ?? d.total_discounts ?? 0,
          actual_cash: d.closingCashActual ?? d.actual_cash ?? 0,
          discrepancy: d.cashDifference ?? d.discrepancy ?? 0,
          orders_count: d.totalSalesCount ?? d.orders_count ?? 0,
        };
      });

      // Sort client-side descending by start_time
      data.sort((a: any, b: any) => new Date(b.start_time || 0).getTime() - new Date(a.start_time || 0).getTime());
      setPosShifts(data);
    } catch (e) {
      console.error("Error fetching pos shifts", e);
      toast({ title: 'خطأ', description: 'فشل في تحميل ورديات الكاشير', variant: 'destructive' });
    } finally {
      setLoadingPosShifts(false);
    }
  };

  // Fetch Employee scheduled shifts
  const fetchShifts = async () => {
    if (!branchId && !tenantId) return;
    setLoading(true);
    try {
      const q = branchId
        ? query(collection(db, 'branch_shifts'), where('branch_id', '==', branchId))
        : query(collection(db, 'branch_shifts'), where('tenant_id', '==', tenantId));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setShifts(data);
    } catch (e) {
      console.error("Error fetching shifts", e);
      toast({ title: 'خطأ', description: 'فشل في تحميل مواعيد الموظفين', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (branchId || tenantId) {
      fetchShifts();
      fetchPosShifts();
    }
    const handleShiftSync = () => {
      fetchPosShifts();
    };
    window.addEventListener('alwan_shifts_synced', handleShiftSync);
    return () => {
      window.removeEventListener('alwan_shifts_synced', handleShiftSync);
    };
  }, [branchId, tenantId]);

  // Analytics Metrics
  const activePosShifts = posShifts.filter(s => s.status === 'active').length;
  
  // Today's total pos sales
  const today = new Date().toISOString().split('T')[0];
  const todayPosShifts = posShifts.filter(s => s.start_time && s.start_time.startsWith(today));
  const todayTotalSales = todayPosShifts.reduce((acc, s) => {
    const shiftSales = s.total_sales != null ? s.total_sales : ((s.cash_sales || 0) + (s.card_sales || 0) + (s.wallet_sales || 0));
    return acc + shiftSales;
  }, 0);
  const todayTotalCash = todayPosShifts.reduce((acc, s) => acc + (s.actual_cash || s.cash_sales || 0), 0);
  const todayDiscrepancy = todayPosShifts.reduce((acc, s) => acc + (s.discrepancy || 0), 0);

  // Filtered Lists
  const filteredPosShifts = posShifts.filter(shift => {
    const q = searchQuery.toLowerCase();
    const cashierMatch = (shift.cashier_name || '').toLowerCase().includes(q);
    const statusMatch = (shift.status === 'active' ? 'مفتوحة' : 'مغلقة').includes(q);
    return cashierMatch || statusMatch;
  });

  const filteredShifts = shifts.filter(shift => {
    const q = searchQuery.toLowerCase();
    const nameMatch = (shift.employee_name || '').toLowerCase().includes(q);
    const roleMatch = (shift.role || '').toLowerCase().includes(q);
    return nameMatch || roleMatch;
  });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchId) return;
    setIsSubmitting(true);
    try {
      const selectedEmp = dbEmployees.find(e => e.name === employeeName);
      await addDoc(collection(db, 'branch_shifts'), {
        branch_id: branchId,
        employee_name: employeeName,
        role: selectedEmp?.role || 'موظف',
        shift_type: shiftType,
        start_time: startTime,
        end_time: endTime,
        created_at: new Date().toISOString()
      });
      toast({ title: 'تمت الإضافة', description: 'تم تسجيل الوردية بنجاح' });
      setIsAddOpen(false);
      setEmployeeName(''); setStartTime(''); setEndTime('');
      fetchShifts();
    } catch (e) {
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء التسجيل', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShift) return;
    setIsSubmitting(true);
    try {
      const selectedEmpEdit = dbEmployees.find(e => e.name === editingShift.employee_name);
      await updateDoc(doc(db, 'branch_shifts', editingShift.id), {
        employee_name: editingShift.employee_name,
        role: selectedEmpEdit?.role || editingShift.role || 'موظف',
        shift_type: editingShift.shift_type,
        start_time: editingShift.start_time,
        end_time: editingShift.end_time,
      });
      toast({ title: 'تم التعديل', description: 'تم تحديث الوردية بنجاح' });
      setEditingShift(null);
      fetchShifts();
    } catch (e) {
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء التحديث', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الوردية؟')) return;
    try {
      await deleteDoc(doc(db, 'branch_shifts', id));
      toast({ title: 'تم الحذف', description: 'تم حذف الوردية بنجاح' });
      fetchShifts();
    } catch (e) {
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء الحذف', variant: 'destructive' });
    }
  };

  const handleDeletePosShift = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف وردية الكاشير هذه بكل بياناتها؟ هذه العملية لا يمكن التراجع عنها.')) return;
    try {
      await Promise.allSettled([
        deleteDoc(doc(db, 'cashier_shifts', id)),
        deleteDoc(doc(db, 'pos_shifts', id))
      ]);
      toast({ title: 'تم الحذف', description: 'تم حذف الوردية بنجاح' });
      fetchPosShifts();
    } catch (e) {
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء الحذف', variant: 'destructive' });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(amount || 0);
  };
  
  const formatDate = (isoString?: string) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleString('ar-EG', {
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const handleViewShift = async (shift: any) => {
    setViewingShift(shift);
    setLoadingShiftDetails(true);
    setShiftOrders([]);
    setShiftExpenses([]);

    try {
      // 1. Fetch Sales/Orders for this shift (sales with shiftId, plus fallback orders with shift_id)
      const [salesSnap1, salesSnap2, ordersSnap] = await Promise.allSettled([
        getDocs(query(collection(db, 'sales'), where('shiftId', '==', shift.id))),
        getDocs(query(collection(db, 'sales'), where('shift_id', '==', shift.id))),
        getDocs(query(collection(db, 'orders'), where('shift_id', '==', shift.id))),
      ]);

      const seen = new Set();
      const fetchedOrders: any[] = [];
      const allDocs: any[] = [];
      if (salesSnap1.status === 'fulfilled') allDocs.push(...salesSnap1.value.docs);
      if (salesSnap2.status === 'fulfilled') allDocs.push(...salesSnap2.value.docs);
      if (ordersSnap.status === 'fulfilled') allDocs.push(...ordersSnap.value.docs);

      allDocs.forEach((d) => {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          const data = d.data() as any;
          fetchedOrders.push({
            id: d.id,
            ...data,
            items: data.items || data.order_items || [],
            total: data.totalAmount ?? data.total ?? data.grandTotal ?? 0,
            status: data.status || data.saleStatus || 'completed',
            order_type: data.orderType || data.order_type || 'takeaway',
            created_at: data.createdAt || data.created_at || new Date().toISOString()
          });
        }
      });

      // Fallback: If no orders found directly by shiftId, search sales within shift time window
      if (fetchedOrders.length === 0) {
        try {
          const shiftStart = parseToDate(shift.start_time || shift.openedAt || shift.createdAt)?.getTime() || 0;
          const shiftEnd = parseToDate(shift.end_time || shift.closedAt || shift.updatedAt)?.getTime() || Date.now();
          
          let salesDocs: any[] = [];
          if (tenantId) {
            try {
              const snap = await getDocs(query(collection(db, 'sales'), where('tenantId', '==', tenantId)));
              salesDocs.push(...snap.docs);
            } catch {}
            if (salesDocs.length === 0) {
              try {
                const snap = await getDocs(query(collection(db, 'sales'), where('tenant_id', '==', tenantId)));
                salesDocs.push(...snap.docs);
              } catch {}
            }
          }
          if (salesDocs.length === 0) {
            try {
              const snap = await getDocs(collection(db, 'sales'));
              salesDocs.push(...snap.docs);
            } catch {}
          }

          const sCashierId = shift.cashierId || shift.cashier_id || shift.userId;
          const sCashierName = shift.cashierNameSnapshot || shift.cashier_name || shift.cashierName;

          salesDocs.forEach((d) => {
            if (!seen.has(d.id)) {
              const data = d.data() as any;
              const dDate = parseToDate(data.createdAt || data.created_at || data.completedAt || data.timestamp || data.date);
              if (!dDate) return;
              const dTime = dDate.getTime();
              
              const matchesCashier = !sCashierId || data.cashierId === sCashierId || data.cashierNameSnapshot === sCashierName;
              const matchesBranch = !shift.branchId && !shift.branch_id || (data.branchId === (shift.branchId || shift.branch_id));

              if (dTime >= shiftStart && dTime <= shiftEnd && (matchesCashier || matchesBranch)) {
                seen.add(d.id);
                fetchedOrders.push({
                  id: d.id,
                  ...data,
                  items: data.items || data.order_items || [],
                  total: data.totalAmount ?? data.total ?? data.grandTotal ?? 0,
                  status: data.status || data.saleStatus || 'completed',
                  order_type: data.orderType || data.order_type || 'takeaway',
                  created_at: dDate.toISOString()
                });
              }
            }
          });
        } catch (fbErr) {
          console.warn('Orders fallback failed:', fbErr);
        }
      }

      setShiftOrders(fetchedOrders);

      // 2. Fetch Expenses for this shift (shiftId or shift_id)
      const [expSnap1, expSnap2] = await Promise.allSettled([
        getDocs(query(collection(db, 'expenses'), where('shiftId', '==', shift.id))),
        getDocs(query(collection(db, 'expenses'), where('shift_id', '==', shift.id))),
      ]);
      const expSeen = new Set();
      const fetchedExpenses: any[] = [];
      const allExpDocs: any[] = [];
      if (expSnap1.status === 'fulfilled') allExpDocs.push(...expSnap1.value.docs);
      if (expSnap2.status === 'fulfilled') allExpDocs.push(...expSnap2.value.docs);

      allExpDocs.forEach((d) => {
        if (!expSeen.has(d.id)) {
          expSeen.add(d.id);
          fetchedExpenses.push({ id: d.id, ...d.data() });
        }
      });

      // Fallback: If no expenses found by shiftId, search within shift time window
      if (fetchedExpenses.length === 0) {
        try {
          const shiftStart = parseToDate(shift.start_time || shift.openedAt || shift.createdAt)?.getTime() || 0;
          const shiftEnd = parseToDate(shift.end_time || shift.closedAt || shift.updatedAt)?.getTime() || Date.now();
          
          let expDocs: any[] = [];
          if (tenantId) {
            try {
              const snap = await getDocs(query(collection(db, 'expenses'), where('tenantId', '==', tenantId)));
              expDocs.push(...snap.docs);
            } catch {}
          }
          if (expDocs.length === 0) {
            try {
              const snap = await getDocs(collection(db, 'expenses'));
              expDocs.push(...snap.docs);
            } catch {}
          }

          expDocs.forEach((d) => {
            if (!expSeen.has(d.id)) {
              const data = d.data() as any;
              const eDate = parseToDate(data.date || data.createdAt || data.created_at || data.timestamp);
              if (!eDate) return;
              const eTime = eDate.getTime();
              if (eTime >= shiftStart && eTime <= shiftEnd) {
                expSeen.add(d.id);
                fetchedExpenses.push({ id: d.id, ...data });
              }
            }
          });
        } catch (fbExpErr) {
          console.warn('Expenses fallback failed:', fbExpErr);
        }
      }

      setShiftExpenses(fetchedExpenses);

    } catch (error) {
      console.error("Error fetching shift full details:", error);
      toast({ title: 'تنبيه', description: 'تعذر جلب جميع تفاصيل العمليات للوردية', variant: 'destructive' });
    } finally {
      setLoadingShiftDetails(false);
    }
  };

  const confirmedShiftOrders = shiftOrders.filter(o => o.status !== 'cancelled');
  const deliveryCount = confirmedShiftOrders.filter(o => o.order_type === 'delivery' || o.type === 'delivery').length;
  const takeawayCount = confirmedShiftOrders.filter(o => o.order_type === 'takeaway' || o.type === 'takeaway').length;
  const dineinCount = confirmedShiftOrders.filter(o => o.order_type === 'dine_in' || o.type === 'dine_in').length;
  const totalDeliveryFees = confirmedShiftOrders.reduce((sum, o) => sum + (Number(o.delivery_fee) || 0), 0);

  // Aggregated sold items breakdown (الأصناف والكميات المباعة بالوردية)
  const shiftSoldItems = useMemo(() => {
    const map = new Map<string, { name: string; quantity: number; total: number }>();
    confirmedShiftOrders.forEach((o) => {
      const itemsList = o.items || o.order_items || [];
      itemsList.forEach((it: any) => {
        const name = it.productNameSnapshot || it.productName || it.name || 'صنف مسجل';
        const qty = Number(it.quantity || it.qty || 1);
        const price = Number(it.unitPrice || it.unitSellingPrice || it.price || 0);
        const lineTotal = Number(it.lineTotal || it.total || (qty * price));
        
        const existing = map.get(name) || { name, quantity: 0, total: 0 };
        existing.quantity += qty;
        existing.total += lineTotal;
        map.set(name, existing);
      });
    });
    return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
  }, [confirmedShiftOrders]);

  const totalUniqueItemsCount = shiftSoldItems.length;
  const totalUnitsSoldCount = shiftSoldItems.reduce((acc, item) => acc + item.quantity, 0);

  // Employee role lookup
  const employeeRole = useMemo(() => {
    if (!viewingShift) return 'كاشير';
    const cId = viewingShift.cashier_id || viewingShift.cashierId || viewingShift.userId;
    const cName = viewingShift.cashier_name || viewingShift.cashierName;
    const emp = dbEmployees?.find((e: any) => (cId && e.id === cId) || (cName && e.name === cName));
    return emp?.role || viewingShift.cashier_role || viewingShift.role || 'كاشير';
  }, [viewingShift, dbEmployees]);

  // Print Thermal Z-Report
  const handlePrintReport = () => {
    if (!viewingShift) return;
    printShiftReport(
      {
        ...viewingShift,
        employee_role: employeeRole,
        total_unique_items: totalUniqueItemsCount,
        total_units_sold: totalUnitsSoldCount,
        sold_items: shiftSoldItems,
      },
      confirmedShiftOrders,
      shiftExpenses,
      settings,
      currentBranch?.name || 'مكتبة ألوان التجارية'
    );
  };

  return (
    <MainLayout
      title="إدارة الورديات والكاشير"
      subtitle="مراقبة الورديات النقدية والتقارير المالية ومواعيد الموظفين."
      actions={
        <div className="relative w-full sm:w-64">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="بحث بالكاشير أو الحالة..."
            className="pr-9 w-full text-base sm:text-sm h-10 rounded-xl"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      }
    >
      <div className="grid gap-4 sm:gap-6 pb-20">
        
        {/* Analytics Widgets */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="hover:shadow-md transition-all border-none shadow-sm relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-emerald-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1 truncate">الورديات المفتوحة</p>
                    <h3 className="text-2xl sm:text-3xl font-black truncate">{activePosShifts}</h3>
                  </div>
                  <div className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform shadow-sm">
                    <Activity className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="hover:shadow-md transition-all border-none shadow-sm relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1 truncate">مبيعات ورديات اليوم</p>
                    <h3 className="text-xl sm:text-2xl font-black truncate">{formatCurrency(todayTotalSales)}</h3>
                  </div>
                  <div className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform shadow-sm">
                    <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="hover:shadow-md transition-all border-none shadow-sm relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1 truncate">التحصيل النقدي الفعلي</p>
                    <h3 className="text-xl sm:text-2xl font-black truncate">{formatCurrency(todayTotalCash)}</h3>
                  </div>
                  <div className="w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform shadow-sm">
                    <Wallet className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
             <Card className="hover:shadow-md transition-all border-none shadow-sm relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-orange-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1 truncate">العجز والزيادة (اليوم)</p>
                    <h3 className={`text-xl sm:text-2xl font-black truncate ${todayDiscrepancy < 0 ? 'text-red-500' : todayDiscrepancy > 0 ? 'text-green-500' : ''}`} dir="ltr">
                      {todayDiscrepancy > 0 ? '+' : ''}{formatCurrency(todayDiscrepancy)}
                    </h3>
                  </div>
                  <div className={`w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm ${
                    todayDiscrepancy < 0 
                      ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' 
                      : todayDiscrepancy > 0 ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                  }`}>
                    {todayDiscrepancy < 0 ? <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6" /> : <DollarSign className="w-5 h-5 sm:w-6 sm:h-6" />}
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <Tabs defaultValue="pos_shifts" className="space-y-4 sm:space-y-6">
          <TabsList className="grid grid-cols-2 w-full max-w-md h-auto p-1 bg-muted/40 border rounded-xl">
            <TabsTrigger value="pos_shifts" className="gap-1.5 sm:gap-2 py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:shadow-sm">
              <DollarSign className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">ورديات الكاشير</span>
            </TabsTrigger>
            <TabsTrigger value="employee_shifts" className="gap-1.5 sm:gap-2 py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:shadow-sm">
              <Clock className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">مواعيد الموظفين</span>
            </TabsTrigger>
          </TabsList>

          {/* POS Shifts Tab */}
          <TabsContent value="pos_shifts">
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Activity className="w-5 h-5 text-primary flex-shrink-0" />
                      سجلات ورديات الكاشير المتكاملة
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm mt-1">
                      عرض تقارير الورديات المالية، الزيادات والعجوزات التفصيلية
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-xs font-semibold px-2.5 py-1">
                    {filteredPosShifts.length} وردية
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
                {/* Desktop View: Table */}
                <div className="hidden md:block rounded-xl border border-border/50 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الكاشير</TableHead>
                        <TableHead>الحالة</TableHead>
                        <TableHead>وقت الفتح</TableHead>
                        <TableHead>وقت الإغلاق</TableHead>
                        <TableHead className="text-right">العهدة (الافتتاحية)</TableHead>
                        <TableHead className="text-right">المبيعات الإجمالية</TableHead>
                        <TableHead className="text-center">العجز / الزيادة</TableHead>
                        <TableHead className="text-center">الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingPosShifts ? (
                        <TableRow>
                          <TableCell colSpan={8} className="h-24 text-center">
                            <div className="flex justify-center items-center">
                              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : filteredPosShifts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="h-48 text-center bg-gray-50/50 dark:bg-slate-900/20">
                            <div className="flex flex-col flex-1 items-center justify-center p-8 text-muted-foreground">
                              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                                <Wallet className="w-8 h-8 opacity-20" />
                              </div>
                              <p className="text-lg font-bold mb-1">لا توجد ورديات كاشير مسجلة</p>
                              <p className="text-sm">قم بفتح الوردية من نقطة البيع أو ابحث بكلمة أخرى</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredPosShifts.map((shift) => {
                           const discrepancy = shift.discrepancy || 0;
                           const isDiscrepancyZero = Math.abs(discrepancy) < 0.01;
                           const discrepancyClass = isDiscrepancyZero 
                              ? 'text-gray-500' 
                              : (discrepancy < 0 ? 'text-red-500 border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20' : 'text-green-600 border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-900/20');

                           return (
                            <TableRow key={shift.id} className="cursor-pointer hover:bg-muted/30 transition-colors group" onDoubleClick={() => handleViewShift(shift)}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <Avatar className="h-9 w-9 border-2 border-primary/10 shadow-sm shadow-primary/10">
                                    <AvatarFallback className="bg-primary/5 text-primary text-[10px] font-bold">
                                      {shift.cashier_name?.substring(0, 2)?.toUpperCase() || 'م'}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <p className="font-bold text-sm tracking-tight">{shift.cashier_name || 'غير محدد'}</p>
                                    <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{shift.cashier_role || 'كاشير'}</p>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                {shift.status === 'active' ? (
                                  <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 gap-1.5 py-1 px-3">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-[pulse_1s_ease-in-out_infinite]" /> مفتوحة
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="gap-1.5 font-medium py-1 px-3">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> مغلقة
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col">
                                  <span className="font-medium text-[13px]">{formatDate(shift.start_time)}</span>
                                  {shift.status === 'active' && (
                                     <span className="text-[11px] text-primary flex items-center gap-1 mt-0.5 font-semibold bg-primary/5 px-1 pb-0.5 rounded-sm w-fit border border-primary/10">
                                       <Timer className="w-3 h-3" />
                                       <LiveShiftTimer startTime={shift.start_time} />
                                     </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className={`text-[13px] ${!shift.end_time ? 'text-muted-foreground italic' : 'font-medium'}`}>
                                  {shift.end_time ? formatDate(shift.end_time) : 'قيد العمل...'}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                <span className="bg-secondary/50 px-2 py-1 rounded-md text-[13px] border border-border/50 shadow-inner">{formatCurrency(shift.starting_cash)}</span>
                              </TableCell>
                              <TableCell className="text-right">
                                <span className="font-bold text-[14px] text-primary">{formatCurrency(shift.total_sales != null ? shift.total_sales : ((shift.cash_sales||0) + (shift.card_sales||0) + (shift.wallet_sales||0)))}</span>
                              </TableCell>
                              <TableCell className="text-center">
                                {shift.status === 'closed' ? (
                                  <Badge variant="outline" className={`py-1 px-2 text-[12px] tabular-nums font-bold ${discrepancyClass}`}>
                                    <span dir="ltr">{discrepancy > 0 ? '+' : ''}{formatCurrency(discrepancy)}</span>
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-xs opacity-50 font-bold">---</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex justify-center items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-primary bg-primary/5 hover:bg-primary/20 hover:text-primary transition-colors rounded-full" onClick={(e) => { e.stopPropagation(); handleViewShift(shift); }} title="عرض التقرير المفصل">
                                    <Eye className="w-4 h-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive bg-destructive/5 hover:bg-destructive/20 hover:text-destructive transition-colors rounded-full" onClick={(e) => { e.stopPropagation(); handleDeletePosShift(shift.id); }} title="حذف الوردية">
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                           );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile View: Responsive Shift Cards */}
                <div className="md:hidden space-y-3">
                  {loadingPosShifts ? (
                    <div className="p-8 text-center bg-card border rounded-xl flex flex-col items-center justify-center gap-3">
                      <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-muted-foreground">جاري تحميل ورديات الكاشير...</p>
                    </div>
                  ) : filteredPosShifts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center bg-card rounded-xl border border-dashed border-border text-muted-foreground">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <Wallet className="w-6 h-6 opacity-30" />
                      </div>
                      <p className="text-sm font-bold text-foreground mb-1">لا توجد ورديات كاشير مسجلة</p>
                      <p className="text-xs">قم بفتح وردية من نقطة البيع أو غيّر عبارة البحث</p>
                    </div>
                  ) : (
                    filteredPosShifts.map((shift) => {
                      const discrepancy = shift.discrepancy || 0;
                      const isDiscrepancyZero = Math.abs(discrepancy) < 0.01;
                      const discrepancyClass = isDiscrepancyZero 
                        ? 'text-muted-foreground bg-muted/50 border-border' 
                        : (discrepancy < 0 ? 'text-red-600 border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20' : 'text-green-600 border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-900/20');
                      const totalSales = shift.total_sales != null ? shift.total_sales : ((shift.cash_sales || 0) + (shift.card_sales || 0) + (shift.wallet_sales || 0));

                      return (
                        <div
                          key={shift.id}
                          className="bg-card rounded-xl border border-border/70 p-3.5 shadow-sm space-y-3 hover:border-primary/40 transition-colors"
                        >
                          {/* Card Header: Cashier info + Status */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <Avatar className="h-10 w-10 border border-primary/20 flex-shrink-0">
                                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                  {shift.cashier_name?.substring(0, 2)?.toUpperCase() || 'م'}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-sm text-foreground truncate">{shift.cashier_name || 'غير محدد'}</p>
                                <p className="text-[11px] text-muted-foreground truncate">{shift.cashier_role || 'كاشير'}</p>
                              </div>
                            </div>
                            <div className="flex-shrink-0">
                              {shift.status === 'active' ? (
                                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 text-xs gap-1.5 py-0.5 px-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-[pulse_1s_ease-in-out_infinite]" /> مفتوحة
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs font-medium py-0.5 px-2">
                                  مغلقة
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Time & Duration */}
                          <div className="bg-muted/40 rounded-lg p-2.5 space-y-1.5 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-muted-foreground" /> وقت الفتح:
                              </span>
                              <span className="font-semibold text-foreground">{formatDate(shift.start_time)}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-muted-foreground" /> وقت الإغلاق:
                              </span>
                              <span className="font-semibold text-foreground">
                                {shift.end_time ? formatDate(shift.end_time) : (
                                  <span className="text-primary flex items-center gap-1 font-semibold">
                                    <Timer className="w-3.5 h-3.5" /> <LiveShiftTimer startTime={shift.start_time} />
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>

                          {/* Financial mini stats */}
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="bg-muted/30 border border-border/50 rounded-lg p-2">
                              <p className="text-[10px] text-muted-foreground truncate">العهدة</p>
                              <p className="text-xs font-bold text-foreground mt-0.5 truncate">{formatCurrency(shift.starting_cash || 0)}</p>
                            </div>
                            <div className="bg-muted/30 border border-border/50 rounded-lg p-2">
                              <p className="text-[10px] text-muted-foreground truncate">المبيعات</p>
                              <p className="text-xs font-bold text-primary mt-0.5 truncate">{formatCurrency(totalSales)}</p>
                            </div>
                            <div className="bg-muted/30 border border-border/50 rounded-lg p-2">
                              <p className="text-[10px] text-muted-foreground truncate">العجز/الزيادة</p>
                              {shift.status === 'closed' ? (
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 mt-0.5 truncate ${discrepancyClass}`}>
                                  <span dir="ltr">{discrepancy > 0 ? '+' : ''}{formatCurrency(discrepancy)}</span>
                                </Badge>
                              ) : (
                                <span className="text-[11px] text-muted-foreground font-bold opacity-60">---</span>
                              )}
                            </div>
                          </div>

                          {Number(shift.total_discounts || 0) > 0 && (
                            <div className="flex justify-between items-center px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 rounded-lg text-xs font-semibold">
                              <span>الخصومات الممنوحة بالوردية:</span>
                              <span className="font-bold">-{formatCurrency(shift.total_discounts)}</span>
                            </div>
                          )}

                          {/* Card Actions Footer */}
                          <div className="flex items-center gap-2 pt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 min-h-[44px] h-11 text-xs font-bold gap-1.5 border-primary/30 text-primary hover:bg-primary/10 rounded-xl"
                              onClick={() => handleViewShift(shift)}
                            >
                              <Eye className="w-4 h-4" />
                              تقرير التقفيل (Z-Report)
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="min-h-[44px] min-w-[44px] h-11 w-11 text-destructive hover:bg-destructive/10 rounded-xl flex-shrink-0"
                              onClick={() => handleDeletePosShift(shift.id)}
                              title="حذف الوردية"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Employee Shifts Tab */}
          <TabsContent value="employee_shifts">
            <Card className="border-border/60 shadow-sm">
              <CardHeader className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                      <Clock className="w-5 h-5 text-primary flex-shrink-0" />
                      جدول مواعيد الموظفين
                    </CardTitle>
                    <CardDescription className="text-xs sm:text-sm mt-1">
                      إضافة وتعديل أوقات الوردية الثابتة للموظفين
                    </CardDescription>
                  </div>
                  <Button onClick={() => setIsAddOpen(true)} className="gap-2 w-full sm:w-auto min-h-[44px] sm:min-h-0 h-10 rounded-xl font-bold">
                    <Plus className="w-4 h-4" /> إضافة موعد وردية
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
                {/* Desktop View: Table */}
                <div className="hidden md:block rounded-xl border border-border/50 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>الموظف</TableHead>
                        <TableHead>نوع الوردية</TableHead>
                        <TableHead>وقت البدء</TableHead>
                        <TableHead>وقت الانتهاء</TableHead>
                        <TableHead className="text-center">الإجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-24 text-center">
                            <div className="flex justify-center items-center">
                              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : filteredShifts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="h-48 text-center bg-gray-50/50 dark:bg-slate-900/20">
                            <div className="flex flex-col flex-1 items-center justify-center p-8 text-muted-foreground">
                              <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                                <Users className="w-8 h-8 opacity-20" />
                              </div>
                              <p className="text-lg font-bold mb-1">لا توجد مواعيد موظفين مسجلة</p>
                              <p className="text-sm">أضف وردية موظف جديدة أو غيّر كلمات البحث</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredShifts.map((shift) => (
                          <TableRow key={shift.id} className="group hover:bg-muted/30 transition-colors">
                            <TableCell>
                              <div className="flex items-center gap-3">
                                <Avatar className="h-9 w-9 border-2 border-primary/10 shadow-sm shadow-primary/10">
                                  <AvatarFallback className="bg-primary/5 text-primary text-[10px] font-bold">
                                    {shift.employee_name?.substring(0, 2)?.toUpperCase() || 'م'}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-bold text-sm tracking-tight">{shift.employee_name || 'غير محدد'}</p>
                                  <p className="text-[10px] text-muted-foreground">{shift.role || 'موظف'}</p>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-blue-50/50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                                {shift.shift_type === 'morning' ? 'صباحية' : shift.shift_type === 'evening' ? 'مسائية' : 'ليلية'}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-medium text-[13px]">{shift.start_time}</TableCell>
                            <TableCell>
                              <span className={`text-[13px] ${!shift.end_time ? 'text-muted-foreground italic' : 'font-medium'}`}>
                                {shift.end_time || '-'}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex justify-center gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors rounded-full" onClick={() => setEditingShift(shift)}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive bg-destructive/5 hover:bg-destructive/20 hover:text-destructive transition-colors rounded-full" onClick={() => handleDelete(shift.id)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile View: Responsive Employee Shift Cards */}
                <div className="md:hidden space-y-3">
                  {loading ? (
                    <div className="p-8 text-center bg-card border rounded-xl flex flex-col items-center justify-center gap-3">
                      <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <p className="text-xs text-muted-foreground">جاري تحميل مواعيد الموظفين...</p>
                    </div>
                  ) : filteredShifts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center bg-card rounded-xl border border-dashed border-border text-muted-foreground">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <Users className="w-6 h-6 opacity-30" />
                      </div>
                      <p className="text-sm font-bold text-foreground mb-1">لا توجد مواعيد موظفين مسجلة</p>
                      <p className="text-xs">اضغط "إضافة موعد وردية" لتسجيل جدول عمل جديد</p>
                    </div>
                  ) : (
                    filteredShifts.map((shift) => (
                      <div
                        key={shift.id}
                        className="bg-card rounded-xl border border-border/70 p-3.5 shadow-sm space-y-3 hover:border-primary/40 transition-colors"
                      >
                        {/* Header: Employee Info + Shift Type */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <Avatar className="h-10 w-10 border border-primary/20 flex-shrink-0">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                {shift.employee_name?.substring(0, 2)?.toUpperCase() || 'م'}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-sm text-foreground truncate">{shift.employee_name || 'غير محدد'}</p>
                              <p className="text-[11px] text-muted-foreground truncate">{shift.role || 'موظف'}</p>
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs font-semibold bg-blue-50/50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                            {shift.shift_type === 'morning' ? 'صباحية' : shift.shift_type === 'evening' ? 'مسائية' : 'ليلية'}
                          </Badge>
                        </div>

                        {/* Working Hours Banner */}
                        <div className="bg-muted/40 rounded-lg p-2.5 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="w-3.5 h-3.5 text-primary" />
                            <span>ساعات العمل:</span>
                          </div>
                          <div className="flex items-center gap-1.5 font-bold text-foreground" dir="ltr">
                            <span>{shift.start_time || '--:--'}</span>
                            <span className="text-muted-foreground">→</span>
                            <span>{shift.end_time || '--:--'}</span>
                          </div>
                        </div>

                        {/* Card Actions Footer */}
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 min-h-[44px] h-11 text-xs font-bold gap-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl"
                            onClick={() => setEditingShift(shift)}
                          >
                            <Edit className="w-4 h-4" />
                            تعديل الوردية
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="min-h-[44px] min-w-[44px] h-11 w-11 text-destructive hover:bg-destructive/10 rounded-xl flex-shrink-0"
                            onClick={() => handleDelete(shift.id)}
                            title="حذف الوردية"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* POS Shift Details Dialog (Z-Report) */}
      <Dialog open={!!viewingShift} onOpenChange={(open) => !open && setViewingShift(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-[480px] p-0 overflow-hidden border-0 shadow-2xl rounded-2xl bg-white dark:bg-slate-950 max-h-[90dvh] flex flex-col">
          <div className="flex flex-col h-full max-h-[90dvh]">
            <div className="bg-slate-50 dark:bg-slate-900 border-b p-3.5 sm:p-4 flex justify-between items-center z-10 sticky top-0 shadow-sm print:hidden">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-sm leading-none truncate">تقرير التقفيل النهائي (Z-Report)</h3>
                  <p className="text-[11px] text-muted-foreground mt-1 truncate">تفاصيل وحالة الوردية</p>
                </div>
              </div>
              <Badge variant={viewingShift?.status === 'active' ? 'default' : 'secondary'} className={`flex-shrink-0 ${viewingShift?.status === 'active' ? 'bg-green-500' : ''}`}>
                {viewingShift?.status === 'active' ? 'مفتوحة الآن' : 'مغلقة'}
              </Badge>
            </div>

            <div className="flex-1 overflow-y-auto w-full p-4 sm:p-6 custom-scrollbar" dir="rtl">
            {loadingShiftDetails ? (
              <div className="p-12 flex flex-col justify-center items-center w-full min-h-[300px]">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-sm text-muted-foreground animate-pulse">جاري سحب بيانات تقرير الوردية...</p>
              </div>
            ) : (
           <div className="flex flex-col gap-4 sm:gap-6" dir="rtl">
              <div className="text-center">
                <h1 className="text-xl font-black mb-1">{settings?.invoiceCompanyName || 'MK'}</h1>
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground flex-wrap mt-1">
                  <span>الموظف: <span className="font-bold text-foreground">{viewingShift?.cashier_name || 'غير محدد'}</span></span>
                  <span>•</span>
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs px-2.5 py-0.5 font-bold">
                    الدور: {employeeRole}
                  </Badge>
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-4">
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border">
                    <p className="text-xs text-muted-foreground mb-1">وقت الفتح</p>
                    <p className="text-xs sm:text-sm font-bold">{viewingShift?.start_time ? new Date(viewingShift.start_time).toLocaleString('ar-EG') : '-'}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border">
                    <p className="text-xs text-muted-foreground mb-1">وقت الإغلاق</p>
                    {viewingShift?.status === 'active' ? (
                       <div className="text-xs sm:text-sm font-bold text-primary flex items-center gap-1.5"><Timer className="w-3.5 h-3.5"/> <LiveShiftTimer startTime={viewingShift.start_time} /></div>
                    ) : (
                       <p className="text-xs sm:text-sm font-bold">{viewingShift?.end_time ? new Date(viewingShift.end_time).toLocaleString('ar-EG') : '-'}</p>
                    )}
                  </div>
              </div>

              <div className="space-y-4">
                  <div>
                    <h3 className="font-bold text-sm mb-2.5 flex items-center gap-2"><DollarSign className="w-4 h-4 text-primary" /> الدخل التفصيلي</h3>
                    <div className="space-y-2 text-sm bg-slate-50 dark:bg-slate-900/50 p-3.5 sm:p-4 rounded-xl border">
                        <div className="flex justify-between py-1.5 border-b border-border/50 border-dashed text-xs sm:text-sm">
                          <span className="text-muted-foreground">العهدة الافتتاحية (المستلمة):</span>
                          <span className="font-medium">{formatCurrency(viewingShift?.starting_cash || 0)}</span>
                        </div>
                        <div className="flex justify-between py-1.5 border-b border-border/50 border-dashed text-xs sm:text-sm">
                          <span className="text-muted-foreground">المبيعات النقدية (كاش):</span>
                          <span className="font-medium text-green-600">+ {formatCurrency(viewingShift?.cash_sales || 0)}</span>
                        </div>
                        <div className="flex justify-between py-1.5 border-b border-border/50 border-dashed text-xs sm:text-sm">
                          <span className="text-muted-foreground">مبيعات البطاقات (شبكة):</span>
                          <span className="font-medium text-blue-600">{formatCurrency(viewingShift?.card_sales || 0)}</span>
                        </div>
                        <div className="flex justify-between py-1.5 border-b border-border/50 border-dashed text-xs sm:text-sm">
                          <span className="text-muted-foreground">مبيعات إلكترونية (تطبيقات):</span>
                          <span className="font-medium text-purple-600">{formatCurrency(viewingShift?.wallet_sales || 0)}</span>
                        </div>
                        {Number(viewingShift?.total_discounts || 0) > 0 && (
                          <div className="flex justify-between py-1.5 border-b border-border/50 border-dashed text-xs sm:text-sm">
                            <span className="text-muted-foreground">إجمالي الخصومات الممنوحة:</span>
                            <span className="font-medium text-rose-600">- {formatCurrency(viewingShift?.total_discounts || 0)}</span>
                          </div>
                        )}
                        <div className="flex justify-between py-2 mt-1 text-xs sm:text-sm">
                          <span className="font-bold">إجمالي المبيعات (بدون التوصيل):</span>
                          <span className="font-bold">{formatCurrency(viewingShift?.total_sales != null ? viewingShift.total_sales : ((viewingShift?.cash_sales || 0) + (viewingShift?.card_sales || 0) + (viewingShift?.wallet_sales || 0)))}</span>
                        </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-sm mb-2.5 flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /> تفاصيل الطلبات ({confirmedShiftOrders.length})</h3>
                    <div className="grid grid-cols-3 gap-2">
                       <span className="bg-slate-50 dark:bg-slate-900/50 text-center text-xs py-2 rounded-lg border">
                          دليفري: <b>{deliveryCount}</b>
                       </span>
                       <span className="bg-slate-50 dark:bg-slate-900/50 text-center text-xs py-2 rounded-lg border">
                          تيك أواي: <b>{takeawayCount}</b>
                       </span>
                       <span className="bg-slate-50 dark:bg-slate-900/50 text-center text-xs py-2 rounded-lg border">
                          صالة: <b>{dineinCount}</b>
                       </span>
                    </div>
                  </div>

                  {/* Detailed Items Sold Breakdown */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-sm flex items-center gap-2">
                        <Package className="w-4 h-4 text-primary" /> الأصناف والكميات المباعة ({totalUnitsSoldCount} قطعة)
                      </h3>
                      <span className="text-xs bg-primary/10 text-primary font-bold px-2 py-0.5 rounded-full">
                        {totalUniqueItemsCount} صنف مختلف
                      </span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-border/80 overflow-hidden">
                      {shiftSoldItems.length > 0 ? (
                        <div className="max-h-52 overflow-y-auto divide-y divide-border/50 text-xs custom-scrollbar">
                          <div className="bg-muted/70 px-3 py-1.5 flex justify-between text-[11px] font-bold text-muted-foreground sticky top-0 backdrop-blur-sm z-10">
                            <span>اسم الصنف</span>
                            <div className="flex gap-4 items-center">
                              <span className="w-14 text-center">الكمية</span>
                              <span className="w-20 text-left">الإجمالي</span>
                            </div>
                          </div>
                          {shiftSoldItems.map((it, idx) => (
                            <div key={idx} className="px-3 py-1.5 flex justify-between items-center hover:bg-muted/30 transition-colors">
                              <span className="font-medium truncate max-w-[200px]" title={it.name}>{it.name}</span>
                              <div className="flex items-center gap-4 shrink-0">
                                <Badge variant="secondary" className="w-14 justify-center text-xs font-mono font-bold">
                                  {it.quantity} قطعة
                                </Badge>
                                <span className="w-20 text-left font-bold text-foreground font-mono">
                                  {formatCurrency(it.total)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground text-xs">
                          لا توجد أصناف مسجلة في فواتير هذه الوردية
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-bold text-sm mb-2.5 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" /> المصروفات والسحوبات <span className="text-xs font-normal bg-secondary px-2 rounded-full mr-auto">{shiftExpenses.length} عناصر</span></h3>
                    <div className="space-y-2 text-sm bg-slate-50 dark:bg-slate-900/50 p-3.5 sm:p-4 rounded-xl border">
                        {shiftExpenses.length > 0 ? (
                          shiftExpenses.map((e, idx) => (
                            <div key={idx} className="flex justify-between py-1 border-b border-border/50 border-dashed last:border-0 pl-1 pr-1 text-xs sm:text-sm">
                              <span className="text-muted-foreground truncate">{e.description || 'مصروف'}</span>
                              <span className="flex-shrink-0 font-medium">{formatCurrency(Number(e.amount))}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-2 text-muted-foreground text-xs">لا توجد مصروفات سجلت في هذه الوردية</div>
                        )}
                        {shiftExpenses.length > 0 && (
                          <div className="flex justify-between py-2 border-t font-bold mt-1 text-xs sm:text-sm">
                            <span>إجمالي المصروفات:</span>
                            <span className="text-red-500">- {formatCurrency(viewingShift?.shift_expenses || 0)}</span>
                          </div>
                        )}
                    </div>
                  </div>

                  <div className="pt-1">
                    <h3 className="font-bold text-sm mb-2.5 flex items-center gap-2"><Wallet className="w-4 h-4 text-primary" /> تسوية الدرج (النقدية فقط)</h3>
                    <div className="bg-primary/5 border border-primary/20 p-3.5 sm:p-4 rounded-xl">
                      <div className="flex justify-between py-1 mb-2 text-xs sm:text-sm">
                         <span className="font-medium">المتوقع بالدرج:</span>
                         <span className="font-bold">{formatCurrency(viewingShift?.expected_cash || 0)}</span>
                      </div>
                      
                      {viewingShift?.status === 'closed' && (
                        <>
                          <div className="flex justify-between items-center py-2 border-t border-primary/20 mt-1 mb-2 text-xs sm:text-sm">
                            <span className="font-medium">تم تسليمه فعلياً:</span>
                            <span className="text-base sm:text-lg bg-white dark:bg-black px-2.5 py-1 rounded shadow-sm border font-black">{formatCurrency(viewingShift?.actual_cash || 0)}</span>
                          </div>
                          <div className={`flex justify-between items-center p-2.5 sm:p-3 rounded-lg border text-xs sm:text-sm ${
                            (viewingShift?.discrepancy || 0) < 0 ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-800' : 
                            (viewingShift?.discrepancy || 0) > 0 ? 'bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800' : 
                            'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 text-foreground'
                          }`}>
                            <div className="flex items-center gap-2">
                               {(viewingShift?.discrepancy || 0) < 0 ? <AlertCircle className="w-4 h-4 flex-shrink-0"/> : <CheckCircle2 className="w-4 h-4 flex-shrink-0"/>}
                               <span className="font-bold">
                                  {(viewingShift?.discrepancy || 0) < 0 ? 'عجز نقدي بالوردية' : (viewingShift?.discrepancy || 0) > 0 ? 'زيادة نقدية مع الكاشير' : 'مطابق تماماً'}
                                </span>
                            </div>
                            <span className="font-black" dir="ltr">{(viewingShift?.discrepancy || 0) > 0 ? '+' : ''}{formatCurrency(viewingShift?.discrepancy || 0)}</span>
                          </div>
                          {(viewingShift?.discrepancy || 0) < 0 && viewingShift?.shortage_reason && (
                            <div className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2.5 rounded border border-red-100 dark:border-red-900/50">
                              <span className="font-bold mb-1 block">سبب العجز المسجل:</span>
                              {viewingShift.shortage_reason}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
              </div>
           </div>
           )}
           </div>
           
           <div className="p-3 sm:p-4 border-t bg-slate-50 dark:bg-slate-900 flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 print:hidden">
              <Button onClick={() => setViewingShift(null)} variant="outline" className="w-full sm:flex-1 min-h-[44px] rounded-xl font-bold">
                إغلاق
              </Button>
              <Button onClick={handlePrintReport} className="gap-2 w-full sm:flex-1 min-h-[44px] rounded-xl font-bold">
                <Printer className="w-4 h-4 flex-shrink-0"/> طباعة إيصال التقفيل
              </Button>
           </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Employee Shift Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <form onSubmit={handleAdd}>
            <DialogHeader className="pb-2">
              <DialogTitle className="text-base sm:text-lg font-bold">إضافة وردية موظف جديدة</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-3">
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm font-semibold">اسم الموظف *</Label>
                <Select required value={employeeName} onValueChange={setEmployeeName} disabled={isSubmitting}>
                  <SelectTrigger className="w-full h-11 text-base sm:text-sm rounded-xl">
                    <SelectValue placeholder="اختر الموظف" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
                    {dbEmployees.map(emp => (
                      <SelectItem key={emp.id} value={emp.name} className="text-sm">
                        {emp.name} - ({emp.role || 'موظف'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-sm font-semibold">نوع الوردية</Label>
                <Select value={shiftType} onValueChange={setShiftType} disabled={isSubmitting}>
                  <SelectTrigger className="w-full h-11 text-base sm:text-sm rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning" className="text-sm">صباحية</SelectItem>
                    <SelectItem value="evening" className="text-sm">مسائية</SelectItem>
                    <SelectItem value="night" className="text-sm">ليلية</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm font-semibold">وقت البدء *</Label>
                  <Input 
                    type="time" 
                    required 
                    value={startTime} 
                    onChange={e => setStartTime(e.target.value)} 
                    disabled={isSubmitting} 
                    className="h-11 text-base sm:text-sm rounded-xl"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm font-semibold">وقت الانتهاء *</Label>
                  <Input 
                    type="time" 
                    required 
                    value={endTime} 
                    onChange={e => setEndTime(e.target.value)} 
                    disabled={isSubmitting} 
                    className="h-11 text-base sm:text-sm rounded-xl"
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)} disabled={isSubmitting} className="min-h-[44px] rounded-xl font-bold">
                إلغاء
              </Button>
              <Button type="submit" disabled={isSubmitting} className="min-h-[44px] rounded-xl font-bold">
                {isSubmitting ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Employee Shift Dialog */}
      <Dialog open={!!editingShift} onOpenChange={(open) => !open && setEditingShift(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <form onSubmit={handleUpdate}>
            <DialogHeader className="pb-2">
              <DialogTitle className="text-base sm:text-lg font-bold">تعديل الوردية</DialogTitle>
            </DialogHeader>
            {editingShift && (
              <div className="space-y-4 py-3">
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm font-semibold">اسم الموظف *</Label>
                  <Select required value={editingShift.employee_name} onValueChange={val => setEditingShift({...editingShift, employee_name: val})} disabled={isSubmitting}>
                    <SelectTrigger className="w-full h-11 text-base sm:text-sm rounded-xl">
                      <SelectValue placeholder="اختر الموظف" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {dbEmployees.map(emp => (
                        <SelectItem key={emp.id} value={emp.name} className="text-sm">
                          {emp.name} - ({emp.role || 'موظف'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm font-semibold">نوع الوردية</Label>
                  <Select value={editingShift.shift_type} onValueChange={v => setEditingShift({...editingShift, shift_type: v})} disabled={isSubmitting}>
                    <SelectTrigger className="w-full h-11 text-base sm:text-sm rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning" className="text-sm">صباحية</SelectItem>
                      <SelectItem value="evening" className="text-sm">مسائية</SelectItem>
                      <SelectItem value="night" className="text-sm">ليلية</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs sm:text-sm font-semibold">وقت البدء *</Label>
                    <Input 
                      type="time" 
                      required 
                      value={editingShift.start_time} 
                      onChange={e => setEditingShift({...editingShift, start_time: e.target.value})} 
                      disabled={isSubmitting} 
                      className="h-11 text-base sm:text-sm rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs sm:text-sm font-semibold">وقت الانتهاء *</Label>
                    <Input 
                      type="time" 
                      required 
                      value={editingShift.end_time || ''} 
                      onChange={e => setEditingShift({...editingShift, end_time: e.target.value})} 
                      disabled={isSubmitting} 
                      className="h-11 text-base sm:text-sm rounded-xl"
                    />
                  </div>
                </div>
              </div>
            )}
            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditingShift(null)} disabled={isSubmitting} className="min-h-[44px] rounded-xl font-bold">
                إلغاء
              </Button>
              <Button type="submit" disabled={isSubmitting} className="min-h-[44px] rounded-xl font-bold">
                {isSubmitting ? 'جاري الحفظ...' : 'حفظ التحديث'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
