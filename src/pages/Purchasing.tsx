import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShoppingCart, Plus, Search, Eye, AlertCircle, Trash2, Import, Printer, DollarSign, Clock, Store, FileText, CheckCircle, XCircle, TrendingUp, CreditCard, CalendarClock, Wallet, BanknoteIcon, Package } from "lucide-react";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { usePurchaseOrders, useSuppliers, useInventoryItems, useUnits, useTenantBranch } from '@/hooks/useDatabase';
import { db } from '@/lib/firebase';
import { collection, doc, query, where, getDocs, addDoc, updateDoc, increment, getDoc } from 'firebase/firestore';
import { addExpense } from '@/services/expenses';

export default function Purchasing() {
  const { tenantId, branchId } = useTenantBranch();
  const { orders, loading: ordersLoading, add: addOrder, update: updateOrder, remove: removeOrder } = usePurchaseOrders(tenantId);
  const { suppliers } = useSuppliers(tenantId);
  const { items: inventoryItems } = useInventoryItems(tenantId);
  const { units } = useUnits(tenantId);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);

  // Add Order Form State
  const [supplierId, setSupplierId] = useState('');
  const [notes, setNotes] = useState('');
  const [orderItems, setOrderItems] = useState<{ itemId: string; quantity: number; unitId: string; unitPrice: number; name?: string }[]>([]);

  // Installment / Deferred Payment State
  const [isDeferred, setIsDeferred] = useState(false);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [dueDate, setDueDate] = useState('');

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const matchSearch = (o.order_number || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (suppliers.find(s => s.id === o.supplier_id)?.name || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = filterStatus === 'all' || o.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [orders, searchQuery, filterStatus, suppliers]);

  // KPI Calculations
  const kpis = useMemo(() => {
    const receivedOrders = orders.filter(o => o.status === 'received');
    const pendingOrders = orders.filter(o => o.status === 'pending');
    const deferredOrders = orders.filter(o => o.payment_type === 'deferred' && o.status === 'received' && o.payment_status !== 'paid');

    return {
      totalPurchasesValue: receivedOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0),
      receivedCount: receivedOrders.length,
      pendingOrdersValue: pendingOrders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0),
      pendingCount: pendingOrders.length,
      suppliersCount: suppliers.length,
      totalDeferred: deferredOrders.reduce((sum, o) => sum + (Number(o.total_amount || 0) - Number(o.paid_amount || 0)), 0),
      deferredCount: deferredOrders.length,
    };
  }, [orders, suppliers]);

  const totalAmount = useMemo(() => {
    return orderItems.reduce((sum, item) => sum + (Number(item.quantity) * Number(item.unitPrice)), 0);
  }, [orderItems]);

  const remainingAmount = useMemo(() => {
    if (!isDeferred) return 0;
    return Math.max(0, totalAmount - Number(paidAmount));
  }, [totalAmount, paidAmount, isDeferred]);

  const handleAddItem = () => {
    setOrderItems([...orderItems, { itemId: '', quantity: 1, unitId: '', unitPrice: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...orderItems];
    newItems.splice(index, 1);
    setOrderItems(newItems);
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...orderItems];
    newItems[index] = { ...newItems[index], [field]: value };

    if (field === 'itemId') {
       const invItem = inventoryItems.find((i: any) => i.id === value);
       if (invItem) {
          newItems[index].unitPrice = invItem.cost || 0;
          newItems[index].name = invItem.name || '';
          newItems[index].unitId = invItem.unit_id || '';
       }
    }

    setOrderItems(newItems);
  };

  const resetForm = () => {
    setSupplierId('');
    setNotes('');
    setOrderItems([]);
    setIsDeferred(false);
    setPaidAmount(0);
    setDueDate('');
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId || orderItems.length === 0) return;

    if (orderItems.some(i => {
      const price = Number(i.unitPrice ?? (i as any).unit_price);
      const qty = Number(i.quantity);
      return !i.itemId || !i.unitId || qty <= 0 || price < 0 || isNaN(qty) || isNaN(price);
    })) {
        alert("يرجى التأكد من اختيار جميع الأصناف، وحدات القياس والكميات والأسعار بشكل صحيح وغير سالب.");
        return;
    }

    if (totalAmount <= 0) {
      alert("إجمالي أمر الشراء يجب أن يكون أكبر من الصفر.");
      return;
    }

    if (isDeferred && !dueDate) {
      alert("يرجى تحديد تاريخ سداد المبلغ المتبقي للمورد.");
      return;
    }

    if (isDeferred && (Number(paidAmount) < 0 || isNaN(Number(paidAmount)) || Number(paidAmount) > totalAmount)) {
      alert("المبلغ المدفوع غير صالح أو أكبر من إجمالي الفاتورة.");
      return;
    }

    setIsSubmitting(true);

    const orderNumber = `PO-${Date.now().toString().slice(-6)}`;

    const newOrder: any = {
      order_number: orderNumber,
      supplier_id: supplierId,
      status: 'pending',
      items: orderItems,
      total_amount: totalAmount,
      notes: notes,
      created_at: new Date().toISOString(),
      payment_type: isDeferred ? 'deferred' : 'cash',
      payment_status: isDeferred ? (Number(paidAmount) >= totalAmount ? 'paid' : (Number(paidAmount) > 0 ? 'partial' : 'unpaid')) : 'paid',
      paid_amount: isDeferred ? Number(paidAmount) : totalAmount,
      due_date: isDeferred ? dueDate : null,
    };

    const success = await addOrder(newOrder);

    if (success) {
      setIsAddDialogOpen(false);
      resetForm();
    } else {
      alert("فشل في إنشاء أمر الشراء، يرجى المحاولة لاحقاً.");
    }
    setIsSubmitting(false);
  };

  const getSupplierName = (id: string) => {
    const s = suppliers.find(s => s.id === id);
    return s ? (s.name + (s.company ? ` (${s.company})` : '')) : 'مورد غير معروف';
  };

  const getUnitName = (id: string) => {
    const u = units.find(u => u.id === id);
    return u ? u.name : '';
  };

  // Status changes: received / cancelled
  const handleUpdateStatus = async (newStatus: 'received' | 'cancelled') => {
    if (!viewingOrder) return;
    setIsSubmitting(true);

    try {
      if (newStatus === 'received') {
        // Increment inventory quantities
        for (const item of viewingOrder.items) {
          if (item.itemId && item.quantity > 0) {
            const itemRef = doc(db, 'inventory_items', item.itemId);
            await updateDoc(itemRef, {
              current_stock: increment(Number(item.quantity)),
              cost: Number(item.unitPrice) || 0,
              updated_at: new Date().toISOString()
            });

            await addDoc(collection(db, 'stock_movements'), {
              item_id: item.itemId,
              branch_id: branchId || null,
              tenant_id: tenantId,
              quantity: Number(item.quantity),
              movement_type: 'purchase',
              reason: `أمر شراء رقم ${viewingOrder.order_number}`,
              created_at: new Date().toISOString()
            });
          }
        }

        // Register expense
        const expenseAmount = viewingOrder.payment_type === 'deferred' 
          ? Number(viewingOrder.paid_amount || 0)
          : Number(viewingOrder.total_amount);

        if (expenseAmount > 0) {
          await addExpense({
            amount: expenseAmount,
            category: 'مشتريات',
            description: `فاتورة مشتريات أمر رقم ${viewingOrder.order_number} من المورد ${getSupplierName(viewingOrder.supplier_id)}${viewingOrder.payment_type === 'deferred' ? ' (دفعة مقدمة)' : ''}`,
            date: new Date().toISOString().split('T')[0],
            branchId: branchId || undefined,
            tenantId: tenantId
          } as any);
        }
      }

      await updateOrder(viewingOrder.id, {
        status: newStatus,
        received_at: newStatus === 'received' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      });

      setViewingOrder({
        ...viewingOrder,
        status: newStatus,
        received_at: newStatus === 'received' ? new Date().toISOString() : null
      });

    } catch (err: any) {
      alert("حدث خطأ أثناء تحديث حالة الطلب: " + err.message);
    }
    setIsSubmitting(false);
  };

  // Mark remaining deferred amount as paid
  const handleMarkRemainingPaid = async () => {
    if (!viewingOrder) return;
    setIsMarkingPaid(true);

    const remaining = Number(viewingOrder.total_amount) - Number(viewingOrder.paid_amount || 0);

    try {
      // Register remaining as expense
      if (remaining > 0) {
        await addExpense({
          amount: remaining,
          category: 'مشتريات',
          description: `سداد المبلغ المتبقي - أمر شراء رقم ${viewingOrder.order_number} من المورد ${getSupplierName(viewingOrder.supplier_id)}`,
          date: new Date().toISOString().split('T')[0],
          branchId: branchId || undefined,
          tenantId: tenantId
        } as any);
      }

      await updateOrder(viewingOrder.id, {
        payment_status: 'paid',
        paid_amount: Number(viewingOrder.total_amount),
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

      setViewingOrder({
        ...viewingOrder,
        payment_status: 'paid',
        paid_amount: Number(viewingOrder.total_amount),
      });
    } catch (err: any) {
      alert("حدث خطأ أثناء تسجيل السداد: " + err.message);
    }
    setIsMarkingPaid(false);
  };

  const handleDeleteOrder = async (id: string) => {
    if (window.confirm("هل أنت متأكد من حذف أمر الشراء هذا نهائياً؟")) {
       await removeOrder(id);
       if (viewingOrder?.id === id) setViewingOrder(null);
    }
  };

  const handlePrintOrder = (order: any) => {
    const supplierName = getSupplierName(order.supplier_id);
    const dateStr = new Date(order.created_at).toLocaleString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const paidAmt = Number(order.paid_amount || (order.payment_type === 'deferred' ? 0 : order.total_amount));
    const remainAmt = Number(order.total_amount) - paidAmt;
    const dueDateStr = order.due_date ? new Date(order.due_date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

    printWindow.document.write(`
      <html dir="rtl" lang="ar">
        <head>
          <title>أمر شراء - ${order.order_number}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            .header h1 { margin: 0 0 5px 0; }
            .details { margin-bottom: 20px; border: 1px solid #ccc; padding: 15px; border-radius: 5px; background: #f9f9f9; }
            .details p { margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ccc; padding: 10px; text-align: right; }
            th { background-color: #f2f2f2; }
            .total { font-size: 1.1rem; font-weight: bold; text-align: left; padding: 10px; border-top: 2px solid #333; }
            .payment-box { border: 2px solid #e8b800; background: #fffbeb; padding: 15px; border-radius: 8px; margin-bottom: 15px; }
            .payment-box h3 { margin: 0 0 10px; color: #92400e; }
            .unpaid-label { color: #dc2626; font-weight: bold; }
            .footer { text-align: center; margin-top: 40px; font-size: 0.9rem; color: #666; }
            @media print { body { padding: 0; } button { display: none; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>أمر شراء / فاتورة مشتريات</h1>
            <p><strong>رقم الأمر:</strong> ${order.order_number}</p>
          </div>
          <div class="details">
            <p><strong>تاريخ الإصدار:</strong> ${dateStr}</p>
            <p><strong>المورد:</strong> ${supplierName}</p>
            <p><strong>الحالة:</strong> ${order.status === 'received' ? 'مستلم' : order.status === 'cancelled' ? 'ملغي' : 'قيد الانتظار'}</p>
            <p><strong>طريقة الدفع:</strong> ${order.payment_type === 'deferred' ? 'آجل (تقسيط)' : 'نقدي'}</p>
            ${order.notes ? `<p><strong>ملاحظات:</strong> ${order.notes}</p>` : ''}
          </div>
          <table>
            <thead>
              <tr>
                <th>الصنف</th>
                <th>الوحدة</th>
                <th>الكمية</th>
                <th>سعر الوحدة</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${(order.items || []).map((item: any) => `
                <tr>
                  <td>${item.name || 'مجهول'}</td>
                  <td>${getUnitName(item.unitId) || '-'}</td>
                  <td>${item.quantity}</td>
                  <td>${Number(item.unitPrice).toLocaleString('ar-EG')} ج.م</td>
                  <td>${(Number(item.quantity) * Number(item.unitPrice)).toLocaleString('ar-EG', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ج.م</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="total">الإجمالي الكلي: ${Number(order.total_amount).toLocaleString('ar-EG', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ج.م</div>
          ${order.payment_type === 'deferred' ? `
          <div class="payment-box">
            <h3>بيان الدفع الآجل</h3>
            <p><strong>المبلغ المدفوع مقدماً:</strong> ${paidAmt.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</p>
            <p class="unpaid-label">المبلغ المتبقي (الآجل): ${remainAmt.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</p>
            ${dueDateStr ? `<p><strong>تاريخ استحقاق السداد:</strong> ${dueDateStr}</p>` : ''}
            <p><strong>حالة السداد:</strong> ${order.payment_status === 'paid' ? 'مسدد بالكامل ✓' : order.payment_status === 'partial' ? 'مسدد جزئياً' : 'غير مسدد'}</p>
          </div>
          ` : ''}
          <div class="footer">تم إنشاء هذه الفاتورة بواسطة نظام إدارة المطاعم</div>
          <script>window.onload = function() { window.print(); }</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="text-yellow-600 bg-yellow-50 border-yellow-200 text-xs">قيد الانتظار</Badge>;
      case 'received': return <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200 text-xs">مستلم (تم التسجيل)</Badge>;
      case 'cancelled': return <Badge variant="outline" className="text-red-600 bg-red-50 border-red-200 text-xs">ملغي</Badge>;
      default: return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  const getPaymentBadge = (order: any) => {
    if (order.payment_type !== 'deferred') {
      return <Badge variant="outline" className="text-blue-600 bg-blue-50 border-blue-200 gap-1 text-xs"><Wallet className="w-3 h-3" />نقدي</Badge>;
    }
    const ps = order.payment_status;
    if (ps === 'paid') return <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200 gap-1 text-xs"><CheckCircle className="w-3 h-3" />آجل - مسدد</Badge>;
    if (ps === 'partial') return <Badge variant="outline" className="text-orange-600 bg-orange-50 border-orange-200 gap-1 text-xs"><CreditCard className="w-3 h-3" />آجل - جزئي</Badge>;
    return <Badge variant="outline" className="text-red-600 bg-red-50 border-red-200 gap-1 text-xs"><CalendarClock className="w-3 h-3" />آجل - غير مسدد</Badge>;
  };

  // Check if due date is overdue
  const isOverdue = (order: any) => {
    if (order.payment_type !== 'deferred' || order.payment_status === 'paid') return false;
    if (!order.due_date) return false;
    return new Date(order.due_date) < new Date();
  };

  return (
    <MainLayout
      title="المشتريات"
      subtitle="إدارة المشتريات وأوامر الشراء للمخزون بكل احترافية"
      actions={
        <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2 w-full sm:w-auto min-h-[44px] sm:min-h-0 h-10 rounded-xl font-bold shadow-sm">
          <Plus className="w-4 h-4" />
          إنشاء أمر شراء
        </Button>
      }
    >
      <div className="grid gap-4 sm:gap-6 pb-20">
        {/* KPIs Section */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <Card className="border-t-4 border-t-green-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 sm:p-5 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">إجمالي المشتريات (مستلم)</CardTitle>
              <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded-full flex-shrink-0">
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 pt-0">
              <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400 truncate">
                {kpis.totalPurchasesValue.toLocaleString('ar-EG', {minimumFractionDigits: 0, maximumFractionDigits: 0})} ج.م
              </div>
              <p className="text-xs text-muted-foreground mt-1">من {kpis.receivedCount} طلب شراء</p>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-yellow-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 sm:p-5 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">الأوامر المعلقة</CardTitle>
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/20 rounded-full flex-shrink-0">
                <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 pt-0">
              <div className="text-xl sm:text-2xl font-bold text-yellow-600 dark:text-yellow-400 truncate">
                {kpis.pendingOrdersValue.toLocaleString('ar-EG', {minimumFractionDigits: 0, maximumFractionDigits: 0})} ج.م
              </div>
              <p className="text-xs text-muted-foreground mt-1">{kpis.pendingCount} طلب قيد الانتظار</p>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-red-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 sm:p-5 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">ديون الموردين (آجل)</CardTitle>
              <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-full flex-shrink-0">
                <CalendarClock className="h-4 w-4 text-red-600 dark:text-red-400" />
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 pt-0">
              <div className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400 truncate">
                {kpis.totalDeferred.toLocaleString('ar-EG', {minimumFractionDigits: 0, maximumFractionDigits: 0})} ج.م
              </div>
              <p className="text-xs text-muted-foreground mt-1">{kpis.deferredCount} فاتورة غير مسددة</p>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-purple-500 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4 sm:p-5 pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">الموردين</CardTitle>
              <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded-full flex-shrink-0">
                <Store className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-5 pt-0">
              <div className="text-xl sm:text-2xl font-bold text-purple-600 dark:text-purple-400 truncate">
                {kpis.suppliersCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">مورد مسجل بالنظام</p>
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-sm border-0 border-t-4 border-t-primary">
          <CardHeader className="bg-card p-4 sm:p-6 pb-4 border-b">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-xl sm:text-2xl">
                  <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-primary flex-shrink-0" />
                  أوامر الشراء
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm mt-1">
                  عرض وتعديل أوامر الشراء، تحديث المخزون إلكترونياً، وتسجيل المصروفات تلقائياً.
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="بحث برقم الأمر أو المورد..."
                  className="pr-9 h-10 text-base sm:text-sm rounded-xl"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-3 sm:p-6">
            <Tabs defaultValue="all" className="w-full" onValueChange={setFilterStatus}>
              <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full h-auto p-1 bg-muted/40 border rounded-xl mb-4 sm:mb-6">
                <TabsTrigger value="all" className="py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg data-[state=active]:shadow-sm">الكل</TabsTrigger>
                <TabsTrigger value="pending" className="py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg text-yellow-600 data-[state=active]:bg-yellow-50 data-[state=active]:shadow-sm">قيد الانتظار</TabsTrigger>
                <TabsTrigger value="received" className="py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg text-green-600 data-[state=active]:bg-green-50 data-[state=active]:shadow-sm">مستلم</TabsTrigger>
                <TabsTrigger value="cancelled" className="py-2 px-2 text-xs sm:text-sm font-semibold rounded-lg text-red-600 data-[state=active]:bg-red-50 data-[state=active]:shadow-sm">ملغي</TabsTrigger>
              </TabsList>

              {/* Desktop View: Table */}
              <div className="hidden md:block rounded-xl border border-border/50 overflow-x-auto bg-card shadow-sm">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="font-semibold px-4">رقم الأمر</TableHead>
                      <TableHead className="font-semibold">المورد</TableHead>
                      <TableHead className="font-semibold">التاريخ</TableHead>
                      <TableHead className="font-semibold">الإجمالي</TableHead>
                      <TableHead className="font-semibold">الحالة</TableHead>
                      <TableHead className="font-semibold">الدفع</TableHead>
                      <TableHead className="text-center font-semibold">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordersLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center">
                          <div className="flex justify-center items-center">
                            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                          <div className="flex flex-col items-center gap-2">
                            <AlertCircle className="w-8 h-8 opacity-20" />
                            <p>لا توجد أوامر شراء مطابقة</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredOrders.map((order) => (
                        <TableRow key={order.id} className={`hover:bg-muted/10 transition-colors ${isOverdue(order) ? 'bg-red-50/30 dark:bg-red-950/10' : ''}`}>
                          <TableCell className="font-bold text-primary px-4">
                            <div className="flex items-center gap-2">
                              {order.order_number}
                              {isOverdue(order) && (
                                <Badge variant="destructive" className="text-xs px-1.5 py-0">متأخر</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{getSupplierName(order.supplier_id)}</TableCell>
                          <TableCell suppressHydrationWarning className="text-muted-foreground text-sm">
                            {new Date(order.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
                          </TableCell>
                          <TableCell className="font-medium text-base">{Number(order.total_amount).toLocaleString('ar-EG')} ج.م</TableCell>
                          <TableCell>{getStatusBadge(order.status)}</TableCell>
                          <TableCell>{getPaymentBadge(order)}</TableCell>
                          <TableCell className="text-center">
                            <div className="flex justify-center items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-primary/10 hover:text-primary transition-colors rounded-full" title="عرض التفاصيل" onClick={() => setViewingOrder(order)}>
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-9 w-9 hover:bg-destructive/10 hover:text-destructive transition-colors rounded-full" title="حذف أمر الشراء" onClick={() => handleDeleteOrder(order.id)}>
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

              {/* Mobile View: Responsive Purchase Cards */}
              <div className="md:hidden space-y-3">
                {ordersLoading ? (
                  <div className="p-8 text-center bg-card border rounded-xl flex flex-col items-center justify-center gap-3">
                    <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs text-muted-foreground">جاري تحميل أوامر الشراء...</p>
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-6 text-center bg-card rounded-xl border border-dashed border-border text-muted-foreground">
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                      <ShoppingCart className="w-6 h-6 opacity-30" />
                    </div>
                    <p className="text-sm font-bold text-foreground mb-1">لا توجد أوامر شراء مطابقة</p>
                    <p className="text-xs">اضغط "إنشاء أمر شراء" لتسجيل فاتورة جديدة</p>
                  </div>
                ) : (
                  filteredOrders.map((order) => {
                    const paidAmt = Number(order.paid_amount || (order.payment_type === 'deferred' ? 0 : order.total_amount));
                    const remainAmt = Number(order.total_amount) - paidAmt;

                    return (
                      <div
                        key={order.id}
                        className={`bg-card rounded-xl border p-3.5 shadow-sm space-y-3 transition-colors ${isOverdue(order) ? 'border-red-300 bg-red-50/10' : 'border-border/70 hover:border-primary/40'}`}
                      >
                        {/* Header: Order number + Badges */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-base text-primary">{order.order_number}</span>
                              {isOverdue(order) && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">متأخر</Badge>
                              )}
                            </div>
                            <p className="font-semibold text-xs text-foreground mt-0.5 truncate">{getSupplierName(order.supplier_id)}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {new Date(order.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            {getStatusBadge(order.status)}
                            {getPaymentBadge(order)}
                          </div>
                        </div>

                        {/* Financial summary mini banner */}
                        <div className="bg-muted/40 rounded-lg p-2.5 flex items-center justify-between text-xs">
                          <div>
                            <span className="text-muted-foreground block text-[10px]">إجمالي الفاتورة:</span>
                            <span className="font-black text-sm text-foreground">{Number(order.total_amount).toLocaleString('ar-EG')} ج.م</span>
                          </div>
                          {order.payment_type === 'deferred' && (
                            <div className="text-left" dir="ltr">
                              <span className="text-muted-foreground block text-[10px]">المتبقي:</span>
                              <span className="font-bold text-xs text-red-600">{remainAmt.toLocaleString('ar-EG')} ج.م</span>
                            </div>
                          )}
                        </div>

                        {/* Card Actions Footer */}
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 min-h-[44px] h-11 text-xs font-bold gap-1.5 text-primary border-primary/30 hover:bg-primary/10 rounded-xl"
                            onClick={() => setViewingOrder(order)}
                          >
                            <Eye className="w-4 h-4" />
                            عرض التفاصيل والإدارة
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="min-h-[44px] min-w-[44px] h-11 w-11 text-destructive hover:bg-destructive/10 rounded-xl flex-shrink-0"
                            onClick={() => handleDeleteOrder(order.id)}
                            title="حذف أمر الشراء"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Add Purchase Order Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setIsAddDialogOpen(open); }}>
        <DialogContent className="max-w-[95vw] md:max-w-5xl max-h-[90dvh] overflow-y-auto w-full rounded-2xl p-4 sm:p-6">
          <form onSubmit={handleSubmitOrder}>
            <DialogHeader className="border-b pb-3 mb-4">
              <DialogTitle className="text-xl sm:text-2xl flex items-center gap-2">
                <Import className="w-5 h-5 sm:w-6 sm:h-6 text-primary flex-shrink-0" />
                إنشاء أمر شراء لطلب مخزون
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-6 py-2">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 p-3.5 sm:p-5 bg-muted/20 rounded-xl border">
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm font-semibold">المورد <span className="text-red-500">*</span></Label>
                  <Select value={supplierId} onValueChange={setSupplierId} required disabled={isSubmitting}>
                    <SelectTrigger className="h-11 bg-background text-base sm:text-sm rounded-xl">
                      <SelectValue placeholder="اختر المورد..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {suppliers.map((s: any) => (
                        <SelectItem key={s.id} value={s.id} className="text-sm">{s.name} {s.company ? `(${s.company})` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs sm:text-sm font-semibold">ملاحظات إضافية (اختياري)</Label>
                  <Input
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="أضف أي تفاصيل للفاتورة..."
                    className="h-11 bg-background text-base sm:text-sm rounded-xl"
                  />
                </div>
              </div>

              {/* Items */}
              <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                  <Label className="text-base sm:text-lg font-bold">الأصناف المطلوبة</Label>
                  <Button type="button" variant="outline" onClick={handleAddItem} className="gap-1.5 border-primary text-primary hover:bg-primary/10 min-h-[40px] rounded-xl text-xs sm:text-sm font-bold">
                    <Plus className="w-4 h-4" />
                    إضافة صنف
                  </Button>
                </div>

                {orderItems.length === 0 ? (
                  <div className="text-center p-8 sm:p-10 border-2 border-dashed border-primary/20 rounded-xl text-muted-foreground flex flex-col items-center gap-2.5 bg-muted/10">
                    <ShoppingCart className="w-10 h-10 text-primary/30" />
                    <span className="text-sm sm:text-base font-semibold">لم يتم إضافة أي أصناف حتى الآن</span>
                    <Button type="button" variant="link" onClick={handleAddItem} className="text-xs sm:text-sm">انقر هنا للبدء بإضافة الأصناف</Button>
                  </div>
                ) : (
                  <>
                    {/* Desktop Items Table */}
                    <div className="hidden md:block rounded-xl border border-border shadow-sm overflow-hidden">
                      <Table>
                        <TableHeader className="bg-muted">
                          <TableRow>
                            <TableHead className="w-1/3">الصنف</TableHead>
                            <TableHead className="w-1/6">وحدة القياس</TableHead>
                            <TableHead className="w-1/6 text-center">الكمية</TableHead>
                            <TableHead className="w-1/6 text-center">سعر الوحدة</TableHead>
                            <TableHead className="w-1/6 text-center">الإجمالي</TableHead>
                            <TableHead className="w-12"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {orderItems.map((item, index) => (
                            <TableRow key={index} className="hover:bg-transparent">
                              <TableCell className="p-3">
                                <Select value={item.itemId} onValueChange={(val) => handleItemChange(index, 'itemId', val)} disabled={isSubmitting}>
                                  <SelectTrigger className="w-full bg-background rounded-xl">
                                    <SelectValue placeholder="اختر الصنف..." />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-56">
                                    {inventoryItems.map((inv: any) => (
                                      <SelectItem key={inv.id} value={inv.id}>{inv.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="p-3">
                                <Select value={item.unitId} onValueChange={(val) => handleItemChange(index, 'unitId', val)} disabled={isSubmitting}>
                                  <SelectTrigger className="w-full bg-background rounded-xl">
                                    <SelectValue placeholder="الوحدة" />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-56">
                                    {units.map((u: any) => (
                                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="p-3">
                                <Input
                                  type="number"
                                  min="0.001"
                                  step="any"
                                  className="w-full text-center bg-background rounded-xl"
                                  value={item.quantity}
                                  onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                  disabled={isSubmitting}
                                />
                              </TableCell>
                              <TableCell className="p-3">
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  className="w-full text-center bg-background rounded-xl"
                                  value={item.unitPrice}
                                  onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                                  disabled={isSubmitting}
                                />
                              </TableCell>
                              <TableCell className="p-3 text-center font-bold text-base text-primary">
                                {(Number(item.quantity) * Number(item.unitPrice)).toLocaleString('ar-EG', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ج.م
                              </TableCell>
                              <TableCell className="p-3 text-center">
                                <Button type="button" variant="ghost" size="icon" className="text-destructive hover:bg-destructive/10 hover:text-destructive rounded-full" onClick={() => handleRemoveItem(index)} disabled={isSubmitting}>
                                  <Trash2 className="w-5 h-5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Mobile Items Cards */}
                    <div className="md:hidden space-y-3">
                      {orderItems.map((item, index) => (
                        <div key={index} className="bg-card border rounded-xl p-3.5 space-y-3 shadow-sm">
                          <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-muted-foreground">صنف #{index + 1}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10 h-9 px-2 gap-1 text-xs"
                              onClick={() => handleRemoveItem(index)}
                              disabled={isSubmitting}
                            >
                              <Trash2 className="w-3.5 h-3.5" /> حذف
                            </Button>
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">الصنف</Label>
                            <Select value={item.itemId} onValueChange={(val) => handleItemChange(index, 'itemId', val)} disabled={isSubmitting}>
                              <SelectTrigger className="w-full bg-background h-11 text-base sm:text-sm rounded-xl">
                                <SelectValue placeholder="اختر الصنف..." />
                              </SelectTrigger>
                              <SelectContent className="max-h-56">
                                {inventoryItems.map((inv: any) => (
                                  <SelectItem key={inv.id} value={inv.id} className="text-sm">{inv.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">وحدة القياس</Label>
                            <Select value={item.unitId} onValueChange={(val) => handleItemChange(index, 'unitId', val)} disabled={isSubmitting}>
                              <SelectTrigger className="w-full bg-background h-11 text-base sm:text-sm rounded-xl">
                                <SelectValue placeholder="الوحدة" />
                              </SelectTrigger>
                              <SelectContent className="max-h-56">
                                {units.map((u: any) => (
                                  <SelectItem key={u.id} value={u.id} className="text-sm">{u.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5">
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold">الكمية</Label>
                              <Input
                                type="number"
                                min="0.001"
                                step="any"
                                className="w-full text-center bg-background h-11 text-base sm:text-sm rounded-xl"
                                value={item.quantity}
                                onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                                disabled={isSubmitting}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-semibold">سعر الوحدة (ج.م)</Label>
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                className="w-full text-center bg-background h-11 text-base sm:text-sm rounded-xl"
                                value={item.unitPrice}
                                onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                                disabled={isSubmitting}
                              />
                            </div>
                          </div>

                          <div className="bg-primary/5 p-2 rounded-lg text-center font-bold text-xs text-primary">
                            إجمالي البند: {(Number(item.quantity) * Number(item.unitPrice)).toLocaleString('ar-EG', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ج.م
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="bg-primary/5 border p-3.5 sm:p-5 flex justify-between items-center rounded-xl">
                      <span className="text-base sm:text-xl font-bold">إجمالي فاتورة الشراء:</span>
                      <span className="text-xl sm:text-3xl font-black text-primary">
                        {totalAmount.toLocaleString('ar-EG', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ج.م
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* ── Deferred Payment Section ── */}
              {orderItems.length > 0 && (
                <div className={`rounded-xl border-2 p-4 sm:p-5 space-y-4 sm:space-y-5 transition-colors ${isDeferred ? 'border-orange-400 bg-orange-50/50 dark:bg-orange-950/20' : 'border-border bg-muted/10'}`}>
                  {/* Toggle */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                      <div className={`p-2 rounded-full flex-shrink-0 ${isDeferred ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-muted'}`}>
                        <CalendarClock className={`w-4 h-4 sm:w-5 sm:h-5 ${isDeferred ? 'text-orange-600' : 'text-muted-foreground'}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm sm:text-base truncate">دفع آجل (تقسيط)</p>
                        <p className="text-xs text-muted-foreground truncate">ادفع جزءاً الآن وحدد موعد سداد الباقي للمورد</p>
                      </div>
                    </div>
                    <Switch
                      checked={isDeferred}
                      onCheckedChange={(v) => { setIsDeferred(v); if (!v) { setPaidAmount(0); setDueDate(''); } }}
                      disabled={isSubmitting}
                    />
                  </div>

                  {/* Deferred Fields */}
                  {isDeferred && (
                    <div className="space-y-4 sm:space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                        {/* Paid now */}
                        <div className="space-y-1.5">
                          <Label className="text-xs sm:text-sm font-medium flex items-center gap-1.5">
                            <BanknoteIcon className="w-4 h-4 text-green-600" />
                            المبلغ المدفوع الآن (مقدم)
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            max={totalAmount}
                            step="any"
                            placeholder="0.00"
                            value={paidAmount || ''}
                            onChange={e => setPaidAmount(Number(e.target.value))}
                            disabled={isSubmitting}
                            className="h-11 bg-background text-base sm:text-lg font-semibold rounded-xl"
                          />
                          <p className="text-[11px] text-muted-foreground">أدخل 0 إذا كان الدفع بالكامل آجلاً</p>
                        </div>

                        {/* Due date */}
                        <div className="space-y-1.5">
                          <Label className="text-xs sm:text-sm font-medium flex items-center gap-1.5">
                            <CalendarClock className="w-4 h-4 text-orange-600" />
                            تاريخ سداد المبلغ المتبقي <span className="text-red-500">*</span>
                          </Label>
                          <Input
                            type="date"
                            value={dueDate}
                            onChange={e => setDueDate(e.target.value)}
                            disabled={isSubmitting}
                            className="h-11 bg-background text-base sm:text-sm rounded-xl"
                            min={new Date().toISOString().split('T')[0]}
                          />
                        </div>
                      </div>

                      {/* Summary Box */}
                      <div className="bg-background rounded-xl border p-3.5 sm:p-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4 text-center">
                        <div className="bg-muted/20 p-2 rounded-lg sm:bg-transparent">
                          <p className="text-xs text-muted-foreground mb-0.5">إجمالي الفاتورة</p>
                          <p className="text-base sm:text-lg font-bold text-primary">{totalAmount.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</p>
                        </div>
                        <div className="bg-muted/20 p-2 rounded-lg sm:bg-transparent">
                          <p className="text-xs text-muted-foreground mb-0.5">المدفوع مقدماً</p>
                          <p className="text-base sm:text-lg font-bold text-green-600">{Number(paidAmount).toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</p>
                        </div>
                        <div className="bg-muted/20 p-2 rounded-lg sm:bg-transparent">
                          <p className="text-xs text-muted-foreground mb-0.5">الآجل (المتبقي)</p>
                          <p className="text-base sm:text-lg font-bold text-red-600">{remainingAmount.toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</p>
                        </div>
                      </div>

                      {/* Progress */}
                      {totalAmount > 0 && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>نسبة السداد</span>
                            <span>{Math.round((Number(paidAmount) / totalAmount) * 100)}%</span>
                          </div>
                          <Progress value={(Number(paidAmount) / totalAmount) * 100} className="h-2" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="border-t pt-4 mt-4 flex flex-col-reverse sm:flex-row gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => { setIsAddDialogOpen(false); resetForm(); }} disabled={isSubmitting} className="min-h-[44px] rounded-xl font-bold">
                إلغاء
              </Button>
              <Button type="submit" disabled={isSubmitting || orderItems.length === 0} className="min-h-[44px] rounded-xl font-bold shadow-sm">
                {isSubmitting ? 'جاري الحفظ للتسجيل...' : 'حفظ وإنشاء الأمر'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View/Edit Order Dialog */}
      <Dialog open={!!viewingOrder} onOpenChange={(open) => !open && setViewingOrder(null)}>
        <DialogContent className="max-w-[95vw] md:max-w-4xl rounded-2xl max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="border-b pb-3">
            <DialogTitle className="text-xl sm:text-2xl flex items-center gap-2">
              <Eye className="w-5 h-5 sm:w-6 sm:h-6 text-primary flex-shrink-0" />
              تفاصيل أمر الشراء وإدارته
            </DialogTitle>
          </DialogHeader>

          {viewingOrder && (
            <div className="space-y-5 sm:space-y-6 py-2">
              {/* Order Header Info */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-muted/30 p-4 sm:p-5 rounded-xl border gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <h3 className="font-bold text-xl sm:text-2xl text-primary truncate">{viewingOrder.order_number}</h3>
                  <p className="text-muted-foreground text-sm sm:text-base truncate">المورد: <span className="font-semibold text-foreground">{getSupplierName(viewingOrder.supplier_id)}</span></p>
                  <p className="text-xs sm:text-sm text-muted-foreground">بتاريخ: {new Date(viewingOrder.created_at).toLocaleString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div className="flex flex-row md:flex-col items-start md:items-end gap-2 flex-wrap">
                  <div>{getStatusBadge(viewingOrder.status)}</div>
                  <div>{getPaymentBadge(viewingOrder)}</div>
                </div>
              </div>

              {/* Deferred Payment Info Panel */}
              {viewingOrder.payment_type === 'deferred' && (
                <div className={`rounded-xl border-2 p-4 sm:p-5 space-y-3 sm:space-y-4 ${viewingOrder.payment_status === 'paid' ? 'border-green-400 bg-green-50/50 dark:bg-green-950/20' : isOverdue(viewingOrder) ? 'border-red-400 bg-red-50/50 dark:bg-red-950/20' : 'border-orange-400 bg-orange-50/50 dark:bg-orange-950/20'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <CalendarClock className={`w-4 h-4 sm:w-5 sm:h-5 ${viewingOrder.payment_status === 'paid' ? 'text-green-600' : isOverdue(viewingOrder) ? 'text-red-600' : 'text-orange-600'}`} />
                    <h4 className="font-bold text-sm sm:text-base">بيان الدفع الآجل</h4>
                    {isOverdue(viewingOrder) && (
                      <Badge variant="destructive" className="mr-auto text-xs">مستحق ومتأخر</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-4 text-center">
                    <div className="bg-background rounded-lg p-2.5 sm:p-3 border">
                      <p className="text-xs text-muted-foreground mb-0.5">إجمالي الفاتورة</p>
                      <p className="text-lg sm:text-xl font-black text-primary">{Number(viewingOrder.total_amount).toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</p>
                    </div>
                    <div className="bg-background rounded-lg p-2.5 sm:p-3 border">
                      <p className="text-xs text-muted-foreground mb-0.5">المدفوع</p>
                      <p className="text-lg sm:text-xl font-black text-green-600">{Number(viewingOrder.paid_amount || 0).toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م</p>
                    </div>
                    <div className="bg-background rounded-lg p-2.5 sm:p-3 border">
                      <p className="text-xs text-muted-foreground mb-0.5">المتبقي (الآجل)</p>
                      <p className="text-lg sm:text-xl font-black text-red-600">
                        {(Number(viewingOrder.total_amount) - Number(viewingOrder.paid_amount || 0)).toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م
                      </p>
                    </div>
                  </div>

                  {/* Progress */}
                  {Number(viewingOrder.total_amount) > 0 && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>نسبة السداد</span>
                        <span>{Math.round((Number(viewingOrder.paid_amount || 0) / Number(viewingOrder.total_amount)) * 100)}%</span>
                      </div>
                      <Progress value={(Number(viewingOrder.paid_amount || 0) / Number(viewingOrder.total_amount)) * 100} className="h-2.5" />
                    </div>
                  )}

                  {viewingOrder.due_date && (
                    <div className={`flex items-center gap-2 text-xs sm:text-sm font-medium p-2.5 sm:p-3 rounded-lg ${isOverdue(viewingOrder) ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'}`}>
                      <CalendarClock className="w-4 h-4 shrink-0" />
                      <span>{isOverdue(viewingOrder) ? 'تجاوز تاريخ الاستحقاق: ' : 'تاريخ سداد المبلغ المتبقي: '}</span>
                      <span className="font-bold">
                        {new Date(viewingOrder.due_date).toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>
                    </div>
                  )}

                  {/* Mark as Paid Button */}
                  {viewingOrder.payment_status !== 'paid' && viewingOrder.status === 'received' && (
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700 text-white gap-2 font-bold min-h-[44px] h-12 rounded-xl"
                      onClick={handleMarkRemainingPaid}
                      disabled={isMarkingPaid}
                    >
                      <CheckCircle className="w-5 h-5" />
                      {isMarkingPaid ? 'جاري التسجيل...' : `تسجيل سداد المبلغ المتبقي (${(Number(viewingOrder.total_amount) - Number(viewingOrder.paid_amount || 0)).toLocaleString('ar-EG', {minimumFractionDigits: 2})} ج.م)`}
                    </Button>
                  )}

                  {viewingOrder.payment_status === 'paid' && (
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-bold text-xs sm:text-sm bg-green-100 dark:bg-green-900/30 p-2.5 rounded-lg justify-center">
                      <CheckCircle className="w-4 h-4" />
                      تم سداد كامل المبلغ للمورد
                    </div>
                  )}
                </div>
              )}

              {viewingOrder.notes && (
                <div className="bg-orange-50 dark:bg-orange-950/20 text-orange-800 dark:text-orange-200 p-3 sm:p-4 rounded-xl text-xs sm:text-sm border border-orange-200 dark:border-orange-900 shadow-sm flex gap-2.5">
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                  <div>
                    <strong className="block mb-0.5">ملاحظات الفاتورة:</strong>
                    {viewingOrder.notes}
                  </div>
                </div>
              )}

              {/* Items Section */}
              <div>
                <h4 className="font-bold text-base sm:text-lg mb-3 flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
                  تفاصيل الأصناف المشتراة
                </h4>

                {/* Desktop items table */}
                <div className="hidden md:block rounded-xl border border-border shadow-sm overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted">
                      <TableRow>
                        <TableHead className="font-semibold">الصنف</TableHead>
                        <TableHead className="text-center font-semibold">وحدة القياس</TableHead>
                        <TableHead className="text-center font-semibold">الكمية</TableHead>
                        <TableHead className="text-center font-semibold">سعر الوحدة</TableHead>
                        <TableHead className="text-left font-semibold px-4">الإجمالي</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewingOrder.items && viewingOrder.items.map((item: any, idx: number) => (
                        <TableRow key={idx} className="hover:bg-muted/30">
                          <TableCell className="font-medium">{item.name || inventoryItems.find((i: any) => i.id === item.itemId)?.name || 'مجهول'}</TableCell>
                          <TableCell className="text-center text-muted-foreground">{getUnitName(item.unitId) || '-'}</TableCell>
                          <TableCell className="text-center font-medium">{item.quantity}</TableCell>
                          <TableCell className="text-center">{Number(item.unitPrice).toLocaleString('ar-EG')} ج.م</TableCell>
                          <TableCell className="text-left font-bold text-base px-4">{(Number(item.quantity) * Number(item.unitPrice)).toLocaleString('ar-EG', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ج.م</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Mobile items cards */}
                <div className="md:hidden space-y-2.5">
                  {viewingOrder.items && viewingOrder.items.map((item: any, idx: number) => (
                    <div key={idx} className="bg-card border rounded-xl p-3 space-y-2 text-xs">
                      <div className="flex justify-between items-start font-semibold">
                        <span className="text-sm font-bold text-foreground">{item.name || inventoryItems.find((i: any) => i.id === item.itemId)?.name || 'مجهول'}</span>
                        <Badge variant="outline" className="text-[10px]">{getUnitName(item.unitId) || '-'}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                        <span>الكمية: <b className="text-foreground">{item.quantity}</b></span>
                        <span className="text-left">سعر الوحدة: <b className="text-foreground">{Number(item.unitPrice).toLocaleString('ar-EG')} ج.م</b></span>
                      </div>
                      <div className="pt-1 border-t flex justify-between font-bold text-primary">
                        <span>الإجمالي:</span>
                        <span>{(Number(item.quantity) * Number(item.unitPrice)).toLocaleString('ar-EG', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ج.م</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-primary/5 border p-3.5 sm:p-4 flex justify-between items-center rounded-xl mt-3">
                  <span className="text-sm sm:text-base font-bold">الإجمالي الكلي للفاتورة:</span>
                  <span className="text-lg sm:text-2xl font-black text-primary px-2">
                    {Number(viewingOrder.total_amount).toLocaleString('ar-EG', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ج.م
                  </span>
                </div>
              </div>

              {/* Receive / Cancel Actions */}
              {viewingOrder.status === 'pending' && (
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-card border shadow-sm rounded-xl p-4 sm:p-6 mt-4 gap-4">
                  <div className="space-y-1 min-w-0 flex-1">
                    <h4 className="font-bold text-base sm:text-lg flex items-center gap-2">تأكيد الاستلام أو الإلغاء</h4>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      تأكيد استلامك لهذا الطلب سيقوم تلقائياً <strong>برفع كمية المخزون</strong> وإضافة المبالغ إلى <strong>جدول المصروفات</strong>.
                    </p>
                  </div>
                  <div className="flex gap-2.5 w-full md:w-auto">
                    <Button variant="outline" className="text-red-600 border-red-200 hover:text-red-700 hover:bg-red-50 hover:border-red-300 flex-1 md:flex-none min-h-[44px] rounded-xl font-bold"
                      onClick={() => handleUpdateStatus('cancelled')}
                      disabled={isSubmitting}>
                      إلغاء الأمر
                    </Button>
                    <Button className="bg-green-600 hover:bg-green-700 text-white shadow-sm flex-1 md:flex-none gap-2 font-bold min-h-[44px] rounded-xl"
                      onClick={() => handleUpdateStatus('received')}
                      disabled={isSubmitting}>
                      <ShoppingCart className="w-4 h-4" />
                      استلام نهائي
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="mt-2 border-t pt-4 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between w-full gap-2.5 sm:gap-0">
            <div>
              {viewingOrder?.status !== 'pending' && (
                 <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive w-full sm:w-auto min-h-[44px] rounded-xl font-bold" onClick={() => handleDeleteOrder(viewingOrder.id)}>
                   <Trash2 className="w-4 h-4 ml-1.5" />
                   حذف الفاتورة
                 </Button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" className="gap-2 border-primary text-primary hover:bg-primary/5 min-h-[44px] rounded-xl font-bold" onClick={() => handlePrintOrder(viewingOrder)}>
                 <Printer className="w-4 h-4" />
                 طباعة الفاتورة
              </Button>
              <Button type="button" variant="outline" onClick={() => setViewingOrder(null)} disabled={isSubmitting} className="min-h-[44px] rounded-xl font-bold px-6">إغلاق</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
