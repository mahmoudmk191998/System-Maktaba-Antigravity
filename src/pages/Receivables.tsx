import React, { useState } from 'react';
import { MainLayout } from '@/components/layout';
import { useReceivables } from '@/hooks/retail/useReceivables';
import { useCustomers } from '@/hooks/retail/useCustomers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  CreditCard,
  Clock,
  AlertTriangle,
  Users,
  Search,
  CheckCircle,
  Receipt,
  FileText,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { ReceivePaymentModal } from '@/components/retail/customers/ReceivePaymentModal';
import { CustomerProfileDrawer } from '@/components/retail/customers/CustomerProfileDrawer';
import type { Customer, CustomerReceivable } from '@/types/retail.types';

export const Receivables: React.FC = () => {
  const { receivables, agingSummary, loading, fetchReceivables } = useReceivables();
  const { customers, fetchCustomers } = useCustomers();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'open' | 'partially_paid'>('all');

  // Modals state
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);

  const handleOpenPayment = (customerId: string) => {
    const cust = customers.find((c) => c.id === customerId);
    if (cust) {
      setSelectedCustomer(cust);
      setPaymentModalOpen(true);
    }
  };

  const handleOpenProfile = (customerId: string) => {
    const cust = customers.find((c) => c.id === customerId);
    if (cust) {
      setSelectedCustomer(cust);
      setProfileDrawerOpen(true);
    }
  };

  const filteredReceivables = receivables.filter((rec) => {
    const remaining = Number(rec.remainingAmount || 0);
    if (remaining <= 0) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchInv = rec.invoiceNumber.toLowerCase().includes(q);
      const matchCust = rec.customerNameSnapshot.toLowerCase().includes(q);
      if (!matchInv && !matchCust) return false;
    }

    // Status filter
    if (statusFilter === 'overdue') {
      const isPastDue = new Date(rec.dueDate).getTime() < Date.now();
      return isPastDue;
    }
    if (statusFilter !== 'all' && rec.status !== statusFilter) {
      return false;
    }

    return true;
  });

  const totalDebtCustomersCount = customers.filter(
    (c) => (c.currentBalance ?? c.balance ?? 0) > 0.01
  ).length;

  return (
    <MainLayout
      title="إدارة المستحقات والديون (Accounts Receivable)"
      subtitle="متابعة الفواتير الآجلة، تحصيل الديون، وتحليل أعمار الذمم المدينة"
      actions={
        <Button onClick={() => fetchReceivables()} variant="outline" size="sm" className="gap-1 text-xs">
          تحديث السجلات
        </Button>
      }
    >
      <div className="space-y-6 max-w-7xl mx-auto" dir="rtl">

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-4 gap-4 text-xs">
        <Card className="border-l-4 border-l-amber-500 shadow-sm">
          <CardContent className="p-4">
            <div className="text-slate-500 font-medium">إجمالي الديون المستحقة</div>
            <div className="text-2xl font-bold text-amber-700 mt-1">
              {formatCurrency(agingSummary.totalOutstanding)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">{agingSummary.totalReceivablesCount} فاتورة مفتوحة</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-rose-600 shadow-sm">
          <CardContent className="p-4">
            <div className="text-slate-500 font-medium">ديون متأخرة السداد (Overdue)</div>
            <div className="text-2xl font-bold text-rose-700 mt-1">
              {formatCurrency(agingSummary.days1to30 + agingSummary.days31to60 + agingSummary.days61to90 + agingSummary.days90Plus)}
            </div>
            <div className="text-[11px] text-rose-500 mt-1">{agingSummary.overdueCount} فاتورة تجاوزت تاريخ الاستحقاق</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500 shadow-sm">
          <CardContent className="p-4">
            <div className="text-slate-500 font-medium">ديون جارية (ضمن الأجل)</div>
            <div className="text-2xl font-bold text-emerald-700 mt-1">
              {formatCurrency(agingSummary.current)}
            </div>
            <div className="text-[11px] text-emerald-600 mt-1">لم تتجاوز فترة الائتمان المحددة</div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-indigo-500 shadow-sm">
          <CardContent className="p-4">
            <div className="text-slate-500 font-medium">العملاء المدينون للمكتبة</div>
            <div className="text-2xl font-bold text-indigo-700 mt-1">
              {totalDebtCustomersCount} عميل
            </div>
            <div className="text-[11px] text-slate-400 mt-1">من إجمالي {customers.length} عميل مسجل</div>
          </CardContent>
        </Card>
      </div>

      {/* Aging Buckets Banner */}
      <Card className="shadow-sm border-slate-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            تحليل أعمار الذمم المدينة للمكتبة (Aging Schedule)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-3 text-center text-xs">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <span className="text-slate-500 block">جارية (ضمن المدة)</span>
              <span className="text-base font-bold text-emerald-800 mt-1 block">
                {formatCurrency(agingSummary.current)}
              </span>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="text-slate-500 block">1 - 30 يوماً</span>
              <span className="text-base font-bold text-amber-800 mt-1 block">
                {formatCurrency(agingSummary.days1to30)}
              </span>
            </div>
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <span className="text-slate-500 block">31 - 60 يوماً</span>
              <span className="text-base font-bold text-orange-800 mt-1 block">
                {formatCurrency(agingSummary.days31to60)}
              </span>
            </div>
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <span className="text-slate-500 block">61 - 90 يوماً</span>
              <span className="text-base font-bold text-red-800 mt-1 block">
                {formatCurrency(agingSummary.days61to90)}
              </span>
            </div>
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg">
              <span className="text-slate-500 block">أكثر من 90 يوماً</span>
              <span className="text-base font-bold text-rose-900 mt-1 block">
                {formatCurrency(agingSummary.days90Plus)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Receivables Table Section */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 border-b">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="relative w-72">
                <Search className="w-3.5 h-3.5 absolute right-3 top-2.5 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="بحث بالفاتورة أو اسم العميل..."
                  className="pr-8 h-8 text-xs"
                />
              </div>
              <div className="flex gap-1.5 text-xs">
                <Button
                  size="sm"
                  variant={statusFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('all')}
                  className="h-8 text-xs"
                >
                  الكل ({receivables.filter(r => r.remainingAmount > 0).length})
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === 'overdue' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('overdue')}
                  className="h-8 text-xs text-rose-600 border-rose-200"
                >
                  المتأخرات ({agingSummary.overdueCount})
                </Button>
                <Button
                  size="sm"
                  variant={statusFilter === 'partially_paid' ? 'default' : 'outline'}
                  onClick={() => setStatusFilter('partially_paid')}
                  className="h-8 text-xs"
                >
                  سداد جزئي
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b">
                <tr>
                  <th className="py-2.5 px-4 text-right">رقم الفاتورة</th>
                  <th className="py-2.5 px-4 text-right">العميل</th>
                  <th className="py-2.5 px-4 text-right">تاريخ الإصدار</th>
                  <th className="py-2.5 px-4 text-right">تاريخ الاستحقاق</th>
                  <th className="py-2.5 px-4 text-left">أصل المبلغ</th>
                  <th className="py-2.5 px-4 text-left">المسدد</th>
                  <th className="py-2.5 px-4 text-left">المتبقي المطلوب</th>
                  <th className="py-2.5 px-4 text-center">الحالة</th>
                  <th className="py-2.5 px-4 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={9} className="text-center py-8 text-slate-400">جارٍ تحميل المستحقات...</td></tr>
                ) : filteredReceivables.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-slate-400">لا توجد فواتير آجلة مطابقة للشروط</td></tr>
                ) : (
                  filteredReceivables.map((rec) => {
                    const isPastDue = new Date(rec.dueDate).getTime() < Date.now();
                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 font-mono font-bold text-slate-800">{rec.invoiceNumber}</td>
                        <td className="py-3 px-4">
                          <span
                            onClick={() => handleOpenProfile(rec.customerId)}
                            className="font-semibold text-primary hover:underline cursor-pointer"
                          >
                            {rec.customerNameSnapshot}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-mono">{rec.issueDate}</td>
                        <td className="py-3 px-4 font-mono">
                          <span className={isPastDue ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                            {rec.dueDate}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-left font-mono">{formatCurrency(rec.originalAmount)}</td>
                        <td className="py-3 px-4 text-left font-mono text-emerald-700">{formatCurrency(rec.paidAmount)}</td>
                        <td className="py-3 px-4 text-left font-mono font-bold text-amber-700">{formatCurrency(rec.remainingAmount)}</td>
                        <td className="py-3 px-4 text-center">
                          {isPastDue ? (
                            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">متأخرة</Badge>
                          ) : rec.status === 'partially_paid' ? (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">سداد جزئي</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">مفتوحة</Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Button
                            size="sm"
                            onClick={() => handleOpenPayment(rec.customerId)}
                            className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                          >
                            <CreditCard className="w-3 h-3" />
                            تحصيل
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modals & Drawers */}
      <ReceivePaymentModal
        open={paymentModalOpen}
        onOpenChange={setPaymentModalOpen}
        customer={selectedCustomer}
        onPaymentSuccess={() => {
          fetchReceivables();
          fetchCustomers();
        }}
      />

      <CustomerProfileDrawer
        open={profileDrawerOpen}
        onOpenChange={setProfileDrawerOpen}
        customer={selectedCustomer}
        onCustomerUpdated={() => {
          fetchReceivables();
          fetchCustomers();
        }}
      />
      </div>
    </MainLayout>
  );
};

export default Receivables;
