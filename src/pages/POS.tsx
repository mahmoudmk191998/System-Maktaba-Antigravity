/**
 * Retail Bookstore & Stationery POS (Point of Sale)
 * High-speed barcode-first retail checkout engine.
 * Fully decoupled from restaurant orders/tables/kitchen.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  ScanBarcode,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Lock,
  Unlock,
  Clock,
  CheckCircle2,
  Tag,
  Percent,
  Edit3,
  User,
  RotateCcw,
  Sparkles,
  Layers,
  BookOpen,
  Keyboard,
  Info,
  Shield,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { useAppStore } from '@/lib/store';
import { useFormatters } from '@/lib/formatters';
import { useAuth } from '@/hooks/useAuth';
import { useTenantBranch } from '@/hooks/useDatabase';
import { useUserPermissions } from '@/hooks/usePermissions';
import { useProducts } from '@/hooks/retail/useProducts';
import { useCategories } from '@/hooks/retail/useCategories';
import { useCustomers } from '@/hooks/retail/useCustomers';
import { usePOSCart, type POSCartItem } from '@/hooks/retail/usePOSCart';
import { useCashRegister } from '@/hooks/retail/useCashRegister';
import { completeSaleTransaction } from '@/services/sales/sales.service';
import { holdCurrentSale } from '@/services/sales/heldSales.service';
import { QuickPaymentModal } from '@/components/retail/pos/QuickPaymentModal';
import { ReceiptDialog } from '@/components/retail/pos/ReceiptDialog';
import { CashRegisterModal } from '@/components/retail/pos/CashRegisterModal';
import { HeldSalesDrawer } from '@/components/retail/pos/HeldSalesDrawer';
import type { Product, ProductVariant, Sale, PaymentEntry } from '@/types/retail.types';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export default function POSPage() {
  const navigate = useNavigate();
  const { tenantId: hookTenantId, branchId: hookBranchId } = useTenantBranch();
  const { currentTenant, currentBranch, settings } = useAppStore();
  const { currency, number } = useFormatters();
  const { user } = useAuth();
  const { hasPermission, isAdmin } = useUserPermissions();

  const tenantId = currentTenant?.id || hookTenantId || '';
  const branchId = currentBranch?.id || hookBranchId || '';
  const branchCode = currentBranch?.code || 'HQ';
  const cashierId = user?.uid || '';
  const cashierName = user?.displayName || user?.email || 'كاشير';

  // Permissions
  const canWholesale = isAdmin || hasPermission('sales.wholesale');
  const canOverridePrice = isAdmin || hasPermission('sales.override_price') || hasPermission('pos.override_price');
  const canDiscount = isAdmin || hasPermission('sales.discount') || hasPermission('pos.apply_discount');
  const canManageRegister = isAdmin || hasPermission('cash_register.open') || hasPermission('pos.open_drawer');

  // Register Shift Hook
  const {
    activeShift,
    isShiftOpen,
    refreshShift,
    openShift,
    closeShift,
  } = useCashRegister();

  // Categories & Products Data
  const { categories } = useCategories();
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const { products, loading: productsLoading } = useProducts({
    pageSize: 200,
    search: searchQuery,
    categoryId: selectedCategory !== 'all' ? selectedCategory : undefined,
  });

  const { customers } = useCustomers();

  // Cart Hook
  const {
    items: cartItems,
    isWholesale,
    setIsWholesale,
    cartDiscount,
    setCartDiscount,
    cartDiscountType,
    setCartDiscountType,
    cartDiscountValue,
    setCartDiscountValue,
    applyCartDiscount,
    clearCartDiscount,
    selectedCustomer,
    setSelectedCustomer,
    addToCart,
    addByBarcode,
    updateQuantity,
    removeItem,
    setLineDiscount,
    overrideUnitPrice,
    clearCart,
    totals,
  } = usePOSCart(tenantId, branchId);

  // Modals & Drawers State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [heldDrawerOpen, setHeldDrawerOpen] = useState(false);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [registerModalMode, setRegisterModalMode] = useState<'open' | 'close'>('open');
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);

  // Cash Drawer Password State
  const [openDrawerPasswordModalOpen, setOpenDrawerPasswordModalOpen] = useState(false);
  const [enteredDrawerPassword, setEnteredDrawerPassword] = useState('');

  // Cart Discount Modal State
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [discountModalType, setDiscountModalType] = useState<'fixed' | 'percentage'>('fixed');
  const [discountModalValue, setDiscountModalValue] = useState<string>('0');

  // Variant selector modal
  const [variantSelectorProduct, setVariantSelectorProduct] = useState<Product | null>(null);

  // Line edit dialog (price override / discount)
  const [editLineItem, setEditLineItem] = useState<POSCartItem | null>(null);
  const [editPriceInput, setEditPriceInput] = useState<string>('');
  const [editDiscountInput, setEditDiscountInput] = useState<string>('');
  const [editDiscountType, setEditDiscountType] = useState<'fixed' | 'percentage'>('fixed');

  // Barcode search input ref
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard Wedge Scanner Listener (Detects rapid barcode scans)
  const barcodeBufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  // Cash Drawer Opening Logic
  const executeOpenCashDrawer = async () => {
    try {
      if (tenantId) {
        await addDoc(collection(db, 'audit_logs'), {
          action: 'pos_manual_drawer_open',
          entity: 'cash_register',
          user: cashierName,
          user_id: cashierId,
          tenant_id: tenantId,
          branch_id: branchId,
          details: 'تم فتح درج الكاشير يدوياً من شاشة نقطة البيع',
          severity: 'info',
          created_at: new Date().toISOString()
        });
      }
      toast.success('تم فتح درج الكاشير بنجاح');
    } catch (err) {
      console.error('Drawer open audit error:', err);
      toast.success('تم فتح درج الكاشير بنجاح');
    }
  };

  const handleOpenCashDrawer = () => {
    if (!canManageRegister) {
      toast.error('ليس لديك صلاحية فتح درج الكاشير');
      return;
    }

    if (settings.openDrawerPassword && settings.openDrawerPassword.trim() !== '') {
      setEnteredDrawerPassword('');
      setOpenDrawerPasswordModalOpen(true);
    } else {
      executeOpenCashDrawer();
    }
  };

  const handleVerifyDrawerPassword = () => {
    if (enteredDrawerPassword === settings.openDrawerPassword) {
      setOpenDrawerPasswordModalOpen(false);
      executeOpenCashDrawer();
    } else {
      toast.error('رمز المرور لفتح الدرج غير صحيح');
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Hotkeys
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }
      if (e.key === 'F6') {
        e.preventDefault();
        handleHoldCart();
        return;
      }
      if (e.key === 'F8') {
        e.preventDefault();
        if (cartItems.length > 0) {
          handleOpenPayment();
        }
        return;
      }
      if (e.key === 'F9') {
        e.preventDefault();
        handleOpenCashDrawer();
        return;
      }

      // Barcode Wedge Scanner Detection:
      // Scanners rapidly type characters (<50ms between keys) ending with Enter.
      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // If active element is an input other than search, don't hijack
      if (
        document.activeElement?.tagName === 'INPUT' &&
        document.activeElement !== searchInputRef.current
      ) {
        return;
      }

      if (e.key === 'Enter') {
        if (barcodeBufferRef.current.length >= 3 && timeDiff < 100) {
          e.preventDefault();
          const scannedCode = barcodeBufferRef.current;
          barcodeBufferRef.current = '';
          handleScanBarcode(scannedCode);
        } else {
          barcodeBufferRef.current = '';
        }
      } else if (e.key.length === 1) {
        if (timeDiff > 100) {
          barcodeBufferRef.current = '';
        }
        barcodeBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cartItems, settings.openDrawerPassword, canManageRegister]);

  const handleScanBarcode = async (barcode: string) => {
    toast.loading(`جاري فحص الباركود: ${barcode}...`, { id: 'barcode_scan' });
    const res = await addByBarcode(barcode);
    if (res.success) {
      toast.success('تمت إضافة الصنف إلى السلة بنجاح', { id: 'barcode_scan' });
    } else {
      toast.error(res.error || 'تعذر العثور على الصنف', { id: 'barcode_scan' });
    }
  };

  const handleProductCardClick = (product: Product) => {
    if (product.hasVariants && product.variants && product.variants.length > 0) {
      setVariantSelectorProduct(product);
    } else {
      addToCart(product, null, 1);
    }
  };

  const handleSelectVariant = (variant: ProductVariant) => {
    if (variantSelectorProduct) {
      addToCart(variantSelectorProduct, variant, 1);
      setVariantSelectorProduct(null);
    }
  };

  const handleOpenPayment = () => {
    if (cartItems.length === 0) {
      toast.error('سلة المشتريات فارغة');
      return;
    }
    if (!isShiftOpen) {
      toast.error('يجب فتح وردية الكاشير أولاً لبدء البيع وإصدار الفواتير');
      setRegisterModalMode('open');
      setRegisterModalOpen(true);
      return;
    }
    setPaymentModalOpen(true);
  };

  const handleConfirmPayment = async (
    payments: PaymentEntry[],
    clientCheckoutId: string
  ): Promise<Sale | null> => {
    const saleResult = await completeSaleTransaction({
      tenantId,
      branchId,
      branchCode,
      cashierId,
      cashierNameSnapshot: cashierName,
      customerId: selectedCustomer?.id || null,
      customerNameSnapshot: selectedCustomer?.name || 'عميل نقدي (Walk-in)',
      customerPhoneSnapshot: selectedCustomer?.phone || '',
      shiftId: activeShift?.id || null,
      saleType: isWholesale ? 'wholesale' : 'retail',
      items: cartItems.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        barcode: item.barcode,
        categoryName: item.categoryName,
        brandName: item.brandName,
        quantity: item.quantity,
        inputUnitId: item.inputUnitId,
        conversionFactor: item.conversionFactor,
        unitSellingPrice: item.unitSellingPrice,
        originalUnitPrice: item.originalUnitPrice,
        discountAmount: item.discountAmount,
        taxRate: item.taxRate,
        priceSource: item.priceSource,
        minimumSellingPrice: item.minimumSellingPrice,
      })),
      payments,
      cartDiscountAmount: totals.cartDiscount,
      discountType: cartDiscountType,
      discountValue: cartDiscountValue,
      serviceChargeRate: totals.serviceChargeRate,
      serviceChargeAmount: totals.totalServiceCharge,
      taxIncluded: totals.taxIncluded,
      serviceChargeIncluded: totals.serviceChargeIncluded,
      clientCheckoutId,
      allowBelowMinimum: isAdmin,
    });

    if (saleResult.success && saleResult.sale) {
      toast.success(`تم إتمام الفاتورة بنجاح برقم: ${saleResult.sale.invoiceNumber}`);
      setCompletedSale(saleResult.sale);
      clearCart();
      refreshShift();
      setReceiptModalOpen(true);
      return saleResult.sale;
    } else {
      toast.error(saleResult.error || 'فشلت عملية إتمام البيع');
      return null;
    }
  };

  const handleHoldCart = async () => {
    if (cartItems.length === 0) {
      toast.error('لا يمكن تعليق سلة فارغة');
      return;
    }
    const res = await holdCurrentSale({
      tenantId,
      branchId,
      cashierId,
      items: cartItems as any,
      customerSnapshot: selectedCustomer,
      subtotal: totals.subtotal,
      discount: totals.totalDiscount,
      serviceCharge: totals.totalServiceCharge,
      tax: totals.totalTax,
      total: totals.grandTotal,
    });

    if (res.success) {
      toast.success('تم تعليق السلة بنجاح');
      clearCart();
    } else {
      toast.error(res.error || 'تعذر تعليق السلة');
    }
  };

  const handleOpenDiscountModal = () => {
    setDiscountModalType(cartDiscountType || 'fixed');
    setDiscountModalValue(cartDiscountValue ? String(cartDiscountValue) : '');
    setDiscountModalOpen(true);
  };

  const handleApplyDiscount = () => {
    const val = Number(discountModalValue) || 0;
    if (val < 0) {
      toast.error('قيمة الخصم لا يمكن أن تكون سالبة');
      return;
    }
    if (discountModalType === 'percentage' && val > 100) {
      toast.error('نسبة الخصم لا يمكن أن تتجاوز 100%');
      return;
    }
    if (discountModalType === 'fixed' && val > totals.subtotal) {
      toast.error('قيمة الخصم لا يمكن أن تتجاوز المجموع الفرعي');
      return;
    }
    applyCartDiscount(discountModalType, val);
    setDiscountModalOpen(false);
    toast.success('تم تطبيق الخصم بنجاح');
  };

  const handleRemoveDiscount = () => {
    clearCartDiscount();
    setDiscountModalValue('0');
    setDiscountModalOpen(false);
    toast.info('تمت إزالة الخصم');
  };

  const handleOpenEditLine = (item: POSCartItem) => {
    setEditLineItem(item);
    setEditPriceInput(item.unitSellingPrice.toString());
    setEditDiscountInput(item.discountAmount.toString());
    setEditDiscountType('fixed');
  };

  const handleSaveEditLine = () => {
    if (!editLineItem) return;
    const newPrice = Number(editPriceInput);
    const rawDiscount = Number(editDiscountInput) || 0;

    if (newPrice !== editLineItem.unitSellingPrice) {
      overrideUnitPrice(editLineItem.id, newPrice);
    }

    let lineDiscountAmt = 0;
    if (editDiscountType === 'percentage') {
      const lineSubtotal = (newPrice > 0 ? newPrice : editLineItem.unitSellingPrice) * editLineItem.quantity;
      const clampedPct = Math.min(100, Math.max(0, rawDiscount));
      lineDiscountAmt = Math.round((lineSubtotal * (clampedPct / 100)) * 100) / 100;
    } else {
      lineDiscountAmt = Math.max(0, rawDiscount);
    }

    if (lineDiscountAmt !== editLineItem.discountAmount) {
      setLineDiscount(editLineItem.id, lineDiscountAmt);
    }
    setEditLineItem(null);
  };

  return (
    <MainLayout>
      <div className="h-[calc(100vh-4.5rem)] flex flex-col gap-3 p-1 sm:p-2" dir="rtl">
        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-card/80 backdrop-blur border border-border rounded-2xl shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-foreground flex items-center gap-2">
                <span>نقطة بيع المكتبة والأدوات المدرسية</span>
                <Badge variant="outline" className="text-xs bg-muted/60">
                  {currentBranch?.name || 'الفرع الرئيسي'}
                </Badge>
              </h1>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>الكاشير: <strong>{cashierName}</strong></span>
                <span>•</span>
                <span className="flex items-center gap-1 text-emerald-600 font-medium">
                  <ScanBarcode className="w-3.5 h-3.5" />
                  القارئ الآلي مفعل
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Cash Register Shift Button */}
            <Button
              size="sm"
              variant={isShiftOpen ? 'outline' : 'destructive'}
              className="gap-1.5 font-semibold text-xs h-8"
              onClick={() => {
                setRegisterModalMode(isShiftOpen ? 'close' : 'open');
                setRegisterModalOpen(true);
              }}
            >
              {isShiftOpen ? (
                <>
                  <Unlock className="w-3.5 h-3.5 text-emerald-500" />
                  <span>الوردية مفتوحة</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>الوردية مغلقة (اضغط للفتح)</span>
                </>
              )}
            </Button>

            {/* Wholesale Pricing Switch */}
            {canWholesale && (
              <Button
                size="sm"
                variant={isWholesale ? 'default' : 'outline'}
                className={`gap-1.5 text-xs h-8 ${isWholesale ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : ''}`}
                onClick={() => setIsWholesale(!isWholesale)}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>{isWholesale ? 'سعر جملة مفعل' : 'بيع تجزئة قطاعي'}</span>
              </Button>
            )}

            {/* Held Carts Button */}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-8"
              onClick={() => setHeldDrawerOpen(true)}
            >
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>السلات المعلقة</span>
            </Button>

            {/* Returns & Exchanges Quick Button */}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-8 text-amber-600 hover:text-amber-700 hover:bg-amber-500/10 border-amber-500/30"
              onClick={() => navigate('/returns')}
              title="شاشة مرتجعات واستبدال المبيعات"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>المرتجعات</span>
            </Button>

            {/* Manual Cash Drawer Open Button */}
            {canManageRegister && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs h-8 text-green-700 hover:text-green-800 hover:bg-green-500/10 border-green-500/30"
                onClick={handleOpenCashDrawer}
                title="فتح درج الكاشير يدوياً (F9)"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>فتح الدرج</span>
              </Button>
            )}

            {/* Shortcuts Guide Button */}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={() => setShortcutsModalOpen(true)}
              title="اختصارات لوحة المفاتيح"
            >
              <Keyboard className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>

        {/* Main Grid: Catalog (Left/Center) + Cart (Right) */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-3 min-h-0">
          {/* Products & Search Section (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col gap-3 min-h-0 bg-card/60 backdrop-blur border border-border rounded-2xl p-3 shadow-sm">
            {/* Search and Category Bar */}
            <div className="flex flex-col gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute right-3 top-3 text-muted-foreground" />
                <Input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ابحث بالاسم أو الباركود أو SKU أو رقم ISBN أو المؤلف... (F2)"
                  className="pr-9 h-10 bg-background/80 text-sm font-medium"
                />
              </div>

              {/* Categories Scrollable Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                <Button
                  size="sm"
                  variant={selectedCategory === 'all' ? 'default' : 'outline'}
                  className="rounded-xl text-xs h-7 px-3 flex-shrink-0 font-medium"
                  onClick={() => setSelectedCategory('all')}
                >
                  الكل
                </Button>
                {categories.map((cat) => (
                  <Button
                    key={cat.id}
                    size="sm"
                    variant={selectedCategory === cat.id ? 'default' : 'outline'}
                    className="rounded-xl text-xs h-7 px-3 flex-shrink-0 font-medium"
                    onClick={() => setSelectedCategory(cat.id)}
                  >
                    {cat.name}
                  </Button>
                ))}
              </div>
            </div>

            {/* Product Cards Grid */}
            <div className="flex-1 overflow-y-auto min-h-0 pr-1">
              {productsLoading ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  جاري تحميل المنتجات...
                </div>
              ) : products.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
                  <BookOpen className="w-8 h-8 opacity-30" />
                  <span>لا توجد منتجات مطابقة للبحث</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
                  {products.map((prod) => {
                    const displayPrice = isWholesale
                      ? (prod.wholesalePrice || prod.sellingPrice)
                      : prod.sellingPrice;

                    return (
                      <Card
                        key={prod.id}
                        className="cursor-pointer hover:border-primary hover:shadow-md transition-all duration-200 bg-card/90 overflow-hidden flex flex-col justify-between"
                        onClick={() => handleProductCardClick(prod)}
                      >
                        <CardContent className="p-2.5 space-y-1.5 flex flex-col justify-between h-full">
                          <div>
                            <div className="flex justify-between items-start gap-1">
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {prod.type === 'book' ? 'كتاب' : 'أدوات'}
                              </Badge>
                              {prod.hasVariants && (
                                <Badge variant="outline" className="text-[9px] px-1 bg-indigo-500/10 text-indigo-600 border-indigo-500/20">
                                  متغيرات
                                </Badge>
                              )}
                            </div>
                            <h3 className="font-bold text-xs text-foreground line-clamp-2 mt-1">
                              {prod.name}
                            </h3>
                            {prod.author && (
                              <p className="text-[10px] text-muted-foreground truncate">{prod.author}</p>
                            )}
                          </div>

                          <div className="pt-1 border-t border-border/50 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {prod.sku}
                            </span>
                            <span className="font-extrabold text-sm text-primary">
                              {number(displayPrice)} ج.م
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Cart Section (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col gap-3 min-h-0 bg-card/80 backdrop-blur border border-border rounded-2xl p-3 shadow-sm">
            {/* Cart Header */}
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-primary" />
                <h2 className="font-bold text-sm">سلة المشتريات</h2>
                <Badge variant="secondary" className="text-xs">
                  {totals.totalItemsCount} قطعة
                </Badge>
              </div>

              {/* Customer Selector */}
              <div className="flex items-center gap-1.5">
                <Select
                  value={selectedCustomer?.id || 'walkin'}
                  onValueChange={(val) => {
                    if (val === 'walkin') {
                      setSelectedCustomer(null);
                    } else {
                      const c = customers.find((x) => x.id === val);
                      setSelectedCustomer(c || null);
                      if (c?.customerType === 'wholesale' && canWholesale) {
                        setIsWholesale(true);
                      }
                    }
                  }}
                >
                  <SelectTrigger className="h-7 text-xs w-40">
                    <SelectValue placeholder="عميل نقدي" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="walkin">عميل نقدي (Walk-in)</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.code ? `(${c.code})` : ''} {c.phone ? ` - ${c.phone}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedCustomer && (
                  <div className="hidden lg:flex items-center gap-1">
                    {selectedCustomer.creditEnabled && (
                      <Badge variant="outline" className="text-[10px] px-1 h-5 text-amber-700 bg-amber-500/10 border-amber-500/30">
                        سقف: {number(selectedCustomer.creditLimit || 0)} ج.م
                      </Badge>
                    )}
                    {(selectedCustomer.currentBalance || 0) < 0 && (
                      <Badge variant="outline" className="text-[10px] px-1 h-5 text-emerald-700 bg-emerald-500/10 border-emerald-500/30">
                        مقدم: {number(Math.abs(selectedCustomer.currentBalance))} ج.م
                      </Badge>
                    )}
                  </div>
                )}

                {cartItems.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                    onClick={clearCart}
                    title="تفريغ السلة"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1">
              {cartItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-xs gap-2">
                  <ShoppingBag className="w-8 h-8 opacity-20" />
                  <span>السلة فارغة. قم بمسح باركود أو اختيار أصناف.</span>
                </div>
              ) : (
                cartItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 bg-muted/30 rounded-xl border border-border/80 flex flex-col gap-1.5 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <span className="font-bold text-xs text-foreground">{item.productName}</span>
                        {item.variantName && (
                          <span className="mr-1 text-[11px] text-muted-foreground">({item.variantName})</span>
                        )}
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {item.sku} {item.conversionFactor > 1 ? `| عبوة (${item.conversionFactor} قطعة)` : ''}
                        </div>
                      </div>
                      <div className="text-left">
                        <div className="font-extrabold text-sm text-foreground">
                          {number(item.lineTotal)} ج.م
                        </div>
                        {item.discountAmount > 0 && (
                          <div className="text-[10px] text-red-600">خصم: -{item.discountAmount}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-border/40">
                      {/* Quantity Buttons */}
                      <div className="flex items-center gap-1 bg-background rounded-lg border border-border p-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 rounded"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        >
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-8 text-center text-xs font-bold">{item.quantity}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 rounded"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>

                      {/* Price / Discount Edit */}
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-semibold text-muted-foreground">
                          @{number(item.unitSellingPrice)}
                        </span>
                        {(canOverridePrice || canDiscount) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            onClick={() => handleOpenEditLine(item)}
                            title="تعديل السعر أو الخصم"
                          >
                            <Edit3 className="w-3 h-3" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive hover:bg-destructive/10"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Totals & Pay Section */}
            <div className="space-y-2 pt-2 border-t border-border bg-card/40 rounded-xl p-3">
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>المجموع الفرعي:</span>
                  <span className="font-semibold">{number(totals.subtotal)} ج.م</span>
                </div>

                {/* Cart Discount Control Row */}
                <div className="flex items-center justify-between py-1 border-y border-dashed border-border/70 my-1">
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-primary" />
                    <span className="font-medium text-foreground">خصم الفاتورة:</span>
                    {totals.cartDiscount > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-primary/10 text-primary border border-primary/20">
                        {cartDiscountType === 'percentage' ? `${cartDiscountValue}%` : 'مبلغ ثابت'}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {totals.cartDiscount > 0 ? (
                      <>
                        <span className="font-bold text-red-600">-{number(totals.cartDiscount)} ج.م</span>
                        {canDiscount && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-muted-foreground hover:text-foreground"
                            onClick={handleOpenDiscountModal}
                            title="تعديل الخصم"
                          >
                            <Edit3 className="w-3 h-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 text-destructive hover:bg-destructive/10"
                          onClick={handleRemoveDiscount}
                          title="إلغاء الخصم"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </>
                    ) : (
                      canDiscount && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 text-[11px] px-2 gap-1 border-dashed text-primary hover:text-primary hover:bg-primary/10"
                          onClick={handleOpenDiscountModal}
                          disabled={cartItems.length === 0}
                        >
                          <Percent className="w-3 h-3" />
                          <span>تطبيق خصم</span>
                        </Button>
                      )
                    )}
                  </div>
                </div>

                {totals.lineDiscounts > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>خصومات الأصناف الفردية:</span>
                    <span className="font-semibold text-red-600">-{number(totals.lineDiscounts)} ج.م</span>
                  </div>
                )}

                {totals.totalDiscount > 0 && (
                  <div className="flex justify-between text-red-600 font-bold bg-red-500/10 dark:bg-red-950/20 px-2 py-0.5 rounded">
                    <span>إجمالي الخصم المطبق:</span>
                    <span>-{number(totals.totalDiscount)} ج.م</span>
                  </div>
                )}
                {totals.totalServiceCharge > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>رسوم الخدمة ({totals.serviceChargeRate}%):</span>
                    <span className="font-semibold">
                      {totals.serviceChargeIncluded ? '(شاملة) ' : '+'}{number(totals.totalServiceCharge)} ج.م
                    </span>
                  </div>
                )}
                {totals.totalTax > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>ضريبة القيمة المضافة ({totals.taxRate}%):</span>
                    <span className="font-semibold">
                      {totals.taxIncluded ? '(شاملة) ' : '+'}{number(totals.totalTax)} ج.م
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-2 border-t border-border">
                  <span className="text-sm font-bold text-foreground">الإجمالي المطلوب:</span>
                  <span className="text-2xl font-black text-primary">
                    {number(totals.grandTotal)} ج.م
                  </span>
                </div>
              </div>

              {/* Checkout & Hold Action Buttons */}
              <div className="grid grid-cols-4 gap-2 pt-1">
                <Button
                  variant="outline"
                  className="col-span-1 h-11 text-xs gap-1 font-semibold"
                  onClick={handleHoldCart}
                  disabled={cartItems.length === 0}
                  title="تعليق السلة (F6)"
                >
                  <Clock className="w-4 h-4 text-amber-500" />
                  <span>تعليق (F6)</span>
                </Button>

                <Button
                  className="col-span-3 h-11 text-base font-extrabold gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20"
                  onClick={handleOpenPayment}
                  disabled={cartItems.length === 0}
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>إتمام البيع والدفع (F8)</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Variant Selector Dialog */}
      <Dialog open={!!variantSelectorProduct} onOpenChange={() => setVariantSelectorProduct(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              اختر المتغير / النوع: {variantSelectorProduct?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-3">
            {variantSelectorProduct?.variants?.map((v) => (
              <div
                key={v.id}
                className="p-3 bg-muted/40 rounded-xl border border-border flex items-center justify-between cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleSelectVariant(v)}
              >
                <div>
                  <span className="font-bold text-sm">
                    {Object.values(v.attributes || {}).join(' / ') || v.sku}
                  </span>
                  <div className="text-xs text-muted-foreground font-mono">
                    SKU: {v.sku} {v.barcode ? `| Barcode: ${v.barcode}` : ''}
                  </div>
                </div>
                <div className="font-extrabold text-sm text-primary">
                  {number(v.sellingPrice || variantSelectorProduct.sellingPrice)} ج.م
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Line Item Edit Dialog (Price Override & Discount) */}
      <Dialog open={!!editLineItem} onOpenChange={() => setEditLineItem(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold">
              تعديل سعر وخصم السطر: {editLineItem?.productName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {canOverridePrice && (
              <div className="space-y-1">
                <label className="text-xs font-semibold">سعر البيع للوحدة (ج.م):</label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={editPriceInput}
                  onChange={(e) => setEditPriceInput(e.target.value)}
                  className="h-9 font-bold"
                />
              </div>
            )}
            {canDiscount && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold">خصم هذا الصنف:</label>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={editDiscountType === 'fixed' ? 'default' : 'outline'}
                      className="h-6 text-[10px] px-2 font-bold"
                      onClick={() => setEditDiscountType('fixed')}
                    >
                      ج.م
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={editDiscountType === 'percentage' ? 'default' : 'outline'}
                      className="h-6 text-[10px] px-2 font-bold"
                      onClick={() => setEditDiscountType('percentage')}
                    >
                      %
                    </Button>
                  </div>
                </div>
                <Input
                  type="number"
                  min="0"
                  max={editDiscountType === 'percentage' ? 100 : undefined}
                  step="any"
                  value={editDiscountInput}
                  onChange={(e) => setEditDiscountInput(e.target.value)}
                  placeholder={editDiscountType === 'percentage' ? 'النسبة المئوية للخصم %' : 'مبلغ الخصم بالجنيه'}
                  className="h-9 font-bold"
                />
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2 sm:justify-between">
            <Button size="sm" variant="outline" onClick={() => setEditLineItem(null)}>
              إلغاء
            </Button>
            <Button size="sm" onClick={handleSaveEditLine}>
              حفظ التعديلات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cart Discount Dialog (Whole Invoice Discount) */}
      <Dialog open={discountModalOpen} onOpenChange={setDiscountModalOpen}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" />
              <span>تطبيق خصم على الفاتورة</span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Type selector toggle */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-muted rounded-xl">
              <button
                type="button"
                onClick={() => setDiscountModalType('percentage')}
                className={`flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                  discountModalType === 'percentage'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Percent className="w-4 h-4" />
                <span>نسبة مئوية (%)</span>
              </button>
              <button
                type="button"
                onClick={() => setDiscountModalType('fixed')}
                className={`flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all ${
                  discountModalType === 'fixed'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>مبلغ ثابت (ج.م)</span>
              </button>
            </div>

            {/* Quick percentage chips if percentage mode */}
            {discountModalType === 'percentage' && (
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground font-semibold">نسب سريعة:</span>
                <div className="grid grid-cols-6 gap-1.5">
                  {[5, 10, 15, 20, 25, 50].map((pct) => (
                    <Button
                      key={pct}
                      type="button"
                      variant={discountModalValue === String(pct) ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 text-xs font-bold"
                      onClick={() => setDiscountModalValue(String(pct))}
                    >
                      {pct}%
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Input field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {discountModalType === 'percentage' ? 'نسبة الخصم المطلوبة (%):' : 'مبلغ الخصم المطلوب (ج.م):'}
              </label>
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  max={discountModalType === 'percentage' ? 100 : totals.subtotal}
                  step="any"
                  value={discountModalValue}
                  onChange={(e) => setDiscountModalValue(e.target.value)}
                  placeholder="0"
                  className="h-11 text-lg font-bold text-center pl-10"
                  autoFocus
                />
                <span className="absolute left-3 top-3 text-xs font-bold text-muted-foreground">
                  {discountModalType === 'percentage' ? '%' : 'ج.م'}
                </span>
              </div>
            </div>

            {/* Live Calculation Preview */}
            {Number(discountModalValue) > 0 && (
              <div className="p-3 bg-muted/50 border border-border rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>المجموع الفرعي الحالي:</span>
                  <span className="font-semibold">{number(totals.subtotal)} ج.م</span>
                </div>
                <div className="flex justify-between text-red-600 font-semibold">
                  <span>
                    قيمة الخصم المحسوبة
                    {discountModalType === 'percentage' ? ` (${discountModalValue}%):` : ':'}
                  </span>
                  <span>
                    -{number(
                      discountModalType === 'percentage'
                        ? Math.round((totals.subtotal * (Math.min(100, Number(discountModalValue)) / 100)) * 100) / 100
                        : Math.min(totals.subtotal, Number(discountModalValue))
                    )} ج.م
                  </span>
                </div>
                <div className="flex justify-between font-bold text-foreground pt-1.5 border-t border-border">
                  <span>صافي المطلوب بعد الخصم:</span>
                  <span className="text-primary font-black">
                    {number(
                      Math.max(
                        0,
                        totals.subtotal -
                          (discountModalType === 'percentage'
                            ? Math.round((totals.subtotal * (Math.min(100, Number(discountModalValue)) / 100)) * 100) / 100
                            : Math.min(totals.subtotal, Number(discountModalValue)))
                      )
                    )} ج.م
                  </span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 sm:justify-between pt-2">
            {totals.cartDiscount > 0 ? (
              <Button type="button" variant="destructive" size="sm" onClick={handleRemoveDiscount}>
                إلغاء الخصم الحالي
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setDiscountModalOpen(false)}>
                إلغاء
              </Button>
            )}
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={handleApplyDiscount}>
                تأكيد وتطبيق الخصم
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Payment Modal */}
      <QuickPaymentModal
        open={paymentModalOpen}
        onOpenChange={setPaymentModalOpen}
        grandTotal={totals.grandTotal}
        customer={selectedCustomer}
        onConfirmPayment={handleConfirmPayment}
      />

      {/* Receipt Thermal Print Dialog — store identity auto-read from settings */}
      <ReceiptDialog
        open={receiptModalOpen}
        onOpenChange={setReceiptModalOpen}
        sale={completedSale}
      />

      {/* Held Sales Drawer */}
      <HeldSalesDrawer
        open={heldDrawerOpen}
        onOpenChange={setHeldDrawerOpen}
        tenantId={tenantId}
        branchId={branchId}
        onResumeSale={(held) => {
          // Resume held sale into active cart
          clearCart();
          held.items.forEach((item) => {
            // Add as cart line
            addToCart(
              {
                id: item.productId,
                name: item.productNameSnapshot,
                sellingPrice: item.unitSellingPrice,
                sku: item.skuSnapshot,
                barcode: item.barcodeSnapshot,
                baseUnitId: item.unitId || 'pcs',
                type: 'standard',
                tenantId,
                status: 'active',
                createdAt: '',
                updatedAt: '',
                hasVariants: !!item.variantId,
              } as any,
              item.variantId ? ({ id: item.variantId, sku: item.skuSnapshot } as any) : null,
              item.quantity
            );
          });
        }}
      />

      {/* Cash Register Shift Modal */}
      <CashRegisterModal
        open={registerModalOpen}
        onOpenChange={setRegisterModalOpen}
        mode={registerModalMode}
        activeShift={activeShift}
        onConfirmOpen={async (openCash, notes) => {
          const res = await openShift(openCash, notes);
          if (res.success) {
            toast.success('تم فتح الوردية بنجاح');
            return true;
          }
          toast.error(res.error || 'تعذر فتح الوردية');
          return false;
        }}
        onConfirmClose={async (actualCash, notes) => {
          const res = await closeShift(actualCash, notes);
          if (res.success) {
            toast.success('تم إغلاق الوردية وجرد الدرج بنجاح');
            return true;
          }
          toast.error(res.error || 'تعذر إغلاق الوردية');
          return false;
        }}
      />

      {/* Keyboard Shortcuts Dialog */}
      <Dialog open={shortcutsModalOpen} onOpenChange={setShortcutsModalOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Keyboard className="w-5 h-5 text-primary" />
              <span>اختصارات لوحة المفاتيح السريعة</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2 text-xs">
            <div className="flex justify-between p-2 bg-muted/40 rounded-lg">
              <span>التركيز على شريط البحث:</span>
              <kbd className="px-2 py-0.5 bg-background rounded font-mono border">F2</kbd>
            </div>
            <div className="flex justify-between p-2 bg-muted/40 rounded-lg">
              <span>تعليق السلة الحالية:</span>
              <kbd className="px-2 py-0.5 bg-background rounded font-mono border">F6</kbd>
            </div>
            <div className="flex justify-between p-2 bg-muted/40 rounded-lg">
              <span>فتح شاشة الدفع والتحصيل:</span>
              <kbd className="px-2 py-0.5 bg-background rounded font-mono border">F8</kbd>
            </div>
            <div className="flex justify-between p-2 bg-muted/40 rounded-lg">
              <span>فتح درج الكاشير يدوياً:</span>
              <kbd className="px-2 py-0.5 bg-background rounded font-mono border">F9</kbd>
            </div>
            <div className="flex justify-between p-2 bg-muted/40 rounded-lg">
              <span>مسح الباركود السريع:</span>
              <span className="font-semibold text-emerald-600">يعمل تلقائياً بدون الضغط</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cash Drawer Password Verification Dialog */}
      <Dialog open={openDrawerPasswordModalOpen} onOpenChange={setOpenDrawerPasswordModalOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Shield className="w-5 h-5 text-green-600" />
              تأكيد فتح درج الكاشير
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              تم تفعيل حماية درج الكاشير. يرجى إدخال رمز المرور للمتابعة.
            </p>
            <Input
              type="password"
              dir="ltr"
              placeholder="أدخل رمز مرور الدرج"
              value={enteredDrawerPassword}
              onChange={(e) => setEnteredDrawerPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleVerifyDrawerPassword()}
              autoFocus
              className="text-left tracking-widest font-mono"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpenDrawerPasswordModalOpen(false)}>
              إلغاء
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
              onClick={handleVerifyDrawerPassword}
              disabled={!enteredDrawerPassword}
            >
              <Shield className="w-4 h-4" />
              تأكيد الفتح
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
