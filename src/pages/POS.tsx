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
  Camera,
  QrCode,
  Maximize2,
  Minimize2,
  Home,
  Sun,
  Moon,
  X,
  FolderTree,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { MobileScannerModal } from '@/components/retail/pos/MobileScannerModal';
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
import { holdCurrentSale, getHeldSalesCount, subscribeToHeldSales } from '@/services/sales/heldSales.service';
import { QuickPaymentModal } from '@/components/retail/pos/QuickPaymentModal';
import { ReceiptDialog } from '@/components/retail/pos/ReceiptDialog';
import { CashRegisterModal } from '@/components/retail/pos/CashRegisterModal';
import { HeldSalesDrawer } from '@/components/retail/pos/HeldSalesDrawer';
import { CategoryVisualGrid } from '@/components/retail/pos/CategoryVisualGrid';
import { POSCategoryBreadcrumb } from '@/components/retail/pos/POSCategoryBreadcrumb';
import { CategoryManageDialog } from '@/components/retail/CategoryManageDialog';
import type { Product, ProductVariant, Sale, PaymentEntry, ProductCategory } from '@/types/retail.types';
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

  // Categories & Products Data (Category-First Visual POS)
  const { categories, loading: categoriesLoading } = useCategories();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryPath, setCategoryPath] = useState<ProductCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryManageOpen, setCategoryManageOpen] = useState(false);

  // Active categories sorted by sortOrder
  const activeCategories = useMemo(() => {
    return (categories || [])
      .filter((c) => c.active !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [categories]);

  // Check if current category has children (subcategories)
  const currentCategoryHasChildren = useMemo(() => {
    if (selectedCategoryId === null) return true; // At root, show categories grid
    if (selectedCategoryId === '__ALL__' || selectedCategoryId === '__UNCATEGORIZED__') return false;
    return activeCategories.some((c) => c.parentId === selectedCategoryId);
  }, [activeCategories, selectedCategoryId]);

  // Subcategories or root categories to display in the visual grid
  const visibleCategories = useMemo(() => {
    if (selectedCategoryId === null) {
      return activeCategories.filter((c) => !c.parentId || c.parentId === 'none');
    }
    if (selectedCategoryId === '__ALL__' || selectedCategoryId === '__UNCATEGORIZED__') {
      return [];
    }
    return activeCategories.filter((c) => c.parentId === selectedCategoryId);
  }, [activeCategories, selectedCategoryId]);

  const isSearchActive = Boolean(searchQuery && searchQuery.trim().length > 0);
  const isAllProductsView = selectedCategoryId === '__ALL__';
  const isUncategorizedView = selectedCategoryId === '__UNCATEGORIZED__';
  const showProductsView = isSearchActive || isAllProductsView || isUncategorizedView || !currentCategoryHasChildren;

  const effectiveQueryCategoryId = useMemo(() => {
    if (isSearchActive) return undefined; // Global search across all products (Requirement 18)
    if (selectedCategoryId === null || isAllProductsView || isUncategorizedView) return undefined;
    return selectedCategoryId;
  }, [isSearchActive, selectedCategoryId, isAllProductsView, isUncategorizedView]);

  const { products, loading: productsLoading } = useProducts({
    pageSize: 200,
    searchTerm: searchQuery,
    categoryId: effectiveQueryCategoryId,
  });

  // Displayed products in leaf or special view
  const displayedProducts = useMemo(() => {
    if (isSearchActive) return products;
    if (isAllProductsView) return products;
    if (isUncategorizedView) {
      return products.filter((p) => !p.categoryId || p.categoryId === '');
    }
    if (selectedCategoryId && !currentCategoryHasChildren) {
      return products.filter((p) => p.categoryId === selectedCategoryId);
    }
    return products;
  }, [products, isSearchActive, isAllProductsView, isUncategorizedView, selectedCategoryId, currentCategoryHasChildren]);

  // In-memory counts for category badges
  const { productCountsMap, uncategorizedCount, subCategoryCountsMap } = useMemo(() => {
    const counts: Record<string, number> = {};
    let uncat = 0;
    for (const p of products) {
      if (p.categoryId) {
        counts[p.categoryId] = (counts[p.categoryId] || 0) + 1;
      } else {
        uncat++;
      }
    }

    const subCounts: Record<string, number> = {};
    for (const c of activeCategories) {
      if (c.parentId && c.parentId !== 'none') {
        subCounts[c.parentId] = (subCounts[c.parentId] || 0) + 1;
      }
    }

    return { productCountsMap: counts, uncategorizedCount: uncat, subCategoryCountsMap: subCounts };
  }, [products, activeCategories]);

  // Navigation handlers
  const handleSelectCategory = (cat: ProductCategory) => {
    setSelectedCategoryId(cat.id);
    setCategoryPath((prev) => [...prev, cat]);
  };

  const handleSelectAllProducts = () => {
    setSelectedCategoryId('__ALL__');
  };

  const handleSelectUncategorized = () => {
    setSelectedCategoryId('__UNCATEGORIZED__');
  };

  const handleGoToRootCategories = () => {
    setSelectedCategoryId(null);
    setCategoryPath([]);
    if (searchQuery) setSearchQuery('');
  };

  const handleBreadcrumbClick = (index: number) => {
    if (searchQuery) setSearchQuery('');
    const target = categoryPath[index];
    setSelectedCategoryId(target.id);
    setCategoryPath((prev) => prev.slice(0, index + 1));
  };

  const handleBackOneLevel = () => {
    if (isSearchActive) {
      setSearchQuery('');
      return;
    }
    if (isAllProductsView || isUncategorizedView) {
      handleGoToRootCategories();
      return;
    }
    if (categoryPath.length <= 1) {
      handleGoToRootCategories();
    } else {
      const newPath = categoryPath.slice(0, -1);
      const parentCat = newPath[newPath.length - 1];
      setCategoryPath(newPath);
      setSelectedCategoryId(parentCat.id);
    }
  };

  const { customers } = useCustomers();

  // Cart Hook
  const {
    items: cartItems,
    setItems: setCartItems,
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
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);

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

  // Responsive, Theme, Fullscreen & Held count states
  const { theme, toggleTheme } = useTheme();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'catalog' | 'cart'>('catalog');
  const [heldSalesCount, setHeldSalesCount] = useState<number>(0);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  const refreshHeldCount = useCallback(async () => {
    const effTenant = tenantId || 'default-tenant';
    const effBranch = branchId || 'main';
    const count = await getHeldSalesCount(effTenant, effBranch);
    setHeldSalesCount(count);
  }, [tenantId, branchId]);

  useEffect(() => {
    const effTenant = tenantId || 'default-tenant';
    const effBranch = branchId || 'main';
    const unsubscribe = subscribeToHeldSales(effTenant, effBranch, (sales) => {
      setHeldSalesCount(sales.length);
    });
    return () => {
      unsubscribe();
    };
  }, [tenantId, branchId]);

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
      if (e.key === 'Escape') {
        if (searchQuery) {
          e.preventDefault();
          setSearchQuery('');
          return;
        }
        if (selectedCategoryId !== null) {
          e.preventDefault();
          handleBackOneLevel();
          return;
        }
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
  }, [cartItems, settings.openDrawerPassword, canManageRegister, searchQuery, selectedCategoryId, handleBackOneLevel]);

  const handleScanBarcode = async (barcode: string) => {
    const raw = (barcode || '').trim();
    if (!raw) return { success: false, error: 'رمز الباركود فارغ' };

    // 1. Instant in-memory check against products loaded in POS (0ms latency)
    const rawNoHyphen = raw.replace(/[-\s_]/g, '');
    const inMemoryMatch = products.find((p) => {
      const pBar = (p.barcode || '').trim();
      const pSku = (p.sku || '').trim();
      if (pBar === raw || (pBar && pBar.replace(/[-\s_]/g, '') === rawNoHyphen)) return true;
      if (pSku && pSku.toUpperCase() === raw.toUpperCase()) return true;
      if (p.id === raw) return true;
      if (p.variants && Array.isArray(p.variants)) {
        return p.variants.some((v) => {
          const vBar = (v.barcode || '').trim();
          const vSku = (v.sku || '').trim();
          return (
            (vBar && (vBar === raw || vBar.replace(/[-\s_]/g, '') === rawNoHyphen)) ||
            (vSku && vSku.toUpperCase() === raw.toUpperCase())
          );
        });
      }
      return false;
    });

    if (inMemoryMatch) {
      if (inMemoryMatch.archived || inMemoryMatch.status === 'archived') {
        toast.error('هذا الصنف مؤرشف ولا يمكن بيعه');
        return { success: false, error: 'هذا الصنف مؤرشف ولا يمكن بيعه' };
      }

      let matchedVariant: ProductVariant | null = null;
      if (inMemoryMatch.hasVariants && inMemoryMatch.variants) {
        matchedVariant =
          inMemoryMatch.variants.find((v) => {
            const vBar = (v.barcode || '').trim();
            const vSku = (v.sku || '').trim();
            return (
              (vBar && (vBar === raw || vBar.replace(/[-\s_]/g, '') === rawNoHyphen)) ||
              (vSku && vSku.toUpperCase() === raw.toUpperCase())
            );
          }) || null;
      }

      addToCart(inMemoryMatch, matchedVariant, 1);
      toast.success(`تمت إضافة ${inMemoryMatch.name} إلى السلة بنجاح`);
      return { success: true, product: inMemoryMatch, variant: matchedVariant || undefined };
    }

    // 2. Comprehensive database lookup (handles URLs, JSONs, variants, and indexes)
    toast.loading(`جاري فحص الرمز: ${raw}...`, { id: 'barcode_scan' });
    const res = await addByBarcode(raw);
    if (res.success) {
      toast.success(`تمت إضافة ${res.product?.name || 'الصنف'} إلى السلة بنجاح`, { id: 'barcode_scan' });
    } else {
      toast.error(res.error || 'تعذر العثور على الصنف', { id: 'barcode_scan' });
    }
    return res;
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
      tenantId: tenantId || 'default-tenant',
      branchId: branchId || 'main',
      cashierId: cashierId || 'كاشير',
      items: cartItems as any,
      customerSnapshot: selectedCustomer || null,
      subtotal: totals.subtotal,
      discount: totals.totalDiscount,
      tax: totals.totalTax,
      total: totals.grandTotal,
      cartDiscountType,
      cartDiscountValue,
    });

    if (res.success) {
      toast.success('تم تعليق السلة بنجاح في السلات المعلقة');
      clearCart();
      await refreshHeldCount();
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
      <div className="h-full max-h-[100dvh] overflow-hidden flex flex-col gap-2 sm:gap-2.5 p-2 sm:p-3 bg-background select-none" dir="rtl">
        {/* Top Control Bar */}
        <header className="shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-card/90 border border-border/80 rounded-2xl shadow-sm">
          {/* Right: Branding, Branch, Cashier info, Scanner indicator, Back to Dashboard */}
          <div className="flex items-center gap-2.5 min-w-0">
            <Button
              variant="outline"
              size="sm"
              className="h-9 px-3 gap-1.5 rounded-xl border-border text-foreground hover:bg-muted font-bold text-xs shrink-0"
              onClick={() => navigate('/')}
              title="الرجوع إلى لوحة التحكم الرئيسية"
            >
              <Home className="w-4 h-4 text-primary" />
              <span className="hidden sm:inline">الرئيسية</span>
            </Button>

            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 shadow-inner">
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-black text-foreground truncate">نقطة البيع (POS)</span>
                  <Badge variant="outline" className="text-[11px] font-bold py-0 h-5 bg-muted/60 text-muted-foreground border-border shrink-0">
                    {currentBranch?.name || 'الفرع الرئيسي'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                  <span className="truncate">الكاشير: <strong className="text-foreground">{cashierName}</strong></span>
                  <span className="hidden sm:inline opacity-40">•</span>
                  <span className="hidden sm:inline-flex items-center gap-1 text-emerald-600 font-bold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    القارئ الآلي نشط
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Left: Action buttons (Shift, Wholesale, Held Carts with Live Badge, Returns, Camera, Drawer, Shortcuts, Theme, Fullscreen) */}
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
            {/* Shift Status Button */}
            <Button
              size="sm"
              variant={isShiftOpen ? 'outline' : 'destructive'}
              className={cn(
                "gap-1.5 font-bold text-xs h-9 px-3 rounded-xl transition-all shadow-sm",
                isShiftOpen 
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20" 
                  : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              )}
              onClick={() => {
                setRegisterModalMode(isShiftOpen ? 'close' : 'open');
                setRegisterModalOpen(true);
              }}
            >
              {isShiftOpen ? (
                <>
                  <Unlock className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">الوردية مفتوحة</span>
                  <span className="sm:hidden">مفتوحة</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>فتح الوردية</span>
                </>
              )}
            </Button>

            {/* Wholesale Pricing Switch */}
            {canWholesale && (
              <Button
                size="sm"
                variant={isWholesale ? 'default' : 'outline'}
                className={cn(
                  "gap-1.5 text-xs h-9 px-3 font-bold rounded-xl transition-all",
                  isWholesale 
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-600/20" 
                    : "border-border text-foreground hover:bg-muted"
                )}
                onClick={() => setIsWholesale(!isWholesale)}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>{isWholesale ? 'جملة' : 'قطاعي'}</span>
              </Button>
            )}

            {/* Held Carts Button with DYNAMIC COUNTER BADGE */}
            <Button
              size="sm"
              variant={heldSalesCount > 0 ? "default" : "outline"}
              className={cn(
                "relative gap-1.5 font-bold text-xs h-9 px-3 rounded-xl transition-all shadow-sm",
                heldSalesCount > 0
                  ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500 shadow-amber-500/25 ring-2 ring-amber-400/30"
                  : "border-border text-foreground hover:bg-muted"
              )}
              onClick={() => setHeldDrawerOpen(true)}
              title="السلات المعلقة مؤقتاً لخدمة عملاء آخرين"
            >
              <Clock className="w-4 h-4" />
              <span>السلات المعلقة</span>
              {heldSalesCount > 0 && (
                <span className="inline-flex items-center justify-center bg-white text-amber-900 font-black text-xs px-1.5 py-0.5 min-w-[20px] h-5 rounded-full shadow-sm animate-pulse mr-1">
                  {heldSalesCount}
                </span>
              )}
            </Button>

            {/* Returns & Exchanges Quick Button */}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-9 px-3 font-bold rounded-xl border-amber-500/30 text-amber-700 hover:bg-amber-500/10"
              onClick={() => navigate('/returns')}
              title="شاشة مرتجعات واستبدال المبيعات"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">المرتجعات</span>
            </Button>

            {/* Mobile Camera Barcode/QR Scanner Button */}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-9 px-3 font-bold rounded-xl bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border-emerald-500/30 shadow-sm"
              onClick={() => setCameraScannerOpen(true)}
              title="مسح باركود أو QR بكاميرا الموبايل"
            >
              <Camera className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">الكاميرا</span>
            </Button>

            {/* Manual Cash Drawer Open Button */}
            {canManageRegister && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs h-9 px-3 font-bold rounded-xl text-green-700 hover:bg-green-500/10 border-green-500/30"
                onClick={handleOpenCashDrawer}
                title="فتح درج الكاشير يدوياً (F9)"
              >
                <Shield className="w-3.5 h-3.5" />
                <span className="hidden md:inline">فتح الدرج (F9)</span>
              </Button>
            )}

            {/* Shortcuts Guide Button */}
            <Button
              size="sm"
              variant="outline"
              className="h-9 w-9 p-0 rounded-xl border-border hover:bg-muted text-muted-foreground"
              onClick={() => setShortcutsModalOpen(true)}
              title="اختصارات لوحة المفاتيح (F2, F6, F8, F9)"
            >
              <Keyboard className="w-4 h-4" />
            </Button>

            {/* Fullscreen Toggle */}
            <Button
              size="sm"
              variant="outline"
              className="hidden md:flex h-9 w-9 p-0 rounded-xl border-border hover:bg-muted text-muted-foreground"
              onClick={toggleFullscreen}
              title={isFullscreen ? "تصغير الشاشة" : "ملء الشاشة بالكامل"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>

            {/* Theme Toggle */}
            <Button
              size="sm"
              variant="outline"
              className="h-9 w-9 p-0 rounded-xl border-border hover:bg-muted text-muted-foreground"
              onClick={toggleTheme}
              title="تبديل المظهر النهاري / الليلي"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-500" />}
            </Button>
          </div>
        </header>

        {/* Mobile View Switcher Tabs (Visible only on small screens) */}
        <div className="lg:hidden shrink-0 grid grid-cols-2 gap-2 bg-card/80 p-1.5 rounded-2xl border border-border/80">
          <button
            type="button"
            className={cn(
              "flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-xs transition-all",
              mobileTab === 'catalog'
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMobileTab('catalog')}
          >
            <BookOpen className="w-4 h-4" />
            <span>المنتجات والبحث ({products.length})</span>
          </button>
          <button
            type="button"
            className={cn(
              "flex items-center justify-center gap-2 py-2.5 rounded-xl font-black text-xs transition-all relative",
              mobileTab === 'cart'
                ? "bg-primary text-primary-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setMobileTab('cart')}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>السلة ({totals.totalItemsCount})</span>
            {totals.grandTotal > 0 && (
              <span className="font-mono font-bold text-[11px] bg-white/20 px-1.5 py-0.5 rounded-md mr-1">
                {number(totals.grandTotal)} ج.م
              </span>
            )}
          </button>
        </div>

        {/* Main Grid: Catalog (7 Cols) + Cart (5 Cols) with FIXED ZERO SCROLL */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-3 overflow-hidden">
          {/* Catalog Section (7 Cols on desktop) */}
          <div className={cn(
            "lg:col-span-7 h-full min-h-0 bg-card/70 backdrop-blur border border-border/80 rounded-2xl p-3 shadow-sm flex flex-col gap-2.5 overflow-hidden",
            mobileTab === 'catalog' ? "flex" : "hidden lg:flex"
          )}>
            {/* Search and Category Bar */}
            <div className="shrink-0 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute right-3.5 top-3.5 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="ابحث بالاسم أو الباركود أو SKU أو رقم ISBN... (F2)"
                    className="pr-10 pl-16 h-11 bg-background/90 text-sm font-semibold rounded-xl border-2 border-border/80 focus:border-primary shadow-sm"
                  />
                  {searchQuery && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute left-8 top-1.5 h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-lg"
                      onClick={() => setSearchQuery('')}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute left-1 top-1.5 h-8 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 rounded-lg flex items-center gap-1 font-bold text-xs"
                    onClick={() => setCameraScannerOpen(true)}
                    title="مسح بالكاميرا"
                  >
                    <Camera className="w-4 h-4" />
                  </Button>
                </div>

                <Button
                  type="button"
                  size="sm"
                  className="h-11 px-4 bg-gradient-to-l from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black rounded-xl flex items-center gap-2 shadow-sm text-xs shrink-0"
                  onClick={() => setCameraScannerOpen(true)}
                >
                  <QrCode className="w-4 h-4" />
                  <span className="hidden sm:inline">مسح بالكاميرا</span>
                  <span className="sm:hidden">كاميرا</span>
                </Button>
              </div>

              {/* Category Breadcrumb Navigation Context */}
              <POSCategoryBreadcrumb
                categoryPath={categoryPath}
                isAllProducts={isAllProductsView}
                isUncategorized={isUncategorizedView}
                searchQuery={searchQuery}
                searchResultsCount={displayedProducts.length}
                onGoToRoot={handleGoToRootCategories}
                onGoToBreadcrumbIndex={handleBreadcrumbClick}
                onBackOneLevel={handleBackOneLevel}
                onClearSearch={() => setSearchQuery('')}
              />
            </div>

            {/* Catalog Main Body: Either Visual Categories Grid OR Products View */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              {!showProductsView ? (
                /* 1. Category-First Visual Grid */
                <CategoryVisualGrid
                  categories={visibleCategories}
                  loading={categoriesLoading}
                  totalProductsCount={products.length}
                  uncategorizedCount={uncategorizedCount}
                  productCountsMap={productCountsMap}
                  subCategoryCountsMap={subCategoryCountsMap}
                  showAllProductsCard={selectedCategoryId === null}
                  showUncategorizedCard={selectedCategoryId === null && uncategorizedCount > 0}
                  onSelectCategory={handleSelectCategory}
                  onSelectAllProducts={handleSelectAllProducts}
                  onSelectUncategorized={handleSelectUncategorized}
                  onOpenManageCategories={() => setCategoryManageOpen(true)}
                />
              ) : (
                /* 2. Products View (for selected category, search results, or all products) */
                productsLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-2.5 pb-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-36 rounded-xl border border-border/60 bg-card p-3 animate-pulse flex flex-col justify-between">
                        <div className="h-4 bg-muted rounded w-1/3" />
                        <div className="space-y-1">
                          <div className="h-4 bg-muted rounded w-3/4" />
                          <div className="h-3 bg-muted rounded w-1/2" />
                        </div>
                        <div className="h-5 bg-muted rounded w-1/3 mt-2" />
                      </div>
                    ))}
                  </div>
                ) : displayedProducts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center min-h-[260px] text-muted-foreground text-sm gap-3 p-6 text-center my-auto">
                    <BookOpen className="w-10 h-10 opacity-30" />
                    <span className="font-bold text-foreground">
                      {isSearchActive ? 'لا توجد أصناف مطابقة للبحث' : 'لا توجد أصناف داخل هذا التصنيف'}
                    </span>
                    {isSearchActive ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSearchQuery('')}
                        className="gap-1.5 font-bold rounded-xl"
                      >
                        مسح كلمة البحث
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleBackOneLevel}
                        className="gap-1.5 font-bold rounded-xl"
                      >
                        <ArrowRight className="w-4 h-4" />
                        العودة للتصنيفات
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-2.5 pb-2">
                    {displayedProducts.map((prod) => {
                      const displayPrice = isWholesale
                        ? (prod.wholesalePrice || prod.sellingPrice)
                        : prod.sellingPrice;
                      const isOutOfStock = prod.stockQuantity !== undefined && prod.stockQuantity <= 0;
                      const isLowStock = !isOutOfStock && (prod.isLowStock || (prod.minStock !== undefined && prod.stockQuantity !== undefined && prod.stockQuantity <= prod.minStock));

                      return (
                        <Card
                          key={prod.id}
                          className={cn(
                            "cursor-pointer hover:border-primary/80 hover:shadow-md transition-all duration-200 bg-card/90 border-border/80 overflow-hidden flex flex-col justify-between active:scale-[0.98] rounded-xl group relative",
                            isOutOfStock && "opacity-75 bg-muted/30"
                          )}
                          onClick={() => handleProductCardClick(prod)}
                        >
                          <CardContent className="p-3 space-y-2 flex flex-col justify-between h-full">
                            <div>
                              <div className="flex justify-between items-start gap-1">
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-bold bg-muted">
                                  {prod.type === 'book' ? 'كتاب' : 'أدوات'}
                                </Badge>
                                <div className="flex items-center gap-1">
                                  {prod.hasVariants && (
                                    <Badge variant="outline" className="text-[9px] px-1 bg-indigo-500/10 text-indigo-600 border-indigo-500/30 font-bold">
                                      متغيرات
                                    </Badge>
                                  )}
                                  {isOutOfStock ? (
                                    <Badge variant="destructive" className="text-[9px] px-1 font-bold">
                                      نفذت الكمية
                                    </Badge>
                                  ) : isLowStock ? (
                                    <Badge variant="outline" className="text-[9px] px-1 bg-amber-500/10 text-amber-600 border-amber-500/30 font-bold">
                                      مخزون منخفض
                                    </Badge>
                                  ) : null}
                                </div>
                              </div>
                              <h3 className="font-bold text-xs sm:text-sm text-foreground line-clamp-2 mt-1.5 group-hover:text-primary transition-colors">
                                {prod.name}
                              </h3>
                              {prod.author && (
                                <p className="text-[10px] text-muted-foreground truncate">{prod.author}</p>
                              )}
                            </div>

                            <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                              <div className="flex flex-col">
                                <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[70px]">
                                  {prod.sku}
                                </span>
                                {prod.stockQuantity !== undefined && (
                                  <span className={cn(
                                    "text-[9px] font-bold",
                                    isOutOfStock ? "text-destructive" : isLowStock ? "text-amber-600" : "text-muted-foreground"
                                  )}>
                                    {prod.stockQuantity} متاح
                                  </span>
                                )}
                              </div>
                              <span className="font-black text-sm sm:text-base text-primary font-mono">
                                {number(displayPrice)} ج.م
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )
              )}
            </div>

            {/* Mobile Floating Bottom Bar for Fast Checkout from Catalog */}
            <div className="lg:hidden shrink-0 pt-2 border-t border-border flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-black text-xs px-2 py-1 bg-primary/10 text-primary">
                  {totals.totalItemsCount} قطعة
                </Badge>
                <span className="font-black text-base text-foreground font-mono">
                  {number(totals.grandTotal)} ج.م
                </span>
              </div>
              <Button
                size="sm"
                className="h-10 px-4 font-black text-xs gap-1.5 bg-primary text-primary-foreground shadow-md rounded-xl"
                onClick={() => setMobileTab('cart')}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>عرض السلة والدفع</span>
              </Button>
            </div>
          </div>

          {/* Cart Section (5 Cols on desktop) */}
          <div className={cn(
            "lg:col-span-5 h-full min-h-0 bg-card/85 backdrop-blur border border-border/80 rounded-2xl p-3 shadow-sm flex flex-col gap-2.5 overflow-hidden",
            mobileTab === 'cart' ? "flex" : "hidden lg:flex"
          )}>
            {/* Cart Header */}
            <div className="shrink-0 flex items-center justify-between pb-2 border-b border-border/80">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-primary" />
                <h2 className="font-black text-sm text-foreground">سلة المشتريات</h2>
                <Badge variant="secondary" className="text-xs font-black px-2 py-0.5 bg-primary/10 text-primary">
                  {totals.totalItemsCount} قطعة
                </Badge>
              </div>

              {/* Customer Selector & Clear Cart */}
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
                  <SelectTrigger className="h-8 text-xs w-36 sm:w-44 font-semibold rounded-xl">
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
                  <div className="hidden xl:flex items-center gap-1">
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
                    className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 rounded-xl"
                    onClick={clearCart}
                    title="تفريغ السلة بالكامل"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            {/* Cart Items List: Scrolls independently */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
              {cartItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[160px] text-muted-foreground text-xs gap-2 py-8">
                  <div className="w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center">
                    <ShoppingBag className="w-6 h-6 opacity-40" />
                  </div>
                  <span className="font-bold">السلة فارغة</span>
                  <span className="text-[11px] text-muted-foreground">امسح باركود بالماسح أو اضغط على صنف لإضافته</span>
                </div>
              ) : (
                cartItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-card rounded-xl border border-border/80 flex flex-col gap-2 hover:border-primary/40 transition-colors shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-black text-xs sm:text-sm text-foreground truncate block">{item.productName}</span>
                        {item.variantName && (
                          <span className="text-[11px] text-muted-foreground font-medium">({item.variantName})</span>
                        )}
                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                          {item.sku} {item.conversionFactor > 1 ? `| عبوة (${item.conversionFactor} قطعة)` : ''}
                        </div>
                      </div>
                      <div className="text-left shrink-0">
                        <div className="font-black text-sm sm:text-base text-foreground font-mono">
                          {number(item.lineTotal)} ج.م
                        </div>
                        {item.discountAmount > 0 && (
                          <div className="text-[10px] text-red-600 font-bold">خصم: -{item.discountAmount}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border/40">
                      {/* Quantity Buttons - Larger touch-friendly size */}
                      <div className="flex items-center gap-1 bg-muted/50 rounded-xl border border-border/70 p-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg font-bold hover:bg-background shadow-xs text-foreground"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          aria-label="إنقاص الكمية"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <span className="w-9 text-center text-xs sm:text-sm font-black font-mono">{item.quantity}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg font-bold hover:bg-background shadow-xs text-foreground"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          aria-label="زيادة الكمية"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      {/* Price / Discount Edit & Remove */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-muted-foreground font-mono">
                          @{number(item.unitSellingPrice)}
                        </span>
                        {(canOverridePrice || canDiscount) && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted"
                            onClick={() => handleOpenEditLine(item)}
                            title="تعديل السعر أو الخصم"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-xl text-destructive hover:bg-destructive/10"
                          onClick={() => removeItem(item.id)}
                          title="حذف من السلة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Totals & Pay Section: Pinned to bottom of cart */}
            <div className="shrink-0 space-y-2 pt-2 border-t border-border bg-muted/30 rounded-xl p-3">
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-muted-foreground font-medium">
                  <span>المجموع الفرعي:</span>
                  <span className="font-bold font-mono">{number(totals.subtotal)} ج.م</span>
                </div>

                {/* Cart Discount Control Row */}
                <div className="flex items-center justify-between py-1 border-y border-dashed border-border/70 my-1">
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-primary" />
                    <span className="font-bold text-foreground">خصم الفاتورة:</span>
                    {totals.cartDiscount > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4 bg-primary/10 text-primary border border-primary/20 font-bold">
                        {cartDiscountType === 'percentage' ? `${cartDiscountValue}%` : 'مبلغ ثابت'}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {totals.cartDiscount > 0 ? (
                      <>
                        <span className="font-black text-red-600 font-mono">-{number(totals.cartDiscount)} ج.م</span>
                        {canDiscount && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground rounded-lg"
                            onClick={handleOpenDiscountModal}
                            title="تعديل الخصم"
                          >
                            <Edit3 className="w-3 h-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:bg-destructive/10 rounded-lg"
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
                          className="h-7 text-xs px-2.5 gap-1 border-dashed text-primary hover:text-primary hover:bg-primary/10 rounded-lg font-bold"
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
                    <span className="font-bold text-red-600 font-mono">-{number(totals.lineDiscounts)} ج.م</span>
                  </div>
                )}

                {totals.totalDiscount > 0 && (
                  <div className="flex justify-between text-red-600 font-black bg-red-500/10 dark:bg-red-950/20 px-2 py-0.5 rounded-lg">
                    <span>إجمالي الخصم المطبق:</span>
                    <span className="font-mono">-{number(totals.totalDiscount)} ج.م</span>
                  </div>
                )}

                {totals.totalServiceCharge > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>رسوم الخدمة ({totals.serviceChargeRate}%):</span>
                    <span className="font-bold font-mono">
                      {totals.serviceChargeIncluded ? '(شاملة) ' : '+'}{number(totals.totalServiceCharge)} ج.م
                    </span>
                  </div>
                )}

                {totals.totalTax > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>ضريبة القيمة المضافة ({totals.taxRate}%):</span>
                    <span className="font-bold font-mono">
                      {totals.taxIncluded ? '(شاملة) ' : '+'}{number(totals.totalTax)} ج.م
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-baseline pt-2 border-t border-border/80">
                  <span className="text-sm sm:text-base font-black text-foreground">الإجمالي المطلوب:</span>
                  <span className="text-2xl sm:text-3xl font-black text-primary font-mono tracking-tight">
                    {number(totals.grandTotal)} ج.م
                  </span>
                </div>
              </div>

              {/* Checkout & Hold Action Buttons - LARGER, CLEARER, EASIER TO PRESS */}
              <div className="grid grid-cols-4 gap-2 pt-1">
                <Button
                  variant="outline"
                  className="col-span-1 h-12 text-xs sm:text-sm gap-1.5 font-bold rounded-xl border-amber-500/40 text-amber-700 hover:bg-amber-500/10"
                  onClick={handleHoldCart}
                  disabled={cartItems.length === 0}
                  title="تعليق السلة (F6)"
                >
                  <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                  <span>تعليق (F6)</span>
                </Button>

                <Button
                  className="col-span-3 h-12 text-base sm:text-lg font-black gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25 rounded-xl transition-all"
                  onClick={handleOpenPayment}
                  disabled={cartItems.length === 0}
                >
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>دفع وإنهاء الفاتورة (F8)</span>
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
                  onFocus={(e) => { if (e.target.value === '0') e.target.value = ''; else e.target.select(); }}
                  placeholder="0.00"
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
                  onFocus={(e) => { if (e.target.value === '0') e.target.value = ''; else e.target.select(); }}
                  placeholder={editDiscountType === 'percentage' ? 'النسبة المئوية %' : '0.00'}
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
                      className="h-7 text-xs font-bold"
                      onClick={() => setDiscountModalValue(String(pct))}
                    >
                      %{pct}
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
                  value={discountModalValue === '0' ? '' : discountModalValue}
                  onChange={(e) => setDiscountModalValue(e.target.value)}
                  onFocus={(e) => { if (e.target.value === '0') e.target.value = ''; else e.target.select(); }}
                  placeholder="0.00"
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
        onOpenChange={(open) => {
          setHeldDrawerOpen(open);
          if (!open) refreshHeldCount();
        }}
        tenantId={tenantId}
        branchId={branchId}
        onCountChange={setHeldSalesCount}
        onResumeSale={(held) => {
          // Restore items directly into active cart
          if (held.items && Array.isArray(held.items) && held.items.length > 0) {
            setCartItems(held.items);
          }
          if (held.customerSnapshot) {
            setSelectedCustomer(held.customerSnapshot);
          }
          if (held.cartDiscountType && typeof held.cartDiscountValue === 'number' && held.cartDiscountValue > 0) {
            applyCartDiscount(held.cartDiscountType, held.cartDiscountValue);
          }
          refreshHeldCount();
          toast.success(`تمت استعادة السلة المعلقة (${held.items?.length || 0} أصناف) بنجاح`);
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

      {/* Mobile Floating Camera Scanner Quick Trigger (Bottom-left corner on mobile screens) */}
      <div className="fixed bottom-20 left-4 z-40 lg:hidden">
        <Button
          type="button"
          size="lg"
          className="h-14 w-14 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white shadow-[0_8px_25px_rgba(16,185,129,0.5)] border-2 border-white/20 flex items-center justify-center p-0 transition-transform active:scale-95"
          onClick={() => setCameraScannerOpen(true)}
          title="مسح باركود أو QR بكاميرا الموبايل"
        >
          <Camera className="w-6 h-6" />
        </Button>
      </div>

      {/* Mobile Camera Barcode & QR Scanner Dialog */}
      <MobileScannerModal
        open={cameraScannerOpen}
        onOpenChange={setCameraScannerOpen}
        onScan={handleScanBarcode}
        cartTotalCount={cartItems.reduce((acc, i) => acc + i.quantity, 0)}
        availableProducts={products}
      />

      {/* Category Management Dialog */}
      <CategoryManageDialog
        open={categoryManageOpen}
        onOpenChange={setCategoryManageOpen}
      />
    </MainLayout>
  );
}
