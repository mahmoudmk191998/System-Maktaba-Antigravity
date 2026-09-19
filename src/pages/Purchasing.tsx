import React, { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout';
import { usePurchaseOrders } from '@/hooks/retail/usePurchaseOrders';
import { useGoodsReceiving } from '@/hooks/retail/useGoodsReceiving';
import { useSuppliers } from '@/hooks/retail/useSuppliers';
import { useAppStore } from '@/lib/store';
import { useFormatters } from '@/lib/formatters';
import { useUserPermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ShoppingCart,
  Plus,
  Search,
  Filter,
  PackageCheck,
  Printer,
  Eye,
  CheckCircle2,
  Clock,
  Truck,
  Building2,
  Calendar,
  DollarSign,
  AlertCircle,
  FileText,
  RotateCcw,
  Check,
  Send,
  XCircle,
  RefreshCw,
  Loader2,
  Receipt,
  Boxes,
} from 'lucide-react';
import type { PurchaseOrder, GoodsReceipt } from '@/types/retail.types';
import { PurchaseOrderModal } from '@/components/retail/purchasing/PurchaseOrderModal';
import { GoodsReceiptModal } from '@/components/retail/purchasing/GoodsReceiptModal';
import { PurchaseOrderPrintDialog } from '@/components/retail/purchasing/PurchaseOrderPrintDialog';
import { GoodsReceiptPrintDialog } from '@/components/retail/purchasing/GoodsReceiptPrintDialog';
import { GoodsReceiptDetailsDialog } from '@/components/retail/purchasing/GoodsReceiptDetailsDialog';
import { toast } from 'sonner';

export default function Purchasing() {
  const { number } = useFormatters();
  const currentBranch = useAppStore((state) => state.currentBranch);
  const currentUser = useAppStore((state) => state.currentUser);
  const { hasPermission, isAdmin } = useUserPermissions();

  const canApprove = isAdmin || hasPermission('purchases.approve');
  const canReceive = isAdmin || hasPermission('purchases.receive');
  const canCreate = isAdmin || hasPermission('purchases.create');

  const {
    purchaseOrders,
    loading: ordersLoading,
    error: ordersError,
    hasMore,
    loadMore,
    refresh: refreshOrders,
    createPO,
    submitPO,
    approvePO,
    cancelPO,
  } = usePurchaseOrders();

  const {
    receipts,
    loading: receiptsLoading,
    error: receiptsError,
    refresh: refreshReceipts,
  } = useGoodsReceiving();
  const { suppliers } = useSuppliers();

  // Active Tab: 'orders' (Purchase Orders) or 'receipts' (Goods Receipts / Actual Purchases)
  const [activeTab, setActiveTab] = useState<'orders' | 'receipts'>('orders');

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');

  // Modals state
  const [isNewPOOpen, setIsNewPOOpen] = useState(false);
  const [receivingPO, setReceivingPO] = useState<PurchaseOrder | null>(null);
  const [isReceivingOpen, setIsReceivingOpen] = useState(false);

  // Print Dialogs state
  const [printPO, setPrintPO] = useState<PurchaseOrder | null>(null);
  const [isPrintPOOpen, setIsPrintPOOpen] = useState(false);

  const [printGRN, setPrintGRN] = useState<GoodsReceipt | null>(null);
  const [isPrintGRNOpen, setIsPrintGRNOpen] = useState(false);

  // Viewing GRN Details
  const [viewingGRN, setViewingGRN] = useState<GoodsReceipt | null>(null);
  const [isViewGRNOpen, setIsViewGRNOpen] = useState(false);

  // Filtered list: Purchase Orders
  const filteredOrders = useMemo(() => {
    return purchaseOrders.filter((po) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        (po.purchaseOrderNumber && po.purchaseOrderNumber.toLowerCase().includes(q)) ||
        (po.supplierNameSnapshot && po.supplierNameSnapshot.toLowerCase().includes(q)) ||
        (po.supplierInvoiceNumber && po.supplierInvoiceNumber.toLowerCase().includes(q));

      const matchesStatus = filterStatus === 'all' || po.status === filterStatus;
      const matchesSupplier = filterSupplier === 'all' || po.supplierId === filterSupplier;

      return matchesQuery && matchesStatus && matchesSupplier;
    });
  }, [purchaseOrders, searchQuery, filterStatus, filterSupplier]);

  // Filtered list: Actual Received Purchases (GRN)
  const filteredReceipts = useMemo(() => {
    return receipts.filter((rc) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        (rc.receiptNumber && rc.receiptNumber.toLowerCase().includes(q)) ||
        (rc.purchaseOrderNumberSnapshot && rc.purchaseOrderNumberSnapshot.toLowerCase().includes(q)) ||
        (rc.supplierNameSnapshot && rc.supplierNameSnapshot.toLowerCase().includes(q)) ||
        (rc.supplierInvoiceNumber && rc.supplierInvoiceNumber.toLowerCase().includes(q)) ||
        (rc.receivedBy && rc.receivedBy.toLowerCase().includes(q));

      const matchesSupplier = filterSupplier === 'all' || rc.supplierId === filterSupplier;

      return matchesQuery && matchesSupplier;
    });
  }, [receipts, searchQuery, filterSupplier]);

  // KPIs
  const kpis = useMemo(() => {
    let awaitingApproval = 0;
    let partiallyReceived = 0;
    let totalReceivedValue = 0;

    purchaseOrders.forEach((po) => {
      if (po.status === 'submitted' || po.status === 'draft') awaitingApproval++;
      if (po.status === 'partially_received') partiallyReceived++;
    });

    receipts.forEach((rc) => {
      totalReceivedValue += rc.grandTotal || 0;
    });

    return {
      totalOrders: purchaseOrders.length,
      awaitingApproval,
      partiallyReceived,
      totalReceipts: receipts.length,
      totalReceivedValue: Math.round(totalReceivedValue * 100) / 100,
    };
  }, [purchaseOrders, receipts]);

  const handleRefreshAll = () => {
    refreshOrders();
    refreshReceipts();
  };

  const handleApprove = async (po: PurchaseOrder) => {
    try {
      await approvePO(po.id, currentUser?.name || 'المدير المسؤول');
      toast.success(`تم اعتماد أمر الشراء ${po.purchaseOrderNumber} بنجاح`);
    } catch (err: any) {
      toast.error(err.message || 'فشل اعتماد أمر الشراء');
    }
  };

  const handleCancel = async (po: PurchaseOrder) => {
    try {
      await cancelPO(po.id, currentUser?.name || 'المستخدم', 'إلغاء يدوي من القائمة');
      toast.success(`تم إلغاء أمر الشراء ${po.purchaseOrderNumber}`);
    } catch (err: any) {
      toast.error(err.message || 'فشل إلغاء أمر الشراء');
    }
  };

  const isGlobalLoading = ordersLoading || receiptsLoading;

  return (
    <MainLayout
      title="إدارة المشتريات والتوريد (Procure-to-Pay)"
      subtitle="أوامر الشراء للناشرين والموردين، فحص واستلام البضاعة الفعلية (GRN)، وتحديث المخزون ومتوسط التكلفة"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={isGlobalLoading}
            className="gap-1.5 font-bold text-xs h-9"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isGlobalLoading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">تحديث</span>
          </Button>

          {canCreate && (
            <Button
              onClick={() => setIsNewPOOpen(true)}
              className="gap-2 font-bold text-xs sm:text-sm h-9 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>أمر شراء جديد</span>
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary/10 text-primary">
            <ShoppingCart className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">أوامر الشراء المسجلة</span>
            <span className="text-xl font-black text-foreground">{number(kpis.totalOrders)}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">بانتظار الاعتماد والتوريد</span>
            <span className="text-xl font-black text-amber-600">{number(kpis.awaitingApproval)}</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">أذون استلام المشتريات (GRN)</span>
            <span className="text-xl font-black text-blue-600">{number(kpis.totalReceipts)} سند</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">إجمالي المشتريات المستلمة</span>
            <span className="text-xl font-black text-emerald-600">{number(kpis.totalReceivedValue)} ج.م</span>
          </div>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center justify-between border-b border-border pb-1">
        <div className="flex items-center gap-2">
          <Button
            variant={activeTab === 'orders' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('orders')}
            className="gap-2 text-xs font-bold h-9"
          >
            <FileText className="w-4 h-4" />
            <span>أوامر الشراء (Purchase Orders)</span>
            <Badge
              variant={activeTab === 'orders' ? 'secondary' : 'outline'}
              className="text-[10px] px-1.5 py-0 h-4 font-mono font-bold"
            >
              {filteredOrders.length}
            </Badge>
          </Button>

          <Button
            variant={activeTab === 'receipts' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('receipts')}
            className="gap-2 text-xs font-bold h-9"
          >
            <PackageCheck className="w-4 h-4" />
            <span>المشتريات الفعلية المستلمة (Goods Receipts)</span>
            <Badge
              variant={activeTab === 'receipts' ? 'secondary' : 'outline'}
              className="text-[10px] px-1.5 py-0 h-4 font-mono font-bold"
            >
              {filteredReceipts.length}
            </Badge>
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 sm:p-4 rounded-2xl bg-card border border-border shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'orders'
                ? 'ابحث برقم أمر الشراء، المورد، أو فاتورة المورد...'
                : 'ابحث برقم إذن الاستلام (GRN)، أمر الشراء، المورد...'
            }
            className="pr-9 text-xs h-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {activeTab === 'orders' && (
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 text-xs w-36">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="draft">مسودة (Draft)</SelectItem>
                <SelectItem value="submitted">مقدم للاعتماد</SelectItem>
                <SelectItem value="approved">معتمد</SelectItem>
                <SelectItem value="ordered">تم إرسال الطلب</SelectItem>
                <SelectItem value="partially_received">مستلم جزئياً</SelectItem>
                <SelectItem value="received">مستلم بالكامل</SelectItem>
                <SelectItem value="cancelled">ملغي</SelectItem>
              </SelectContent>
            </Select>
          )}

          <Select value={filterSupplier} onValueChange={setFilterSupplier}>
            <SelectTrigger className="h-9 text-xs w-44">
              <SelectValue placeholder="المورد" />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="all">كل الموردين والناشرين</SelectItem>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error Banners */}
      {(ordersError || receiptsError) && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold">
            <AlertCircle className="w-4 h-4" />
            <span>{ordersError || receiptsError}</span>
          </div>
          <Button size="sm" variant="outline" onClick={handleRefreshAll} className="h-7 text-xs">
            إعادة المحاولة
          </Button>
        </div>
      )}

      {/* Content for Tab 1: Orders */}
      {activeTab === 'orders' && (
        <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-sm">
          {ordersLoading ? (
            <div className="py-20 text-center text-muted-foreground space-y-3">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
              <div className="text-sm font-bold text-foreground">جارِ تحميل أوامر الشراء...</div>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground space-y-3">
              <div className="p-4 rounded-full bg-muted/60 w-16 h-16 mx-auto flex items-center justify-center">
                <ShoppingCart className="w-8 h-8 text-muted-foreground/60" />
              </div>
              <div className="text-sm font-bold text-foreground">لا توجد أوامر شراء مسجلة</div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                اضغط على "أمر شراء جديد" أعلاه لبدء إصدار طلب توريد أصناف وكتب من الموردين والناشرين.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-muted/50 border-b border-border text-muted-foreground font-bold select-none">
                  <tr>
                    <th className="p-3.5">رقم الطلب</th>
                    <th className="p-3.5">المورد / الناشر</th>
                    <th className="p-3.5">تاريخ الطلب</th>
                    <th className="p-3.5 text-center">تقدم الاستلام</th>
                    <th className="p-3.5 text-left">إجمالي القيمة</th>
                    <th className="p-3.5 text-center">الحالة</th>
                    <th className="p-3.5 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredOrders.map((po) => {
                    const totalOrderedBase = po.items.reduce(
                      (s, i) => s + (i.orderedBaseQuantity || i.orderedQuantity || 0),
                      0
                    );
                    const totalReceivedBase = po.items.reduce(
                      (s, i) => s + (i.receivedBaseQuantity || 0),
                      0
                    );
                    const progressPct =
                      totalOrderedBase > 0
                        ? Math.min(100, Math.round((totalReceivedBase / totalOrderedBase) * 100))
                        : 0;

                    const canReceiveThis =
                      canReceive &&
                      (po.status === 'approved' || po.status === 'ordered' || po.status === 'partially_received');

                    return (
                      <tr key={po.id} className="hover:bg-muted/40 transition-colors">
                        <td className="p-3.5 font-bold font-mono text-foreground flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-primary" />
                          <span>{po.purchaseOrderNumber}</span>
                        </td>
                        <td className="p-3.5">
                          <span className="font-bold">{po.supplierNameSnapshot}</span>
                          {po.supplierInvoiceNumber && (
                            <div className="text-[10px] text-muted-foreground font-mono">
                              فاتورة: {po.supplierInvoiceNumber}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 text-muted-foreground">
                          {po.orderDate || new Date(po.createdAt).toLocaleDateString('ar-EG')}
                        </td>
                        <td className="p-3.5 text-center w-36">
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-bold">
                              <span>{progressPct}%</span>
                              <span className="text-muted-foreground">
                                {totalReceivedBase}/{totalOrderedBase}
                              </span>
                            </div>
                            <Progress value={progressPct} className="h-1.5" />
                          </div>
                        </td>
                        <td className="p-3.5 text-left font-bold text-foreground">
                          {number(po.grandTotal || po.totalAmount || 0)} ج.م
                        </td>
                        <td className="p-3.5 text-center">
                          <Badge
                            variant="outline"
                            className={
                              po.status === 'received'
                                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                                : po.status === 'partially_received'
                                ? 'bg-blue-500/10 text-blue-600 border-blue-500/30'
                                : po.status === 'approved'
                                ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30'
                                : po.status === 'submitted'
                                ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                                : po.status === 'cancelled'
                                ? 'bg-destructive/10 text-destructive border-destructive/30'
                                : 'bg-muted text-muted-foreground'
                            }
                          >
                            {po.status === 'received'
                              ? 'مستلم بالكامل'
                              : po.status === 'partially_received'
                              ? 'مستلم جزئياً'
                              : po.status === 'approved'
                              ? 'معتمد للتوريد'
                              : po.status === 'submitted'
                              ? 'بانتظار الاعتماد'
                              : po.status === 'ordered'
                              ? 'تم الطلب'
                              : po.status === 'cancelled'
                              ? 'ملغي'
                              : 'مسودة (Draft)'}
                          </Badge>
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Approve Action */}
                            {(po.status === 'draft' || po.status === 'submitted') && canApprove && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs gap-1 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                                onClick={() => handleApprove(po)}
                                title="اعتماد أمر الشراء"
                              >
                                <Check className="w-3 h-3" />
                                اعتماد
                              </Button>
                            )}

                            {/* Goods Receiving Trigger */}
                            {canReceiveThis && (
                              <Button
                                size="sm"
                                className="h-7 px-2.5 text-xs gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                                onClick={() => {
                                  setReceivingPO(po);
                                  setIsReceivingOpen(true);
                                }}
                                title="فحص واستلام بضاعة لهذا الأمر"
                              >
                                <PackageCheck className="w-3.5 h-3.5" />
                                استلام بضاعة (GRN)
                              </Button>
                            )}

                            {/* Print PO */}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="طباعة أمر الشراء"
                              onClick={() => {
                                setPrintPO(po);
                                setIsPrintPOOpen(true);
                              }}
                            >
                              <Printer className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {hasMore && (
            <div className="p-3 border-t border-border text-center bg-muted/20">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadMore()}
                disabled={ordersLoading}
                className="text-xs"
              >
                {ordersLoading ? 'جارِ التحميل...' : 'تحميل المزيد من أوامر الشراء'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Content for Tab 2: Actual Goods Receipts (GRN) */}
      {activeTab === 'receipts' && (
        <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-sm">
          {receiptsLoading ? (
            <div className="py-20 text-center text-muted-foreground space-y-3">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-600" />
              <div className="text-sm font-bold text-foreground">جارِ تحميل سجل المشتريات الفعلية المستلمة...</div>
            </div>
          ) : filteredReceipts.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground space-y-3">
              <div className="p-4 rounded-full bg-emerald-500/10 w-16 h-16 mx-auto flex items-center justify-center">
                <PackageCheck className="w-8 h-8 text-emerald-600" />
              </div>
              <div className="text-sm font-bold text-foreground">لا توجد أذون استلام مشتريات فعلية مسجلة بعد</div>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                عند اعتماد أوامر الشراء واستلام الشحنات عبر زر "استلام بضاعة (GRN)"، سيتم إدراج فواتير الاستلام وتحديث كميات المخزون وتكلفة البضاعة هنا فورياً.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-muted/50 border-b border-border text-muted-foreground font-bold select-none">
                  <tr>
                    <th className="p-3.5">رقم إذن الاستلام (GRN)</th>
                    <th className="p-3.5">أمر الشراء المرتبط</th>
                    <th className="p-3.5">المورد / الناشر</th>
                    <th className="p-3.5">تاريخ الاستلام</th>
                    <th className="p-3.5 text-center">الأصناف المستلمة</th>
                    <th className="p-3.5 text-left">قيمة البضاعة المستلمة</th>
                    <th className="p-3.5 text-center">حالة الاستلام</th>
                    <th className="p-3.5 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredReceipts.map((rc) => {
                    const totalAccepted = rc.items.reduce((s, i) => s + (i.acceptedQuantity || 0), 0);
                    return (
                      <tr key={rc.id} className="hover:bg-muted/40 transition-colors">
                        <td className="p-3.5 font-bold font-mono text-emerald-600 flex items-center gap-1.5">
                          <PackageCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{rc.receiptNumber}</span>
                        </td>
                        <td className="p-3.5 font-mono text-foreground font-bold">
                          {rc.purchaseOrderNumberSnapshot || '-'}
                        </td>
                        <td className="p-3.5">
                          <span className="font-bold">{rc.supplierNameSnapshot}</span>
                          {rc.supplierInvoiceNumber && (
                            <div className="text-[10px] text-muted-foreground font-mono">
                              فاتورة المورد: {rc.supplierInvoiceNumber}
                            </div>
                          )}
                        </td>
                        <td className="p-3.5 text-muted-foreground">
                          {new Date(rc.receivedAt || rc.createdAt).toLocaleDateString('ar-EG', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="p-3.5 text-center">
                          <Badge variant="outline" className="text-xs bg-muted/50 font-bold">
                            {rc.items.length} صنف ({number(totalAccepted)} قطعة)
                          </Badge>
                        </td>
                        <td className="p-3.5 text-left font-bold font-mono text-foreground">
                          {number(rc.grandTotal)} ج.م
                        </td>
                        <td className="p-3.5 text-center">
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-bold"
                          >
                            <CheckCircle2 className="w-3 h-3 ml-1" />
                            مكتمل - في المخزون
                          </Badge>
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50 font-bold"
                              onClick={() => {
                                setViewingGRN(rc);
                                setIsViewGRNOpen(true);
                              }}
                              title="عرض تفاصيل الاستلام والأصناف"
                            >
                              <Eye className="w-3 h-3" />
                              عرض
                            </Button>

                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              title="طباعة إذن الاستلام (GRN)"
                              onClick={() => {
                                setPrintGRN(rc);
                                setIsPrintGRNOpen(true);
                              }}
                            >
                              <Printer className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* New PO Modal */}
      <PurchaseOrderModal
        open={isNewPOOpen}
        onOpenChange={setIsNewPOOpen}
        createPO={createPO}
        onSuccess={() => refreshOrders()}
      />

      {/* Goods Receiving Modal */}
      <GoodsReceiptModal
        open={isReceivingOpen}
        onOpenChange={setIsReceivingOpen}
        purchaseOrder={receivingPO}
        onSuccess={(grn) => {
          refreshOrders();
          refreshReceipts();
          setPrintGRN(grn);
          setIsPrintGRNOpen(true);
        }}
      />

      {/* Printable PO Dialog */}
      <PurchaseOrderPrintDialog
        open={isPrintPOOpen}
        onOpenChange={setIsPrintPOOpen}
        purchaseOrder={printPO}
        storeName={currentBranch?.name || 'مكتبة ألوان التجارية'}
      />

      {/* Printable GRN Dialog */}
      <GoodsReceiptPrintDialog
        open={isPrintGRNOpen}
        onOpenChange={setIsPrintGRNOpen}
        goodsReceipt={printGRN}
        storeName={currentBranch?.name || 'مكتبة ألوان التجارية'}
      />

      {/* Goods Receipt Details Dialog */}
      <GoodsReceiptDetailsDialog
        open={isViewGRNOpen}
        onOpenChange={setIsViewGRNOpen}
        goodsReceipt={viewingGRN}
        onPrint={() => {
          if (viewingGRN) {
            setPrintGRN(viewingGRN);
            setIsPrintGRNOpen(true);
          }
        }}
      />
      </div>
    </MainLayout>
  );
}
