import React, { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  User,
  CreditCard,
  FileText,
  Clock,
  RotateCcw,
  ShieldCheck,
  Printer,
  Receipt,
  AlertCircle,
  PlusCircle,
  Building2,
  Phone,
  Mail,
  MapPin,
} from 'lucide-react';
import type {
  Customer,
  CustomerReceivable,
  CustomerLedgerEntry,
  CustomerPayment,
  Sale,
  SaleReturn,
} from '@/types/retail.types';
import { formatCurrency } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { calculateReceivablesAging } from '@/services/customers/creditSales.service';
import { CustomerStatementPrintDialog } from './CustomerStatementPrintDialog';
import { CustomerPaymentReceiptDialog } from './CustomerPaymentReceiptDialog';
import { ReceivePaymentModal } from './ReceivePaymentModal';

interface CustomerProfileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  onCustomerUpdated?: () => void;
}

export const CustomerProfileDrawer: React.FC<CustomerProfileDrawerProps> = ({
  open,
  onOpenChange,
  customer,
  onCustomerUpdated,
}) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);

  // Sub-data states
  const [receivables, setReceivables] = useState<CustomerReceivable[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<CustomerLedgerEntry[]>([]);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [returns, setReturns] = useState<SaleReturn[]>([]);

  // Dialog triggers
  const [statementPrintOpen, setStatementPrintOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [receiptPrintOpen, setReceiptPrintOpen] = useState(false);
  const [selectedPaymentForReceipt, setSelectedPaymentForReceipt] = useState<CustomerPayment | null>(null);

  useEffect(() => {
    if (!open || !customer) return;

    const fetchCustomerData = async () => {
      setLoading(true);
      try {
        const cTenant = customer.tenantId || (customer as any).tenant_id;

        // 1. Receivables
        try {
          const recSnap = await getDocs(
            query(collection(db, 'customer_receivables'), where('customerId', '==', customer.id))
          );
          const rList = recSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as CustomerReceivable))
            .filter((r) => !cTenant || cTenant === 'default' || r.tenantId === cTenant || (r as any).tenant_id === cTenant)
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
          setReceivables(rList);
        } catch (e) {
          console.warn('Error fetching drawer receivables:', e);
        }

        // 2. Ledger Entries
        try {
          const ledSnap = await getDocs(
            query(collection(db, 'customer_ledger'), where('customerId', '==', customer.id))
          );
          const lList = ledSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as CustomerLedgerEntry))
            .filter((l) => !cTenant || cTenant === 'default' || l.tenantId === cTenant || (l as any).tenant_id === cTenant)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setLedgerEntries(lList.slice(0, 100));
        } catch (e) {
          console.warn('Error fetching drawer ledger:', e);
        }

        // 3. Payments
        try {
          const paySnap = await getDocs(
            query(collection(db, 'customer_payments'), where('customerId', '==', customer.id))
          );
          const pList = paySnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as CustomerPayment))
            .filter((p) => !cTenant || cTenant === 'default' || p.tenantId === cTenant || (p as any).tenant_id === cTenant)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setPayments(pList.slice(0, 50));
        } catch (e) {
          console.warn('Error fetching drawer payments:', e);
        }

        // 4. Sales
        try {
          const salesSnap = await getDocs(
            query(collection(db, 'sales'), where('customerId', '==', customer.id))
          );
          const sList = salesSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as Sale))
            .filter((s) => !cTenant || cTenant === 'default' || s.tenantId === cTenant || (s as any).tenant_id === cTenant)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setSales(sList.slice(0, 50));
        } catch (e) {
          console.warn('Error fetching drawer sales:', e);
        }

        // 5. Returns
        try {
          const retSnap = await getDocs(
            query(collection(db, 'sale_returns'), where('customerId', '==', customer.id))
          );
          const retList = retSnap.docs
            .map((d) => ({ id: d.id, ...d.data() } as SaleReturn))
            .filter((r) => !cTenant || cTenant === 'default' || r.tenantId === cTenant || (r as any).tenant_id === cTenant)
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setReturns(retList.slice(0, 50));
        } catch (e) {
          console.warn('Error fetching drawer returns:', e);
        }
      } catch (err) {
        console.error('Error fetching customer profile data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCustomerData();
  }, [open, customer]);

  if (!customer) return null;

  const currentDebt = Number(customer.currentBalance ?? customer.balance ?? 0);
  const creditLimit = Number(customer.creditLimit || 0);
  const availableCredit = Math.max(0, creditLimit - Math.max(0, currentDebt));
  const aging = calculateReceivablesAging(receivables);

  const getCustomerTypeBadge = (type: string) => {
    switch (type) {
      case 'wholesale': return <Badge variant="secondary" className="bg-purple-100 text-purple-700">جملة</Badge>;
      case 'school': return <Badge variant="secondary" className="bg-blue-100 text-blue-700">مدرسة</Badge>;
      case 'company': return <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">شركة</Badge>;
      case 'teacher': return <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">مدرس</Badge>;
      case 'corporate': return <Badge variant="secondary" className="bg-cyan-100 text-cyan-700">مؤسسة</Badge>;
      default: return <Badge variant="outline">قطاعي</Badge>;
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="w-full sm:max-w-4xl p-0 flex flex-col">
          {/* Header Banner */}
          <div className="bg-slate-900 text-white p-6 pb-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold">{customer.name}</h2>
                  {getCustomerTypeBadge(customer.customerType)}
                  {customer.creditEnabled && (
                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                      حساب آجل مفعّل
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-slate-400 mt-1 flex gap-4">
                  <span className="font-mono">الكود: {customer.customerCode}</span>
                  <span>الهاتف: {customer.phone}</span>
                  {customer.companyName && <span>الجهة: {customer.companyName}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => setPaymentModalOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 gap-1.5 text-xs"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  تحصيل دفعة
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setStatementPrintOpen(true)}
                  className="gap-1.5 text-xs text-white border-slate-700 hover:bg-slate-800"
                >
                  <Printer className="w-3.5 h-3.5" />
                  كشف حساب
                </Button>
              </div>
            </div>

            {/* Quick Metrics Cards */}
            <div className="grid grid-cols-4 gap-3 mt-4 text-xs">
              <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700">
                <span className="text-slate-400 block">الرصيد الدفتري الحالي</span>
                <span className={`font-bold text-sm ${currentDebt > 0 ? 'text-amber-400' : currentDebt < 0 ? 'text-blue-400' : 'text-emerald-400'}`}>
                  {currentDebt > 0
                    ? `مستحق: ${formatCurrency(currentDebt)}`
                    : currentDebt < 0
                    ? `دائن: ${formatCurrency(Math.abs(currentDebt))}`
                    : 'مطابق (0 ج.م)'}
                </span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700">
                <span className="text-slate-400 block">سقف الائتمان المسموح</span>
                <span className="font-bold text-sm text-slate-200">
                  {customer.creditEnabled ? formatCurrency(creditLimit) : 'غير مفعل'}
                </span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700">
                <span className="text-slate-400 block">الائتمان المتاح حالياً</span>
                <span className="font-bold text-sm text-emerald-400">
                  {customer.creditEnabled ? formatCurrency(availableCredit) : '-'}
                </span>
              </div>
              <div className="bg-slate-800/80 p-2.5 rounded border border-slate-700">
                <span className="text-slate-400 block">ديون متأخرة السداد</span>
                <span className={`font-bold text-sm ${aging.overdueCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                  {aging.overdueCount > 0 ? formatCurrency(aging.days1to30 + aging.days31to60 + aging.days61to90 + aging.days90Plus) : 'لا يوجد'}
                </span>
              </div>
            </div>
          </div>

          {/* Body Tabs */}
          <div className="flex-1 overflow-y-auto p-6 pt-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid grid-cols-7 mb-4">
                <TabsTrigger value="overview" className="text-xs">نظرة عامة</TabsTrigger>
                <TabsTrigger value="receivables" className="text-xs">المستحقات ({receivables.filter(r => r.remainingAmount > 0).length})</TabsTrigger>
                <TabsTrigger value="statement" className="text-xs">كشف الحساب</TabsTrigger>
                <TabsTrigger value="sales" className="text-xs">الفواتير ({sales.length})</TabsTrigger>
                <TabsTrigger value="payments" className="text-xs">المدفوعات ({payments.length})</TabsTrigger>
                <TabsTrigger value="returns" className="text-xs">المرتجعات ({returns.length})</TabsTrigger>
                <TabsTrigger value="credit" className="text-xs">الائتمان</TabsTrigger>
              </TabsList>

              {/* 1. Overview Tab */}
              <TabsContent value="overview" className="space-y-4 text-xs">
                {/* Aging Breakdown */}
                <div className="border rounded-lg p-4 bg-white space-y-3">
                  <h4 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-primary" />
                    تحليل أعمار الديون والمستحقات (Receivables Aging)
                  </h4>
                  <div className="grid grid-cols-5 gap-2 text-center">
                    <div className="p-2 rounded bg-emerald-50 border border-emerald-100">
                      <div className="text-slate-500 text-[11px]">جارية (لم تستحق)</div>
                      <div className="font-bold text-emerald-700 mt-1">{formatCurrency(aging.current)}</div>
                    </div>
                    <div className="p-2 rounded bg-amber-50 border border-amber-100">
                      <div className="text-slate-500 text-[11px]">1 - 30 يوماً</div>
                      <div className="font-bold text-amber-700 mt-1">{formatCurrency(aging.days1to30)}</div>
                    </div>
                    <div className="p-2 rounded bg-orange-50 border border-orange-100">
                      <div className="text-slate-500 text-[11px]">31 - 60 يوماً</div>
                      <div className="font-bold text-orange-700 mt-1">{formatCurrency(aging.days31to60)}</div>
                    </div>
                    <div className="p-2 rounded bg-red-50 border border-red-100">
                      <div className="text-slate-500 text-[11px]">61 - 90 يوماً</div>
                      <div className="font-bold text-red-700 mt-1">{formatCurrency(aging.days61to90)}</div>
                    </div>
                    <div className="p-2 rounded bg-rose-50 border border-rose-100">
                      <div className="text-slate-500 text-[11px]">أكثر من 90 يوماً</div>
                      <div className="font-bold text-rose-800 mt-1">{formatCurrency(aging.days90Plus)}</div>
                    </div>
                  </div>
                </div>

                {/* Profile Details */}
                <div className="border rounded-lg p-4 bg-white grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-slate-500 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" />
                      الهاتف: <span className="font-mono text-slate-800">{customer.phone} {customer.phone2 ? `/ ${customer.phone2}` : ''}</span>
                    </div>
                    {customer.email && (
                      <div className="text-slate-500 flex items-center gap-1.5">
                        <Mail className="w-3.5 h-3.5" />
                        البريد: <span className="text-slate-800">{customer.email}</span>
                      </div>
                    )}
                    {customer.address && (
                      <div className="text-slate-500 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        العنوان: <span className="text-slate-800">{customer.address} {customer.city ? `- ${customer.city}` : ''}</span>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {customer.taxNumber && (
                      <div className="text-slate-500">
                        الرقم الضريبي: <span className="font-mono text-slate-800">{customer.taxNumber}</span>
                      </div>
                    )}
                    {customer.commercialRegistration && (
                      <div className="text-slate-500">
                        السجل التجاري: <span className="font-mono text-slate-800">{customer.commercialRegistration}</span>
                      </div>
                    )}
                    <div className="text-slate-500">
                      فترة السداد الممنوحة: <span className="font-semibold text-slate-800">{customer.paymentTermsDays || 30} يوماً</span>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* 2. Receivables Tab */}
              <TabsContent value="receivables" className="space-y-3 text-xs">
                {receivables.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">لا توجد فواتير آجلة مسجلة لهذا العميل</div>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                        <tr>
                          <th className="py-2.5 px-3 text-right">رقم الفاتورة</th>
                          <th className="py-2.5 px-3 text-right">تاريخ الإصدار</th>
                          <th className="py-2.5 px-3 text-right">تاريخ الاستحقاق</th>
                          <th className="py-2.5 px-3 text-left">أصل الفاتورة</th>
                          <th className="py-2.5 px-3 text-left">المسدد</th>
                          <th className="py-2.5 px-3 text-left">المتبقي</th>
                          <th className="py-2.5 px-3 text-center">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {receivables.map((rec) => (
                          <tr key={rec.id} className="hover:bg-muted/40 transition-colors">
                            <td className="py-2 px-3 font-mono font-semibold text-foreground">{rec.invoiceNumber}</td>
                            <td className="py-2 px-3 text-muted-foreground font-mono">{rec.issueDate}</td>
                            <td className="py-2 px-3 text-muted-foreground font-mono">{rec.dueDate}</td>
                            <td className="py-2 px-3 text-left text-foreground font-mono">{formatCurrency(rec.originalAmount)}</td>
                            <td className="py-2 px-3 text-left text-emerald-600 dark:text-emerald-400 font-mono">{formatCurrency(rec.paidAmount)}</td>
                            <td className="py-2 px-3 text-left font-bold text-amber-600 dark:text-amber-400 font-mono">{formatCurrency(rec.remainingAmount)}</td>
                            <td className="py-2 px-3 text-center">
                              {rec.status === 'paid' ? (
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">مسددة</Badge>
                              ) : rec.status === 'partially_paid' ? (
                                <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30">سداد جزئي</Badge>
                              ) : (
                                <Badge variant="outline" className="bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30">مفتوحة</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* 3. Statement Tab */}
              <TabsContent value="statement" className="space-y-3 text-xs">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-muted-foreground">سجل الحركات المالية المباشرة من دفتر الأستاذ:</span>
                  <Button size="sm" variant="outline" onClick={() => setStatementPrintOpen(true)} className="gap-1.5 h-8">
                    <Printer className="w-3.5 h-3.5" />
                    طباعة الكشف
                  </Button>
                </div>
                <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground max-h-96 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b border-border text-muted-foreground sticky top-0">
                      <tr>
                        <th className="py-2 px-3 text-right">التاريخ</th>
                        <th className="py-2 px-3 text-right">نوع الحركة</th>
                        <th className="py-2 px-3 text-right">المرجع</th>
                        <th className="py-2 px-3 text-left">مدين</th>
                        <th className="py-2 px-3 text-left">دائن</th>
                        <th className="py-2 px-3 text-left">الرصيد بعد الحركة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {ledgerEntries.map((e) => (
                        <tr key={e.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-2 px-3 text-muted-foreground font-mono">{e.createdAt.split('T')[0]}</td>
                          <td className="py-2 px-3 font-medium text-foreground">{e.type}</td>
                          <td className="py-2 px-3 font-mono text-muted-foreground">{e.referenceNumber || '-'}</td>
                          <td className="py-2 px-3 text-left text-amber-600 dark:text-amber-400 font-semibold font-mono">{e.debit > 0 ? formatCurrency(e.debit) : '-'}</td>
                          <td className="py-2 px-3 text-left text-emerald-600 dark:text-emerald-400 font-semibold font-mono">{e.credit > 0 ? formatCurrency(e.credit) : '-'}</td>
                          <td className="py-2 px-3 text-left font-bold font-mono text-foreground">{formatCurrency(e.balanceAfter)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* 4. Sales Tab */}
              <TabsContent value="sales" className="space-y-3 text-xs">
                <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                      <tr>
                        <th className="py-2 px-3 text-right">رقم الفاتورة</th>
                        <th className="py-2 px-3 text-right">التاريخ</th>
                        <th className="py-2 px-3 text-left">إجمالي الفاتورة</th>
                        <th className="py-2 px-3 text-left">المدفوع</th>
                        <th className="py-2 px-3 text-center">نوع البيع</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {sales.map((s) => (
                        <tr key={s.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-2 px-3 font-mono font-semibold text-foreground">{s.invoiceNumber}</td>
                          <td className="py-2 px-3 text-muted-foreground font-mono">{s.createdAt.split('T')[0]}</td>
                          <td className="py-2 px-3 text-left font-bold text-foreground font-mono">{formatCurrency(s.total)}</td>
                          <td className="py-2 px-3 text-left text-emerald-600 dark:text-emerald-400 font-mono">{formatCurrency(s.paidAmount)}</td>
                          <td className="py-2 px-3 text-center">
                            {s.isCreditSale ? <Badge variant="outline" className="text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30">آجل</Badge> : <Badge variant="outline">نقدي</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* 5. Payments Tab */}
              <TabsContent value="payments" className="space-y-3 text-xs">
                <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                      <tr>
                        <th className="py-2 px-3 text-right">رقم السند</th>
                        <th className="py-2 px-3 text-right">التاريخ</th>
                        <th className="py-2 px-3 text-right">الطريقة</th>
                        <th className="py-2 px-3 text-left">المبلغ المحصل</th>
                        <th className="py-2 px-3 text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {payments.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-2 px-3 font-mono font-semibold text-foreground">{p.paymentNumber}</td>
                          <td className="py-2 px-3 text-muted-foreground font-mono">{p.paymentDate}</td>
                          <td className="py-2 px-3 text-foreground">{p.paymentMethod}</td>
                          <td className="py-2 px-3 text-left font-bold text-emerald-600 dark:text-emerald-400 font-mono">{formatCurrency(p.amount)}</td>
                          <td className="py-2 px-3 text-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedPaymentForReceipt(p);
                                setReceiptPrintOpen(true);
                              }}
                              className="h-6 px-2 text-[11px] gap-1"
                            >
                              <Receipt className="w-3 h-3" />
                              إيصال
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* 6. Returns Tab */}
              <TabsContent value="returns" className="space-y-3 text-xs">
                <div className="border border-border rounded-lg overflow-hidden bg-card text-card-foreground">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 border-b border-border text-muted-foreground">
                      <tr>
                        <th className="py-2 px-3 text-right">رقم المرتجع</th>
                        <th className="py-2 px-3 text-right">الفاتورة الأصلية</th>
                        <th className="py-2 px-3 text-right">التاريخ</th>
                        <th className="py-2 px-3 text-left">قيمة المرتجع</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {returns.map((r) => (
                        <tr key={r.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-2 px-3 font-mono font-semibold text-foreground">{r.returnNumber}</td>
                          <td className="py-2 px-3 font-mono text-muted-foreground">{r.invoiceNumberSnapshot}</td>
                          <td className="py-2 px-3 text-muted-foreground font-mono">{r.createdAt.split('T')[0]}</td>
                          <td className="py-2 px-3 text-left font-bold text-amber-600 dark:text-amber-400 font-mono">{formatCurrency(r.refundAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* 7. Credit & Limits Tab */}
              <TabsContent value="credit" className="space-y-4 text-xs">
                <div className="border border-border rounded-lg p-4 bg-card text-card-foreground space-y-4">
                  <h4 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    إعدادات وسياسة الحساب الائتماني
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-muted/40 dark:bg-muted/20 rounded border border-border space-y-1">
                      <span className="text-muted-foreground block">حالة الائتمان الحالية:</span>
                      <span className="font-bold text-foreground capitalize">{customer.creditStatus}</span>
                    </div>
                    <div className="p-3 bg-muted/40 dark:bg-muted/20 rounded border border-border space-y-1">
                      <span className="text-muted-foreground block">سقف الائتمان:</span>
                      <span className="font-bold text-foreground">{formatCurrency(customer.creditLimit || 0)}</span>
                    </div>
                    <div className="p-3 bg-muted/40 dark:bg-muted/20 rounded border border-border space-y-1">
                      <span className="text-muted-foreground block">فترة السداد (أيام):</span>
                      <span className="font-bold text-foreground">{customer.paymentTermsDays || 30} يوماً</span>
                    </div>
                    <div className="p-3 bg-muted/40 dark:bg-muted/20 rounded border border-border space-y-1">
                      <span className="text-muted-foreground block">الائتمان المتاح حالياً:</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(availableCredit)}</span>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>

      {/* Modals & Print Dialogs */}
      <ReceivePaymentModal
        open={paymentModalOpen}
        onOpenChange={setPaymentModalOpen}
        customer={customer}
        onPaymentSuccess={onCustomerUpdated}
      />

      <CustomerStatementPrintDialog
        open={statementPrintOpen}
        onOpenChange={setStatementPrintOpen}
        customer={customer}
        entries={ledgerEntries}
        closingBalance={currentDebt}
      />

      <CustomerPaymentReceiptDialog
        open={receiptPrintOpen}
        onOpenChange={setReceiptPrintOpen}
        payment={selectedPaymentForReceipt}
      />
    </>
  );
};
