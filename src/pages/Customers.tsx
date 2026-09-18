import React, { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout';
import { useFormatters } from '@/lib/formatters';
import { useUserPermissions } from '@/hooks/usePermissions';
import { useCustomers } from '@/hooks/retail/useCustomers';
import { usePriceLists } from '@/hooks/retail/usePriceLists';
import type { Customer, CustomerType } from '@/types/retail.types';

import {
  Users,
  Plus,
  Search,
  Wallet,
  AlertCircle,
  Building2,
  GraduationCap,
  Briefcase,
  Store,
  DollarSign,
  TrendingDown,
  TrendingUp,
  CreditCard,
  FileSpreadsheet,
  Receipt,
  Eye,
  Edit,
  Archive,
  RefreshCw,
  MoreVertical,
  CheckCircle2,
  Clock,
  Ban,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { CustomerModal } from '@/components/retail/customers/CustomerModal';
import { CustomerProfileDrawer } from '@/components/retail/customers/CustomerProfileDrawer';
import { ReceivePaymentModal } from '@/components/retail/customers/ReceivePaymentModal';
import { PriceListModal } from '@/components/retail/pricing/PriceListModal';

const CUSTOMER_TYPE_LABELS: Record<CustomerType, { label: string; icon: React.FC<{ className?: string }> }> = {
  retail: { label: 'تجزئة (أفراد)', icon: Store },
  wholesale: { label: 'جملة ومكتبات', icon: Store },
  school: { label: 'مدرسة / معهد', icon: GraduationCap },
  company: { label: 'شركة ومؤسسة', icon: Building2 },
  teacher: { label: 'معلم / أكاديمي', icon: GraduationCap },
  corporate: { label: 'جهة ومؤسسة', icon: Briefcase },
  government: { label: 'جهة حكومية', icon: Building2 },
  other: { label: 'أخرى', icon: Users },
};

export default function Customers() {
  const { number } = useFormatters();
  const { hasPermission } = useUserPermissions();

  const { customers, loading, fetchCustomers, addCustomer, editCustomer, removeCustomer } = useCustomers();
  const { priceLists } = usePriceLists();

  // Search and Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [debtFilter, setDebtFilter] = useState<'all' | 'has_debt' | 'credit_enabled' | 'overdue'>('all');

  // Modals and Drawers
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  const [selectedCustomerForDrawer, setSelectedCustomerForDrawer] = useState<Customer | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const [isPriceListModalOpen, setIsPriceListModalOpen] = useState(false);

  // Permissions
  const canCreateCustomer = hasPermission('customers.create') || hasPermission('customers.manage');
  const canEditCustomer = hasPermission('customers.edit') || hasPermission('customers.manage');
  const canReceivePayment = hasPermission('customers.payment.create') || hasPermission('customers.manage');
  const canManagePriceLists = hasPermission('price_lists.manage') || hasPermission('customers.manage');

  // Filtered Customers
  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      // Search matching
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        c.name.toLowerCase().includes(query) ||
        (c.code && c.code.toLowerCase().includes(query)) ||
        (c.phone && c.phone.includes(query)) ||
        (c.email && c.email.toLowerCase().includes(query)) ||
        (c.taxNumber && c.taxNumber.includes(query));

      // Type matching
      const matchesType = selectedType === 'all' || c.customerType === selectedType;

      // Balance/Credit matching
      let matchesDebt = true;
      if (debtFilter === 'has_debt') {
        matchesDebt = (c.currentBalance || 0) > 0;
      } else if (debtFilter === 'credit_enabled') {
        matchesDebt = !!c.creditEnabled;
      } else if (debtFilter === 'overdue') {
        matchesDebt = (c.overdueBalance || 0) > 0 || c.creditStatus === 'blocked';
      }

      return matchesSearch && matchesType && matchesDebt;
    });
  }, [customers, searchQuery, selectedType, debtFilter]);

  // KPI Calculations
  const kpis = useMemo(() => {
    let totalReceivables = 0;
    let totalAdvances = 0;
    let totalOverdue = 0;
    let creditCustomersCount = 0;

    customers.forEach((c) => {
      const bal = c.currentBalance || 0;
      if (bal > 0) {
        totalReceivables += bal;
      } else if (bal < 0) {
        totalAdvances += Math.abs(bal);
      }
      if ((c.overdueBalance || 0) > 0) {
        totalOverdue += c.overdueBalance || 0;
      }
      if (c.creditEnabled) {
        creditCustomersCount++;
      }
    });

    return {
      totalCount: customers.length,
      totalReceivables,
      totalAdvances,
      totalOverdue,
      creditCustomersCount,
    };
  }, [customers]);

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setIsCustomerModalOpen(true);
  };

  const handleOpenEdit = (c: Customer) => {
    setEditingCustomer(c);
    setIsCustomerModalOpen(true);
  };

  const handleOpenDrawer = (c: Customer) => {
    setSelectedCustomerForDrawer(c);
    setIsDrawerOpen(true);
  };

  const handleOpenPayment = (c: Customer) => {
    setPaymentCustomer(c);
    setIsPaymentModalOpen(true);
  };

  return (
    <MainLayout>
      <div className="space-y-6 pb-12" dir="rtl">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2.5">
              <Users className="w-7 h-7 text-primary" />
              <span>إدارة حسابات العملاء والبيع الآجل</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              إدارة عملاء التجزئة والجملة، أسعار المدارس والشركات، السقوف الائتمانية وسندات القبض
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canManagePriceLists && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 font-bold"
                onClick={() => setIsPriceListModalOpen(true)}
              >
                <FileSpreadsheet className="w-4 h-4 text-primary" />
                <span>قوائم الأسعار</span>
              </Button>
            )}

            {canReceivePayment && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 font-bold border-emerald-600 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                onClick={() => {
                  setPaymentCustomer(null);
                  setIsPaymentModalOpen(true);
                }}
              >
                <Receipt className="w-4 h-4 text-emerald-600" />
                <span>قبض دفعة من عميل</span>
              </Button>
            )}

            {canCreateCustomer && (
              <Button size="sm" className="gap-1.5 font-bold" onClick={handleOpenAdd}>
                <Plus className="w-4 h-4" />
                <span>إضافة عميل جديد</span>
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => fetchCustomers()}
              title="تحديث البيانات"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Customers */}
          <Card className="shadow-sm border-border/80">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">إجمالي العملاء</p>
                <h3 className="text-2xl font-black mt-1">{number(kpis.totalCount)}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  منهم {number(kpis.creditCustomersCount)} مفعل لهم بيع آجل
                </p>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <Users className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          {/* Total Receivables */}
          <Card className="shadow-sm border-border/80 border-l-4 border-l-amber-500">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">إجمالي المستحقات (ديون العملاء)</p>
                <h3 className="text-2xl font-black mt-1 text-amber-600 dark:text-amber-400">
                  {number(kpis.totalReceivables)} ج.م
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">أرصدة فواتير ومبيعات آجلة مستحقة</p>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600">
                <TrendingUp className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          {/* Overdue Receivables */}
          <Card className="shadow-sm border-border/80 border-l-4 border-l-destructive">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">ديون متأخرة السداد</p>
                <h3 className="text-2xl font-black mt-1 text-destructive">
                  {number(kpis.totalOverdue)} ج.م
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">تجاوزت فترة الائتمان المقررة</p>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive">
                <AlertCircle className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>

          {/* Total Advances */}
          <Card className="shadow-sm border-border/80 border-l-4 border-l-emerald-500">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">أرصدة دائنة / دفعات مقدمة</p>
                <h3 className="text-2xl font-black mt-1 text-emerald-600 dark:text-emerald-400">
                  {number(kpis.totalAdvances)} ج.م
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">مبالغ مسددة مسبقاً لصالح العملاء</p>
              </div>
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                <Wallet className="w-6 h-6" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter and Search Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-muted/40 p-3 rounded-2xl border border-border">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-3 top-3 text-muted-foreground" />
            <Input
              placeholder="ابحث بالاسم، الهاتف، الكود، أو الرقم الضريبي..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9 h-10 bg-background"
            />
          </div>

          {/* Customer Type Filter */}
          <div className="w-full md:w-52">
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="h-10 bg-background">
                <SelectValue placeholder="نوع العميل" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all">كل أنواع العملاء</SelectItem>
                <SelectItem value="retail">تجزئة (أفراد)</SelectItem>
                <SelectItem value="wholesale">جملة ومكتبات</SelectItem>
                <SelectItem value="school">مدارس ومعاهد</SelectItem>
                <SelectItem value="company">شركات ومؤسسات</SelectItem>
                <SelectItem value="teacher">معلمون وأكاديميون</SelectItem>
                <SelectItem value="corporate">جهات ومؤسسات</SelectItem>
                <SelectItem value="government">جهات حكومية</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Debt & Credit Filter */}
          <div className="w-full md:w-52">
            <Select value={debtFilter} onValueChange={(val: any) => setDebtFilter(val)}>
              <SelectTrigger className="h-10 bg-background">
                <SelectValue placeholder="حالة المديونية" />
              </SelectTrigger>
              <SelectContent dir="rtl">
                <SelectItem value="all">الكل (مدين / دائن / خالص)</SelectItem>
                <SelectItem value="has_debt">عملاء عليهم مديونية فقط</SelectItem>
                <SelectItem value="credit_enabled">البيع الآجل مفعّل</SelectItem>
                <SelectItem value="overdue">متأخرون عن السداد أو محظورون</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Customers Table */}
        <Card className="shadow-sm border-border/80">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28 text-right">الكود</TableHead>
                  <TableHead className="text-right">العميل والتصنيف</TableHead>
                  <TableHead className="text-right">بيانات التواصل</TableHead>
                  <TableHead className="text-right">قائمة الأسعار</TableHead>
                  <TableHead className="text-right">سقف الائتمان</TableHead>
                  <TableHead className="text-right">الرصيد الحالي</TableHead>
                  <TableHead className="w-28 text-center">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <Users className="w-12 h-12 mx-auto opacity-20 mb-2" />
                      <p className="font-semibold text-sm">لا يوجد عملاء مطابقين لمعايير البحث</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((c) => {
                    const balance = c.currentBalance || 0;
                    const TypeIcon = CUSTOMER_TYPE_LABELS[c.customerType]?.icon || Users;
                    const assignedPriceList = priceLists.find((pl) => pl.id === c.priceListId);

                    return (
                      <TableRow
                        key={c.id}
                        className="hover:bg-muted/40 transition-colors cursor-pointer"
                        onClick={() => handleOpenDrawer(c)}
                      >
                        {/* Code */}
                        <TableCell className="font-mono text-xs font-bold text-muted-foreground">
                          {c.code || '—'}
                        </TableCell>

                        {/* Name & Type */}
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                              {c.name}
                              {!c.isActive && (
                                <Badge variant="destructive" className="text-[10px] h-4 px-1">
                                  مؤرشف
                                </Badge>
                              )}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1 font-normal">
                                <TypeIcon className="w-3 h-3" />
                                <span>{CUSTOMER_TYPE_LABELS[c.customerType]?.label || c.customerType}</span>
                              </Badge>
                              {c.creditStatus === 'blocked' && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 font-normal">
                                  محظور ائتمانياً
                                </Badge>
                              )}
                              {c.creditStatus === 'on_hold' && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500 text-amber-600 font-normal">
                                  معلق مؤقتاً
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* Contacts */}
                        <TableCell>
                          <div className="flex flex-col text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{c.phone || '—'}</span>
                            {c.email && <span className="truncate max-w-[150px]">{c.email}</span>}
                          </div>
                        </TableCell>

                        {/* Price List */}
                        <TableCell>
                          {assignedPriceList ? (
                            <Badge variant="outline" className="text-xs bg-primary/5 text-primary border-primary/20">
                              {assignedPriceList.name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">السعر القياسي</span>
                          )}
                        </TableCell>

                        {/* Credit Limit */}
                        <TableCell>
                          {c.creditEnabled ? (
                            <div className="text-xs">
                              <span className="font-bold">{number(c.creditLimit || 0)} ج.م</span>
                              <span className="block text-[10px] text-muted-foreground">
                                {c.paymentTermsDays || 0} يوم سداد
                              </span>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              نقدي فقط
                            </Badge>
                          )}
                        </TableCell>

                        {/* Current Balance */}
                        <TableCell>
                          {balance > 0 ? (
                            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 font-black text-xs">
                              <TrendingUp className="w-3.5 h-3.5" />
                              <span>عليه: {number(balance)} ج.م</span>
                            </div>
                          ) : balance < 0 ? (
                            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black text-xs">
                              <TrendingDown className="w-3.5 h-3.5" />
                              <span>له (مقدم): {number(Math.abs(balance))} ج.م</span>
                            </div>
                          ) : (
                            <span className="text-xs font-semibold text-muted-foreground px-2 py-0.5 rounded bg-muted">
                              0.00 ج.م
                            </span>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            {canReceivePayment && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                                onClick={() => handleOpenPayment(c)}
                                title="قبض دفعة"
                              >
                                <Receipt className="w-4 h-4" />
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-primary hover:bg-primary/10"
                              onClick={() => handleOpenDrawer(c)}
                              title="كشف الحساب والملف"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" dir="rtl">
                                {canEditCustomer && (
                                  <DropdownMenuItem onClick={() => handleOpenEdit(c)} className="gap-2">
                                    <Edit className="w-4 h-4" />
                                    <span>تعديل البيانات</span>
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => handleOpenDrawer(c)} className="gap-2">
                                  <Eye className="w-4 h-4" />
                                  <span>كشف الحساب والعمليات</span>
                                </DropdownMenuItem>
                                {canReceivePayment && (
                                  <DropdownMenuItem onClick={() => handleOpenPayment(c)} className="gap-2 text-emerald-600">
                                    <Receipt className="w-4 h-4" />
                                    <span>قبض دفعة مالية</span>
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Customer Modal (Create / Edit) */}
        <CustomerModal
          open={isCustomerModalOpen}
          onOpenChange={setIsCustomerModalOpen}
          customer={editingCustomer}
          onSuccess={() => fetchCustomers()}
        />

        {/* Customer Profile Drawer (8 Tabs) */}
        <CustomerProfileDrawer
          open={isDrawerOpen}
          onOpenChange={setIsDrawerOpen}
          customer={selectedCustomerForDrawer}
          onCustomerUpdated={() => fetchCustomers()}
          onReceivePayment={(c) => {
            setIsDrawerOpen(false);
            handleOpenPayment(c);
          }}
        />

        {/* Receive Payment Modal */}
        <ReceivePaymentModal
          open={isPaymentModalOpen}
          onOpenChange={setIsPaymentModalOpen}
          customer={paymentCustomer}
          onPaymentSuccess={() => {
            fetchCustomers();
            if (selectedCustomerForDrawer) {
              // Refresh customer drawer if open
              const updated = customers.find((c) => c.id === selectedCustomerForDrawer.id);
              if (updated) setSelectedCustomerForDrawer(updated);
            }
          }}
        />

        {/* Price Lists Modal */}
        <PriceListModal
          open={isPriceListModalOpen}
          onOpenChange={setIsPriceListModalOpen}
        />
      </div>
    </MainLayout>
  );
}
