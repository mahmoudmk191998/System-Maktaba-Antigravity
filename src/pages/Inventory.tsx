/**
 * Retail Inventory & Stock Movements Subsystem
 * Bookstore & Stationery Retail Hub
 */

import React, { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout';
import { useInventory } from '@/hooks/retail/useInventory';
import { useStockMovements } from '@/hooks/retail/useStockMovements';
import { useTransfers } from '@/hooks/retail/useTransfers';
import { useInventoryCounts } from '@/hooks/retail/useInventoryCounts';
import { useDamageLoss } from '@/hooks/retail/useDamageLoss';
import { useProducts } from '@/hooks/retail/useProducts';
import { useCategories } from '@/hooks/retail/useCategories';
import {
  Package,
  AlertTriangle,
  TrendingDown,
  Search,
  Plus,
  Truck,
  Layers,
  Scale,
  Barcode,
  History,
  AlertOctagon,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StockAdjustmentDialog } from '@/components/retail/StockAdjustmentDialog';
import { OpeningBalanceDialog } from '@/components/retail/OpeningBalanceDialog';
import { TransferManageDialog } from '@/components/retail/TransferManageDialog';
import { InventoryCountModal } from '@/components/retail/InventoryCountModal';
import { DamageLossModal } from '@/components/retail/DamageLossModal';
import { StockMovementsDrawer } from '@/components/retail/StockMovementsDrawer';
import type { StockBalance, StockMovement, BranchTransfer } from '@/types/retail.types';
import { toast } from 'sonner';

export default function Inventory() {
  const {
    balances,
    locations,
    selectedLocationId,
    setSelectedLocationId,
    loading: loadingBalances,
    metrics,
    refresh: refreshBalances,
    addOpeningBalance,
    adjustStock,
  } = useInventory();

  const { products } = useProducts({ pageSize: 500 });
  const { categories } = useCategories();

  const { movements, loading: loadingMovements, refresh: refreshMovements } = useStockMovements(selectedLocationId);
  const {
    transfers,
    loading: loadingTransfers,
    refresh: refreshTransfers,
    createTransfer,
    approveTransfer,
    dispatchTransfer,
    receiveTransfer,
    cancelTransfer,
  } = useTransfers(selectedLocationId);

  const {
    sessions,
    activeSession,
    setActiveSession,
    refresh: refreshCounts,
    startSession,
    scanBarcode,
    updateItemQty,
    postSession,
  } = useInventoryCounts(selectedLocationId);

  const {
    records: damageRecords,
    loading: loadingDamage,
    refresh: refreshDamage,
    recordDamage,
    recordRecovery,
    deleteDamage,
  } = useDamageLoss(selectedLocationId);

  // Active Tab & Filters
  const [activeTab, setActiveTab] = useState<'balances' | 'movements' | 'transfers' | 'counts' | 'damage'>('balances');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [filterOutOfStock, setFilterOutOfStock] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');

  // Dialog states
  const [adjustmentTarget, setAdjustmentTarget] = useState<StockBalance | null>(null);
  const [isAdjustmentOpen, setIsAdjustmentOpen] = useState(false);
  const [isOpeningBalanceOpen, setIsOpeningBalanceOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isDamageOpen, setIsDamageOpen] = useState(false);
  const [isCountModalOpen, setIsCountModalOpen] = useState(false);
  const [isMovementsDrawerOpen, setIsMovementsDrawerOpen] = useState(false);

  const selectedLocObj = locations.find((l) => l.id === selectedLocationId);

  // Synthesized Balances: Union of recorded branch_stock + catalog products with zero initial stock
  const allStockRows = useMemo(() => {
    const rows: StockBalance[] = [...balances];
    const existingProductIds = new Set(balances.map((b) => b.productId));

    for (const prod of products) {
      if (!existingProductIds.has(prod.id)) {
        rows.push({
          id: `synth_${selectedLocationId || 'loc'}_${prod.id}`,
          tenantId: prod.tenantId || '',
          branchId: selectedLocationId || '',
          locationId: selectedLocationId || '',
          productId: prod.id,
          variantId: null,
          quantity: 0,
          onHandQuantity: 0,
          reservedQuantity: 0,
          availableQuantity: 0,
          unitCost: prod.averageCost || prod.purchasePrice || 0,
          averageCost: prod.averageCost || prod.purchasePrice || 0,
          reorderPoint: prod.reorderPoint || 5,
          minStockLevel: prod.minimumStock || 0,
          updatedAt: prod.createdAt || new Date().toISOString(),
        } as StockBalance);
      }
    }
    return rows;
  }, [balances, products, selectedLocationId]);

  // Filtered Balances
  const filteredBalances = useMemo(() => {
    return allStockRows.filter((b) => {
      const prod = products.find((p) => p.id === b.productId);
      const name = prod?.name || '';
      const sku = prod?.sku || '';
      const barcode = prod?.barcode || '';
      const term = searchTerm.toLowerCase();

      const matchSearch =
        name.toLowerCase().includes(term) ||
        sku.toLowerCase().includes(term) ||
        barcode.toLowerCase().includes(term);

      if (!matchSearch) return false;

      if (selectedCategory && prod?.categoryId !== selectedCategory) {
        return false;
      }

      const onHand = b.onHandQuantity ?? b.quantity ?? 0;
      const reorder = b.reorderPoint || 5;

      if (filterLowStock && (onHand <= 0 || onHand > reorder)) {
        return false;
      }
      if (filterOutOfStock && onHand > 0) {
        return false;
      }

      return true;
    });
  }, [allStockRows, products, searchTerm, selectedCategory, filterLowStock, filterOutOfStock]);

  const handleOpenAdjustment = (balance: StockBalance) => {
    setAdjustmentTarget(balance);
    setIsAdjustmentOpen(true);
  };

  const handleStartCount = async () => {
    if (!selectedLocationId) {
      toast.error('يرجى اختيار الفرع أو المخزن أولاً');
      return;
    }
    const res = await startSession(selectedLocationId, 'جلسة جرد فعلي دورية');
    if (res.success && res.session) {
      toast.success('تم بدء جلسة الجرد بنجاح');
      setIsCountModalOpen(true);
    } else {
      toast.error(res.error || 'فشل في بدء الجلسة');
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 pb-12" dir="rtl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-5 rounded-2xl border shadow-sm">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <Package className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-foreground">إدارة المخزون والمناقلات والجرد</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  دفتر الحركات الذري، أرصدة الفروع والمخزن الرئيسي، التكلفة المرجحة (WAC)، والهالك
                </p>
              </div>
            </div>
          </div>

          {/* Location Selector & Global Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-muted/60 p-1.5 rounded-xl border">
              <span className="text-xs font-bold text-muted-foreground px-1">الموقع:</span>
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="bg-background text-foreground text-xs font-bold rounded-lg px-2.5 py-1.5 border border-border focus:ring-1 focus:ring-primary"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} {loc.isCentralWarehouse ? '(مركزي)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsOpeningBalanceOpen(true)}
              className="gap-1.5 text-xs font-bold"
            >
              <Layers className="w-3.5 h-3.5" />
              رصيد افتتاحي
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsTransferOpen(true)}
              className="gap-1.5 text-xs font-bold"
            >
              <Truck className="w-3.5 h-3.5" />
              مناقلة جديدة
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsDamageOpen(true)}
              className="gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/20"
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              تسجيل هالك
            </Button>

            <Button
              size="sm"
              onClick={handleStartCount}
              className="gap-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700"
            >
              <Barcode className="w-3.5 h-3.5" />
              بدء جرد فعلي
            </Button>
          </div>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="shadow-sm border-border/60">
            <CardHeader className="pb-1 pt-3.5 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">أصناف بالمخزن</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3.5">
              <div className="text-2xl font-black text-foreground">{metrics.totalItems}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                إجمالي القطع: <span className="font-bold">{metrics.totalOnHand.toLocaleString()}</span>
              </p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-border/60">
            <CardHeader className="pb-1 pt-3.5 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground">تقييم المخزون بالتكلفة</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3.5">
              <div className="text-2xl font-black text-primary font-mono">
                {metrics.totalValue.toLocaleString()} ج.م
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">محسوب بمتوسط التكلفة المرجح (WAC)</p>
            </CardContent>
          </Card>

          <Card
            className={`shadow-sm border-border/60 cursor-pointer transition-colors ${
              filterLowStock ? 'ring-2 ring-amber-500 bg-amber-50/20' : ''
            }`}
            onClick={() => {
              setFilterLowStock(!filterLowStock);
              setFilterOutOfStock(false);
            }}
          >
            <CardHeader className="pb-1 pt-3.5 px-4">
              <CardTitle className="text-xs font-medium text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                أصناف قاربت النفاد
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3.5">
              <div className="text-2xl font-black text-amber-600">{metrics.lowStockCount}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">أقل من نقطة إعادة الطلب</p>
            </CardContent>
          </Card>

          <Card
            className={`shadow-sm border-border/60 cursor-pointer transition-colors ${
              filterOutOfStock ? 'ring-2 ring-rose-500 bg-rose-50/20' : ''
            }`}
            onClick={() => {
              setFilterOutOfStock(!filterOutOfStock);
              setFilterLowStock(false);
            }}
          >
            <CardHeader className="pb-1 pt-3.5 px-4">
              <CardTitle className="text-xs font-medium text-rose-600 flex items-center gap-1">
                <TrendingDown className="w-3.5 h-3.5" />
                أصناف نفدت تماماً
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3.5">
              <div className="text-2xl font-black text-rose-600">{metrics.outOfStockCount}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">الرصيد المتاح = 0</p>
            </CardContent>
          </Card>
        </div>

        {/* Navigation Tabs */}
        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <TabsList className="bg-muted/60 p-1">
              <TabsTrigger value="balances" className="gap-1.5 text-xs font-bold">
                <Package className="w-3.5 h-3.5" />
                الأرصدة الحالية ({filteredBalances.length})
              </TabsTrigger>
              <TabsTrigger value="movements" className="gap-1.5 text-xs font-bold">
                <History className="w-3.5 h-3.5" />
                دفتر الحركات (Ledger)
              </TabsTrigger>
              <TabsTrigger value="transfers" className="gap-1.5 text-xs font-bold">
                <Truck className="w-3.5 h-3.5" />
                المناقلات والشحن ({transfers.length})
              </TabsTrigger>
              <TabsTrigger value="counts" className="gap-1.5 text-xs font-bold">
                <Barcode className="w-3.5 h-3.5" />
                جلسات الجرد ({sessions.length})
              </TabsTrigger>
              <TabsTrigger value="damage" className="gap-1.5 text-xs font-bold">
                <AlertOctagon className="w-3.5 h-3.5" />
                التوالف والهالك ({damageRecords.length})
              </TabsTrigger>
            </TabsList>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                refreshBalances();
                refreshMovements();
                refreshTransfers();
                refreshCounts();
                refreshDamage();
                toast.success('تم تحديث البيانات');
              }}
              className="gap-1 text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              تحديث
            </Button>
          </div>

          {/* TAB 1: Stock Balances */}
          <TabsContent value="balances" className="space-y-4 mt-0">
            {/* Search & Category Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="ابحث بالاسم، رمز الصنف (SKU)، أو الباركود..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pr-9 text-xs"
                />
              </div>

              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-xs"
              >
                <option value="">جميع التصنيفات</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {(filterLowStock || filterOutOfStock) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setFilterLowStock(false);
                    setFilterOutOfStock(false);
                  }}
                  className="text-xs text-rose-600"
                >
                  إلغاء الفلترة
                </Button>
              )}
            </div>

            {/* Balances View: Responsive Table for Desktop & Cards for Mobile */}
            <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-xs text-right">
                  <thead className="bg-muted/60 text-muted-foreground">
                    <tr>
                      <th className="p-3">الصنف والكتاب</th>
                      <th className="p-3">الرمز والباركود</th>
                      <th className="p-3 text-center">الرصيد الفعلي</th>
                      <th className="p-3 text-center">المحجوز</th>
                      <th className="p-3 text-center">المتاح للبيع</th>
                      <th className="p-3 text-center">متوسط التكلفة (WAC)</th>
                      <th className="p-3 text-center">قيمة المخزون</th>
                      <th className="p-3 text-center">الحالة</th>
                      <th className="p-3 text-center">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {loadingBalances ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-muted-foreground">
                          جاري تحميل أرصدة المخزون...
                        </td>
                      </tr>
                    ) : filteredBalances.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-8 text-center text-muted-foreground">
                          لا توجد أرصدة تطابق شروط البحث في هذا الموقع
                        </td>
                      </tr>
                    ) : (
                      filteredBalances.map((b) => {
                        const prod = products.find((p) => p.id === b.productId);
                        const onHand = b.onHandQuantity ?? b.quantity ?? 0;
                        const reserved = b.reservedQuantity ?? 0;
                        const available = b.availableQuantity ?? onHand - reserved;
                        const cost = b.averageCost ?? b.unitCost ?? 0;
                        const totalVal = Math.round(onHand * cost * 100) / 100;
                        const reorder = b.reorderPoint || 5;

                        return (
                          <tr key={b.id} className="hover:bg-muted/20">
                            <td className="p-3">
                              <p className="font-bold text-foreground">{prod?.name || b.productId}</p>
                              <p className="text-[11px] text-muted-foreground">{prod?.nameEn}</p>
                            </td>
                            <td className="p-3 font-mono">
                              <p className="font-bold">{prod?.sku || '-'}</p>
                              <p className="text-[11px] text-muted-foreground">{prod?.barcode || '-'}</p>
                            </td>
                            <td className="p-3 text-center font-bold text-foreground">{onHand}</td>
                            <td className="p-3 text-center font-bold text-amber-600">{reserved}</td>
                            <td className="p-3 text-center font-black text-sm text-primary">{available}</td>
                            <td className="p-3 text-center font-mono">{cost.toFixed(2)} ج.م</td>
                            <td className="p-3 text-center font-mono font-bold">{totalVal.toLocaleString()} ج.م</td>
                            <td className="p-3 text-center">
                              {available <= 0 ? (
                                <Badge variant="destructive" className="text-[10px]">
                                  نفد المخزون
                                </Badge>
                              ) : available <= reorder ? (
                                <Badge className="text-[10px] bg-amber-500 hover:bg-amber-600">
                                  قارب النفاد
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px]">
                                  متوفر
                                </Badge>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenAdjustment(b)}
                                className="h-7 px-2.5 text-xs font-bold gap-1"
                              >
                                <Scale className="w-3 h-3" />
                                تسوية
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards View */}
              <div className="md:hidden divide-y">
                {loadingBalances ? (
                  <div className="p-6 text-center text-muted-foreground">جاري تحميل الأرصدة...</div>
                ) : filteredBalances.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">لا توجد أصناف مطابقة</div>
                ) : (
                  filteredBalances.map((b) => {
                    const prod = products.find((p) => p.id === b.productId);
                    const onHand = b.onHandQuantity ?? b.quantity ?? 0;
                    const available = b.availableQuantity ?? onHand;
                    const cost = b.averageCost ?? b.unitCost ?? 0;

                    return (
                      <div key={b.id} className="p-3.5 space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-bold text-sm text-foreground">{prod?.name || b.productId}</p>
                            <p className="text-xs font-mono text-muted-foreground">{prod?.sku}</p>
                          </div>
                          <Badge variant={available <= 0 ? 'destructive' : 'secondary'} className="text-[10px]">
                            {available <= 0 ? 'نفد' : 'متوفر'}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-3 gap-2 bg-muted/30 p-2 rounded-lg text-center text-xs">
                          <div>
                            <span className="text-muted-foreground text-[10px] block">المتاح للبيع</span>
                            <span className="font-black text-primary text-base">{available}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-[10px] block">متوسط التكلفة</span>
                            <span className="font-mono font-bold text-foreground text-xs">{cost.toFixed(2)} ج.م</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground text-[10px] block">القيمة الإجمالية</span>
                            <span className="font-mono font-bold text-xs">
                              {(onHand * cost).toLocaleString()} ج.م
                            </span>
                          </div>
                        </div>

                        <div className="flex justify-end pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenAdjustment(b)}
                            className="h-8 text-xs font-bold gap-1 w-full"
                          >
                            <Scale className="w-3.5 h-3.5" />
                            إجراء تسوية مخزنية
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </TabsContent>

          {/* TAB 2: Movements Ledger */}
          <TabsContent value="movements" className="space-y-4 mt-0">
            <div className="border rounded-xl bg-card overflow-x-auto shadow-sm">
              <table className="w-full text-xs text-right">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="p-3">الوقت والتاريخ</th>
                    <th className="p-3">نوع الحركة</th>
                    <th className="p-3 text-center">الكمية</th>
                    <th className="p-3 text-center">الرصيد السابق</th>
                    <th className="p-3 text-center">الرصيد بعد الحركة</th>
                    <th className="p-3 text-center">التكلفة</th>
                    <th className="p-3">البيان والتفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loadingMovements ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        جاري تحميل الحركات...
                      </td>
                    </tr>
                  ) : movements.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        لا توجد حركات مسجلة في هذا الموقع
                      </td>
                    </tr>
                  ) : (
                    movements.map((m) => {
                      const isOut = m.quantity < 0 || m.direction === 'out';
                      return (
                        <tr key={m.id} className="hover:bg-muted/20">
                          <td className="p-3 font-mono text-muted-foreground whitespace-nowrap">
                            {new Date(m.createdAt).toLocaleString('ar-EG', {
                              month: 'numeric',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="p-3">
                            <Badge
                              variant="outline"
                              className={
                                isOut
                                  ? 'border-rose-300 text-rose-700 bg-rose-50/50'
                                  : 'border-emerald-300 text-emerald-700 bg-emerald-50/50'
                              }
                            >
                              {m.movementType}
                            </Badge>
                          </td>
                          <td className="p-3 text-center font-bold">
                            <span className={isOut ? 'text-rose-600' : 'text-emerald-600'}>
                              {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                            </span>
                          </td>
                          <td className="p-3 text-center text-muted-foreground">{m.beforeQuantity}</td>
                          <td className="p-3 text-center font-bold text-foreground">{m.afterQuantity}</td>
                          <td className="p-3 text-center font-mono">{(m.unitCost || 0).toFixed(2)} ج.م</td>
                          <td className="p-3 text-muted-foreground max-w-xs truncate" title={m.reason || m.notes}>
                            {m.reason || m.notes || '-'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* TAB 3: Transfers */}
          <TabsContent value="transfers" className="space-y-4 mt-0">
            <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
              <table className="w-full text-xs text-right">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="p-3">رقم المناقلة</th>
                    <th className="p-3">من موقع</th>
                    <th className="p-3">إلى موقع</th>
                    <th className="p-3 text-center">عدد الأصناف</th>
                    <th className="p-3 text-center">الحالة</th>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loadingTransfers ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        جاري تحميل المناقلات...
                      </td>
                    </tr>
                  ) : transfers.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        لا توجد مناقلات مسجلة
                      </td>
                    </tr>
                  ) : (
                    transfers.map((t) => {
                      const fromName =
                        locations.find((l) => l.id === (t.fromLocationId || t.fromBranchId))?.name || 'موقع مصدر';
                      const toName =
                        locations.find((l) => l.id === (t.toLocationId || t.toBranchId))?.name || 'موقع مستلم';

                      return (
                        <tr key={t.id} className="hover:bg-muted/20">
                          <td className="p-3 font-mono font-bold text-foreground">{t.transferNumber}</td>
                          <td className="p-3 font-medium">{fromName}</td>
                          <td className="p-3 font-medium">{toName}</td>
                          <td className="p-3 text-center font-bold">{t.items.length} صنف</td>
                          <td className="p-3 text-center">
                            <Badge
                              variant={
                                t.status === 'received'
                                  ? 'default'
                                  : t.status === 'in_transit'
                                  ? 'secondary'
                                  : 'outline'
                              }
                              className={
                                t.status === 'in_transit'
                                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                                  : ''
                              }
                            >
                              {t.status === 'draft'
                                ? 'مسودة'
                                : t.status === 'requested'
                                ? 'قيد الاعتماد'
                                : t.status === 'approved'
                                ? 'معتمدة للشحن'
                                : t.status === 'in_transit'
                                ? 'في الطريق (In-Transit)'
                                : t.status === 'received'
                                ? 'تم الاستلام'
                                : 'ملغاة'}
                            </Badge>
                          </td>
                          <td className="p-3 text-muted-foreground font-mono">
                            {new Date(t.createdAt).toLocaleDateString('ar-EG')}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {t.status === 'requested' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs font-bold"
                                  onClick={async () => {
                                    const res = await approveTransfer(t.id);
                                    if (res.success) toast.success('تم اعتماد المناقلة للشحن');
                                    else toast.error(res.error);
                                  }}
                                >
                                  اعتماد
                                </Button>
                              )}

                              {(t.status === 'approved' || t.status === 'draft') && (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs font-bold bg-indigo-600 hover:bg-indigo-700"
                                  onClick={async () => {
                                    const res = await dispatchTransfer(t.id);
                                    if (res.success) toast.success('تم شحن المناقلة وخصم الرصيد بنجاح');
                                    else toast.error(res.error);
                                  }}
                                >
                                  تنفيذ الشحن
                                </Button>
                              )}

                              {t.status === 'in_transit' && (
                                <Button
                                  size="sm"
                                  className="h-7 text-xs font-bold bg-emerald-600 hover:bg-emerald-700"
                                  onClick={async () => {
                                    const res = await receiveTransfer(t.id);
                                    if (res.success) toast.success('تم استلام المناقلة وإضافة الرصيد للموقع');
                                    else toast.error(res.error);
                                  }}
                                >
                                  تأكيد الاستلام
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* TAB 4: Inventory Count Sessions */}
          <TabsContent value="counts" className="space-y-4 mt-0">
            <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
              <table className="w-full text-xs text-right">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="p-3">رقم الجلسة</th>
                    <th className="p-3">الموقع</th>
                    <th className="p-3 text-center">عدد الأصناف</th>
                    <th className="p-3 text-center">إجمالي الفارق المالي</th>
                    <th className="p-3 text-center">الحالة</th>
                    <th className="p-3">تاريخ البدء</th>
                    <th className="p-3 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        لا توجد جلسات جرد سابقة في هذا الموقع
                      </td>
                    </tr>
                  ) : (
                    sessions.map((s) => (
                      <tr key={s.id} className="hover:bg-muted/20">
                        <td className="p-3 font-mono font-bold text-foreground">{s.sessionNumber}</td>
                        <td className="p-3">
                          {locations.find((l) => l.id === (s.locationId || s.branchId))?.name || 'الموقع الحالي'}
                        </td>
                        <td className="p-3 text-center font-bold">{s.items.length} صنف</td>
                        <td className="p-3 text-center font-mono font-bold">
                          <span
                            className={
                              s.totalDifferenceValue < 0
                                ? 'text-rose-600'
                                : s.totalDifferenceValue > 0
                                ? 'text-emerald-600'
                                : 'text-muted-foreground'
                            }
                          >
                            {s.totalDifferenceValue.toLocaleString()} ج.م
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <Badge variant={s.status === 'posted' ? 'default' : 'secondary'}>
                            {s.status === 'posted' ? 'مرحّل' : 'قيد الجرد'}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground font-mono">
                          {new Date(s.createdAt).toLocaleDateString('ar-EG')}
                        </td>
                        <td className="p-3 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs font-bold"
                            onClick={() => {
                              setActiveSession(s);
                              setIsCountModalOpen(true);
                            }}
                          >
                            {s.status === 'posted' ? 'استعراض' : 'متابعة الجرد'}
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* TAB 5: Damage & Loss */}
          <TabsContent value="damage" className="space-y-4 mt-0">
            <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
              <table className="w-full text-xs text-right">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    <th className="p-3">اسم الصنف المتضرر</th>
                    <th className="p-3 text-center">النوع</th>
                    <th className="p-3 text-center">الكمية</th>
                    <th className="p-3 text-center">تكلفة التلف</th>
                    <th className="p-3">السبب والواقعة</th>
                    <th className="p-3">التاريخ</th>
                    <th className="p-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loadingDamage ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        جاري تحميل سجلات الهالك...
                      </td>
                    </tr>
                  ) : damageRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        لا توجد سجلات هالك أو فقد مسجلة
                      </td>
                    </tr>
                  ) : (
                    damageRecords.map((d) => {
                      const prod = products.find((p) => p.id === d.productId);
                      const displayName = d.productNameSnapshot || prod?.name || (d.notes?.startsWith('[') ? d.notes.slice(1, d.notes.indexOf(']')) : '') || d.productId;

                      return (
                        <tr key={d.id} className="hover:bg-muted/20">
                          <td className="p-3 font-semibold text-foreground">
                            {displayName}
                          </td>
                          <td className="p-3 text-center">
                            <Badge variant="outline" className="text-rose-600 border-rose-300">
                              {d.type === 'damaged'
                                ? 'تالف'
                                : d.type === 'lost'
                                ? 'مفقود'
                                : d.type === 'broken'
                                ? 'مكسور'
                                : 'منتهي الصلاحية'}
                            </Badge>
                          </td>
                          <td className="p-3 text-center font-bold text-rose-600">{d.quantity}</td>
                          <td className="p-3 text-center font-mono font-bold">
                            {d.totalCostValue.toLocaleString()} ج.م
                          </td>
                          <td className="p-3 text-muted-foreground max-w-xs truncate" title={d.reason}>
                            {d.reason}
                          </td>
                          <td className="p-3 text-muted-foreground font-mono">
                            {new Date(d.createdAt).toLocaleDateString('ar-EG')}
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {d.type === 'lost' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs font-bold text-emerald-600 hover:text-emerald-700"
                                  onClick={async () => {
                                    const qtyStr = window.prompt(`أدخل الكمية التي تم استردادها (الحد الأقصى: ${d.quantity}):`, String(d.quantity));
                                    if (!qtyStr) return;
                                    const qty = parseFloat(qtyStr);
                                    if (isNaN(qty) || qty <= 0 || qty > d.quantity) {
                                      toast.error('كمية غير صالحة');
                                      return;
                                    }
                                    const res = await recordRecovery(
                                      d.branchId,
                                      d.productId,
                                      d.variantId,
                                      qty,
                                      d.unitCost,
                                      d.id,
                                      'تم العثور على البضاعة المفقودة'
                                    );
                                    if (res.success) {
                                      toast.success('تم استرداد البضاعة وإعادتها للمخزون');
                                      await refresh();
                                    } else {
                                      toast.error(res.error);
                                    }
                                  }}
                                >
                                  استرداد بعد الفقد
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                title="حذف السجل وإرجاع الكمية إلى المخزون"
                                onClick={async () => {
                                  if (!confirm(`هل تريد بالتأكيد حذف هذا السجل وإعادة كمية (${d.quantity}) من صنف "${displayName}" إلى رصيد المخزون؟`)) return;
                                  const res = await deleteDamage(d.id, d.productId, d.variantId, d.quantity, d.unitCost);
                                  if (res.success) {
                                    toast.success('تم حذف السجل وإعادة الكمية إلى رصيد المخزون بنجاح');
                                    await refresh();
                                  } else {
                                    toast.error(res.error || 'فشل حذف السجل');
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>

        {/* DIALOGS */}
        <StockAdjustmentDialog
          open={isAdjustmentOpen}
          onOpenChange={setIsAdjustmentOpen}
          balanceItem={adjustmentTarget}
          productName={products.find((p) => p.id === adjustmentTarget?.productId)?.name}
          onAdjust={async (...args) => {
            const res = await adjustStock(...args);
            if (res.success) {
              await Promise.all([refreshMovements(), refreshDamage()]);
            }
            return res;
          }}
        />

        <OpeningBalanceDialog
          open={isOpeningBalanceOpen}
          onOpenChange={setIsOpeningBalanceOpen}
          products={products}
          selectedLocationName={selectedLocObj?.name}
          onSubmitBalance={addOpeningBalance}
        />

        <TransferManageDialog
          open={isTransferOpen}
          onOpenChange={setIsTransferOpen}
          locations={locations}
          currentLocationId={selectedLocationId}
          products={products}
          onCreateTransfer={createTransfer}
        />

        <InventoryCountModal
          open={isCountModalOpen}
          onOpenChange={setIsCountModalOpen}
          session={activeSession}
          onScanBarcode={scanBarcode}
          onUpdateQty={updateItemQty}
          onPostSession={postSession}
        />

        <DamageLossModal
          open={isDamageOpen}
          onOpenChange={setIsDamageOpen}
          products={products}
          currentLocationId={selectedLocationId}
          onRecordDamage={recordDamage}
        />
      </div>
    </MainLayout>
  );
}
