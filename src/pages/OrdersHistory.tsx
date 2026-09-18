/**
 * Sales & Invoices History Page
 * Replaces restaurant orders history with comprehensive retail sales audit and receipt reprinting.
 */

import React, { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  Receipt,
  Search,
  Printer,
  Eye,
  Calendar,
  DollarSign,
  TrendingUp,
  Tag,
  Filter,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { useSales } from '@/hooks/retail/useSales';
import { useFormatters } from '@/lib/formatters';
import { SaleDetailsDrawer } from '@/components/retail/pos/SaleDetailsDrawer';
import { ReceiptDialog } from '@/components/retail/pos/ReceiptDialog';
import type { Sale } from '@/types/retail.types';
import { useAppStore } from '@/lib/store';

export default function OrdersHistory() {
  const { currentTenant, currentBranch } = useAppStore();
  const { currency, number } = useFormatters();
  const { sales, loading, hasMore, loadMore, refresh } = useSales();

  const [searchInvoice, setSearchInvoice] = useState('');
  const [selectedSaleForDetails, setSelectedSaleForDetails] = useState<Sale | null>(null);
  const [selectedSaleForReceipt, setSelectedSaleForReceipt] = useState<Sale | null>(null);

  const filteredSales = sales.filter((s) => {
    if (!searchInvoice.trim()) return true;
    const q = searchInvoice.trim().toLowerCase();
    return (
      s.invoiceNumber.toLowerCase().includes(q) ||
      (s.customerNameSnapshot && s.customerNameSnapshot.toLowerCase().includes(q)) ||
      (s.cashierNameSnapshot && s.cashierNameSnapshot.toLowerCase().includes(q))
    );
  });

  // Calculate totals for currently filtered sales
  const summaryTotals = filteredSales.reduce(
    (acc, s) => {
      acc.revenue += Number(s.total || 0);
      acc.cost += Number(s.costTotal || 0);
      acc.profit += Number(s.grossProfit || 0);
      return acc;
    },
    { revenue: 0, cost: 0, profit: 0 }
  );

  return (
    <MainLayout
      title="سجل فواتير المبيعات (Sales History)"
      subtitle="استعراض فواتير البيع الصادرة، الأرباح، واللقطات التاريخية للأصناف وإعادة طباعة الإيصالات"
      actions={
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 text-xs font-semibold h-9"
          onClick={() => refresh()}
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>تحديث الفواتير</span>
        </Button>
      }
    >
      <div className="space-y-4 p-2 sm:p-4 max-w-7xl mx-auto" dir="rtl">

        {/* Financial KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="bg-card/70 border-border">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-semibold">إجمالي المبيعات (Revenue)</p>
                <h3 className="text-xl font-black text-foreground mt-1">{number(summaryTotals.revenue)} ج.م</h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                <DollarSign className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/70 border-border">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground font-semibold">تكلفة البضاعة المباعة (COGS)</p>
                <h3 className="text-xl font-black text-muted-foreground mt-1">{number(summaryTotals.cost)} ج.م</h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-muted text-muted-foreground flex items-center justify-center">
                <Tag className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-emerald-500/10 border-emerald-500/20">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-emerald-700 font-semibold">مجمل الأرباح (Gross Profit)</p>
                <h3 className="text-xl font-black text-emerald-600 mt-1">{number(summaryTotals.profit)} ج.م</h3>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter Bar */}
        <div className="p-3 bg-card rounded-xl border border-border flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-3 top-3 text-muted-foreground" />
            <Input
              value={searchInvoice}
              onChange={(e) => setSearchInvoice(e.target.value)}
              placeholder="ابحث برقم الفاتورة (INV-...) أو اسم العميل أو اسم الكاشير..."
              className="pr-9 h-10 text-sm"
            />
          </div>
        </div>

        {/* Sales Table */}
        <Card className="border-border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="text-right">رقم الفاتورة</TableHead>
                  <TableHead className="text-right">التاريخ والوقت</TableHead>
                  <TableHead className="text-right">الكاشير</TableHead>
                  <TableHead className="text-right">العميل</TableHead>
                  <TableHead className="text-right">طريقة الدفع</TableHead>
                  <TableHead className="text-right">النوع</TableHead>
                  <TableHead className="text-right">الإجمالي</TableHead>
                  <TableHead className="text-right">مجمل الربح</TableHead>
                  <TableHead className="text-center">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && sales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">
                      جاري تحميل فواتير المبيعات...
                    </TableCell>
                  </TableRow>
                ) : filteredSales.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-10 text-muted-foreground text-sm">
                      لا توجد فواتير مبيعات مسجلة
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSales.map((sale) => (
                    <TableRow key={sale.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono font-bold text-primary">
                        {sale.invoiceNumber}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(sale.createdAt).toLocaleString('ar-EG')}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {sale.cashierNameSnapshot || 'كاشير'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {sale.customerNameSnapshot || 'عميل نقدي'}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {sale.paymentMethods?.map((pm, idx) => (
                            <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0">
                              {pm.method === 'cash' ? 'نقداً' : pm.method === 'visa' ? 'فيزا' : pm.method}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={sale.saleType === 'wholesale' ? 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30' : 'bg-muted'}
                        >
                          {sale.saleType === 'wholesale' ? 'جملة' : 'قطاعي'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-extrabold text-sm text-foreground">
                        {number(sale.total)} ج.م
                      </TableCell>
                      <TableCell className="font-bold text-xs text-emerald-600">
                        +{number(sale.grossProfit || 0)} ج.م
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => setSelectedSaleForDetails(sale)}
                            title="عرض التفاصيل والأصناف"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                            onClick={() => setSelectedSaleForReceipt(sale)}
                            title="إعادة طباعة الإيصال الحراري"
                          >
                            <Printer className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {hasMore && (
            <div className="p-3 text-center border-t border-border">
              <Button size="sm" variant="outline" onClick={() => loadMore()} disabled={loading}>
                {loading ? 'جاري التحميل...' : 'تحميل المزيد من الفواتير'}
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Sale Details Drawer */}
      <SaleDetailsDrawer
        open={!!selectedSaleForDetails}
        onOpenChange={(open) => !open && setSelectedSaleForDetails(null)}
        sale={selectedSaleForDetails}
      />

      {/* Thermal Receipt Dialog for Reprint — store identity auto-read from settings */}
      <ReceiptDialog
        open={!!selectedSaleForReceipt}
        onOpenChange={(open) => !open && setSelectedSaleForReceipt(null)}
        sale={selectedSaleForReceipt}
      />
    </MainLayout>
  );
}
