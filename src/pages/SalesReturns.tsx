import React, { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout';
import { useSaleReturns } from '@/hooks/retail/useSaleReturns';
import { useAppStore } from '@/lib/store';
import { useFormatters } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  RotateCcw,
  RefreshCw,
  Search,
  Filter,
  Printer,
  Eye,
  Calendar,
  DollarSign,
  Package,
  AlertOctagon,
  ShieldCheck,
  FileText,
  ArrowUpDown,
  Plus,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import type { SaleReturn } from '@/types/retail.types';
import { ReturnReceiptDialog } from '@/components/retail/returns/ReturnReceiptDialog';
import { useNavigate } from 'react-router-dom';

export default function SalesReturns() {
  const { number } = useFormatters();
  const navigate = useNavigate();
  const currentBranch = useAppStore((state) => state.currentBranch);

  const { returns, loading, hasMore, loadMore, refresh } = useSaleReturns();

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMethod, setFilterMethod] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Selected return for drawer
  const [selectedReturn, setSelectedReturn] = useState<SaleReturn | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Receipt printing state
  const [receiptReturn, setReceiptReturn] = useState<SaleReturn | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);

  // Filtered returns list
  const filteredReturns = useMemo(() => {
    return returns.filter((ret) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        ret.returnNumber.toLowerCase().includes(q) ||
        ret.invoiceNumberSnapshot.toLowerCase().includes(q) ||
        (ret.processedBy && ret.processedBy.toLowerCase().includes(q)) ||
        (ret.customerNameSnapshot && ret.customerNameSnapshot.toLowerCase().includes(q));

      const matchesMethod = filterMethod === 'all' || ret.refundMethod === filterMethod;
      const matchesStatus = filterStatus === 'all' || ret.status === filterStatus;

      return matchesQuery && matchesMethod && matchesStatus;
    });
  }, [returns, searchQuery, filterMethod, filterStatus]);

  // KPI calculations
  const kpis = useMemo(() => {
    let totalRefundAmount = 0;
    let restockedCount = 0;
    let damagedCount = 0;

    returns.forEach((ret) => {
      if (ret.status !== 'cancelled') {
        totalRefundAmount += ret.refundAmount || ret.totalRefundAmount || 0;
        ret.items?.forEach((item) => {
          if (item.restock || item.restockToInventory) {
            restockedCount += item.quantity || item.returnQuantity || 0;
          } else {
            damagedCount += item.quantity || item.returnQuantity || 0;
          }
        });
      }
    });

    return {
      count: returns.length,
      totalRefundAmount,
      restockedCount,
      damagedCount,
    };
  }, [returns]);

  const handleOpenDetails = (ret: SaleReturn) => {
    setSelectedReturn(ret);
    setDrawerOpen(true);
  };

  const handleReprintReceipt = (ret: SaleReturn, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setReceiptReturn(ret);
    setReceiptOpen(true);
  };

  return (
    <MainLayout
      title="مرتجعات واستبدال المبيعات"
      subtitle="إدارة عمليات المرتجع، استرداد المبالغ، الاستبدال، وعكس تكلفة البضاعة المباعة (WAC) بدقة"
      actions={
        <div className="flex items-center gap-2">
          <Button
            onClick={() => navigate('/orders-history')}
            className="gap-2 bg-primary font-bold text-xs sm:text-sm shadow-sm"
          >
            <Search className="w-4 h-4" />
            <span>بحث في فواتير المبيعات</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refresh()}
            disabled={loading}
            title="تحديث القائمة"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      }
    >
      <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Returns Count */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">إجمالي عمليات المرتجع</span>
            <span className="text-xl font-black text-foreground">{number(kpis.count)}</span>
          </div>
        </div>

        {/* Total Refund Value */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-destructive/10 text-destructive">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">إجمالي المبالغ المستردة</span>
            <span className="text-xl font-black text-destructive">{number(kpis.totalRefundAmount)} ج.م</span>
          </div>
        </div>

        {/* Restocked Items */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">قطع أُعيدت للمخزن (سليمة)</span>
            <span className="text-xl font-black text-emerald-600">{number(kpis.restockedCount)}</span>
          </div>
        </div>

        {/* Damaged Non-restock Items */}
        <div className="p-4 rounded-2xl bg-card border border-border shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-red-500/10 text-red-600">
            <AlertOctagon className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">قطع توالف وهالك (غير مضافة)</span>
            <span className="text-xl font-black text-red-600">{number(kpis.damagedCount)}</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 sm:p-4 rounded-2xl bg-card border border-border shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Search input */}
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث برقم المرتجع، الفاتورة الأصلية، العميل، الكاشير..."
            className="pr-9 text-xs h-9"
          />
        </div>

        {/* Select Dropdowns */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <Select value={filterMethod} onValueChange={setFilterMethod}>
            <SelectTrigger className="h-9 text-xs w-36">
              <SelectValue placeholder="طريقة الرد" />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="all">كل طرق الرد</SelectItem>
              <SelectItem value="cash">نقداً (Cash)</SelectItem>
              <SelectItem value="card">بطاقة (Card)</SelectItem>
              <SelectItem value="wallet">محفظة إلكترونية</SelectItem>
              <SelectItem value="instapay">إنستاباي</SelectItem>
              <SelectItem value="other">أخرى</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 text-xs w-32">
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="all">كل الحالات</SelectItem>
              <SelectItem value="completed">مكتملة</SelectItem>
              <SelectItem value="cancelled">ملغاة</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Returns Table / Cards */}
      <div className="border border-border rounded-2xl overflow-hidden bg-card shadow-sm">
        {filteredReturns.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground space-y-3">
            <div className="p-4 rounded-full bg-muted/60 w-16 h-16 mx-auto flex items-center justify-center">
              <RotateCcw className="w-8 h-8 text-muted-foreground/60" />
            </div>
            <div className="text-sm font-bold text-foreground">لا توجد عمليات مرتجع مسجلة</div>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              يمكنك عمل مرتجع أو استبدال لفاتورة بيع عبر فتح شاشة فواتير المبيعات واختيار الفاتورة المطلوبة.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-muted/50 border-b border-border text-muted-foreground font-bold select-none">
                <tr>
                  <th className="p-3.5">رقم المرتجع</th>
                  <th className="p-3.5">الفاتورة الأصلية</th>
                  <th className="p-3.5">التاريخ والوقت</th>
                  <th className="p-3.5">المسؤول</th>
                  <th className="p-3.5 text-center">الأصناف</th>
                  <th className="p-3.5">طريقة الرد</th>
                  <th className="p-3.5 text-left">المبلغ المسترد</th>
                  <th className="p-3.5 text-center">الحالة</th>
                  <th className="p-3.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredReturns.map((ret) => {
                  const itemsCount = ret.items?.reduce((s, i) => s + (i.quantity || 1), 0) || 0;
                  return (
                    <tr
                      key={ret.id}
                      onClick={() => handleOpenDetails(ret)}
                      className="hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <td className="p-3.5 font-bold font-mono text-foreground flex items-center gap-1.5">
                        <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                        <span>{ret.returnNumber}</span>
                      </td>
                      <td className="p-3.5 font-mono text-muted-foreground">{ret.invoiceNumberSnapshot}</td>
                      <td className="p-3.5 text-muted-foreground">
                        {new Date(ret.createdAt).toLocaleString('ar-EG', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="p-3.5">{ret.processedBy || 'كاشير'}</td>
                      <td className="p-3.5 text-center font-bold">{itemsCount}</td>
                      <td className="p-3.5">
                        <Badge variant="outline" className="text-[10px]">
                          {ret.refundMethod === 'cash'
                            ? 'نقداً (Cash)'
                            : ret.refundMethod === 'card'
                            ? 'بطاقة بنكية'
                            : ret.refundMethod === 'instapay'
                            ? 'إنستاباي'
                            : ret.refundMethod}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-left font-bold text-destructive">
                        {number(ret.refundAmount || ret.totalRefundAmount || 0)} ج.م
                      </td>
                      <td className="p-3.5 text-center">
                        <Badge
                          variant="outline"
                          className={
                            ret.status === 'completed'
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30'
                              : 'bg-destructive/10 text-destructive border-destructive/30'
                          }
                        >
                          {ret.status === 'completed' ? 'مكتمل' : 'ملغى'}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            title="معاينة التفاصيل"
                            onClick={() => handleOpenDetails(ret)}
                          >
                            <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                            title="إعادة طباعة إيصال المرتجع"
                            onClick={(e) => handleReprintReceipt(ret, e)}
                          >
                            <Printer className="w-3.5 h-3.5 text-amber-600" />
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

        {/* Load more button */}
        {hasMore && (
          <div className="p-3 border-t border-border text-center bg-muted/20">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadMore()}
              disabled={loading}
              className="text-xs"
            >
              {loading ? 'جارِ التحميل...' : 'تحميل المزيد من المرتجعات'}
            </Button>
          </div>
        )}
      </div>

      {/* Return Details Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-full sm:max-w-xl overflow-y-auto" dir="rtl">
          {selectedReturn && (
            <>
              <SheetHeader className="border-b border-border pb-3">
                <div className="flex items-center justify-between">
                  <SheetTitle className="text-xl font-bold flex items-center gap-2">
                    <RotateCcw className="w-5 h-5 text-amber-600" />
                    <span>تفاصيل المرتجع: {selectedReturn.returnNumber}</span>
                  </SheetTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 font-semibold"
                    onClick={() => handleReprintReceipt(selectedReturn)}
                  >
                    <Printer className="w-4 h-4" />
                    طباعة إيصال
                  </Button>
                </div>
                <SheetDescription className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 pt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(selectedReturn.createdAt).toLocaleString('ar-EG')}
                  </span>
                  <span>الفاتورة الأصلية: {selectedReturn.invoiceNumberSnapshot}</span>
                  <span>المسؤول: {selectedReturn.processedBy || 'كاشير'}</span>
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 py-4">
                {/* Financial Summary Cards */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-3 bg-muted/40 rounded-xl border border-border space-y-1">
                    <span className="text-[11px] text-muted-foreground block">المبلغ المسترد</span>
                    <span className="text-base font-bold text-destructive">
                      {number(selectedReturn.refundAmount || selectedReturn.totalRefundAmount || 0)} ج.م
                    </span>
                  </div>
                  <div className="p-3 bg-muted/40 rounded-xl border border-border space-y-1">
                    <span className="text-[11px] text-muted-foreground block">التكلفة المعكوسة</span>
                    <span className="text-base font-bold text-muted-foreground">
                      {number(selectedReturn.costReversed || 0)} ج.م
                    </span>
                  </div>
                  <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 space-y-1">
                    <span className="text-[11px] text-amber-700 block font-semibold">الربح المعكوس</span>
                    <span className="text-base font-extrabold text-amber-700">
                      -{number(selectedReturn.profitReversed || 0)} ج.م
                    </span>
                  </div>
                </div>

                {/* Returned Items List */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-primary" />
                    <span>الأصناف المرتجعة</span>
                  </h4>
                  <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
                    {selectedReturn.items?.map((item, idx) => (
                      <div key={idx} className="p-3 bg-card text-xs space-y-1.5">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-bold text-sm text-foreground">
                              {item.productNameSnapshot}
                            </span>
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                              SKU: {item.skuSnapshot}
                              {item.barcodeSnapshot ? ` | باركود: ${item.barcodeSnapshot}` : ''}
                            </div>
                          </div>
                          <div className="text-left font-bold text-sm text-destructive">
                            {number(item.refundLineAmount || item.lineTotal || 0)} ج.م
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-border/50 text-[11px] text-muted-foreground">
                          <div>
                            الكمية المرتجعة: <strong className="text-foreground">{item.quantity}</strong>
                          </div>
                          <div>
                            سعر البيع الأصلي:{' '}
                            <strong className="text-foreground">{number(item.unitSellingPrice)}</strong>
                          </div>
                          <div>
                            الحالة:{' '}
                            <strong className="text-foreground">
                              {item.condition === 'resellable'
                                ? 'صالح للبيع'
                                : item.condition === 'damaged'
                                ? 'تالف'
                                : item.condition === 'defective'
                                ? 'معيب مصنعياً'
                                : item.condition}
                            </strong>
                          </div>
                          <div>
                            إعادة للمخزن:{' '}
                            <strong
                              className={
                                item.restock || item.restockToInventory
                                  ? 'text-emerald-600'
                                  : 'text-red-600'
                              }
                            >
                              {item.restock || item.restockToInventory ? 'نعم (صالح)' : 'لا (تالف/هالك)'}
                            </strong>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Idempotency Lock Badge */}
                {selectedReturn.idempotencyKey && (
                  <div className="p-3 rounded-xl bg-muted/40 border border-border flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <ShieldCheck className="w-4 h-4 text-blue-500" />
                      <span>قفل المعاملة الذري (Idempotency Key):</span>
                    </span>
                    <span className="font-mono text-[10px] text-foreground">
                      {selectedReturn.idempotencyKey}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Printable Receipt Dialog */}
      <ReturnReceiptDialog
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        saleReturn={receiptReturn}
        storeName={currentBranch?.name || 'مكتبة ألوان التجارية'}
      />
      </div>
    </MainLayout>
  );
}
