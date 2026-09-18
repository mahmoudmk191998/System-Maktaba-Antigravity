import { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useAppStore } from '@/lib/store';
import type { Product, ProductVariant, UnitDefinition } from '@/types/retail.types';
import { calculateItemPrice } from '@/services/pricing/pricingEngine';
import { getBarcodeIndexDocId } from '@/services/products/products.repository';

export interface POSCartItem {
  id: string; // unique item line id e.g. prodId_variantId
  productId: string;
  variantId?: string | null;
  product: Product;
  variant?: ProductVariant | null;
  productName: string;
  variantName?: string | null;
  sku: string;
  barcode?: string;
  categoryName?: string;
  brandName?: string;
  quantity: number;           // Quantity in input unit
  inputUnitId: string;
  conversionFactor: number;
  allowFraction: boolean;
  baseQuantity: number;       // quantity * conversionFactor
  unitSellingPrice: number;
  originalUnitPrice: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  priceSource: string;
  minimumSellingPrice: number;
  availableStock?: number;
}

export function usePOSCart(tenantId: string, locationId: string, initialWholesale = false) {
  const settings = useAppStore((state) => state.settings);
  const [items, setItems] = useState<POSCartItem[]>([]);
  const [isWholesale, setIsWholesale] = useState(initialWholesale);
  const [cartDiscountType, setCartDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [cartDiscountValue, setCartDiscountValue] = useState<number>(0);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`pos_cart_${tenantId}_${locationId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setItems(parsed);
        }
      }
    } catch {
      // Ignore local storage parse error
    }
  }, [tenantId, locationId]);

  // Persist draft to localStorage on change
  useEffect(() => {
    try {
      if (tenantId && locationId) {
        if (items.length > 0) {
          localStorage.setItem(`pos_cart_${tenantId}_${locationId}`, JSON.stringify(items));
        } else {
          localStorage.removeItem(`pos_cart_${tenantId}_${locationId}`);
        }
      }
    } catch {
      // Ignore storage error
    }
  }, [items, tenantId, locationId]);

  // Recalculate line pricing linked to settings
  const recalculateLine = useCallback(
    (
      product: Product,
      variant: ProductVariant | null | undefined,
      quantity: number,
      unitPriceOverride?: number,
      manualDiscountAmt = 0,
      customUnit?: UnitDefinition
    ): POSCartItem => {
      const conv = customUnit?.conversionFactor || 1;
      const allowFrac = customUnit?.allowFraction ?? (product.baseUnitId === 'meter' || product.baseUnitId === 'kg');
      const baseQty = quantity * conv;

      const pricing = calculateItemPrice({
        product,
        variant,
        quantity,
        isWholesale,
        manualDiscountAmount: manualDiscountAmt,
      });

      const effectiveUnitPrice = unitPriceOverride !== undefined ? unitPriceOverride : (pricing.appliedUnitPrice * conv);
      const subtotal = Math.round(effectiveUnitPrice * quantity * 100) / 100;
      const discount = Math.min(subtotal, Math.round(manualDiscountAmt * 100) / 100);
      const taxable = Math.max(0, subtotal - discount);

      // Tax is ONLY applied if tax is explicitly enabled in Settings
      const isTaxEnabled = Boolean(settings.taxEnabled);
      let taxRate = 0;

      if (isTaxEnabled) {
        const defaultTaxRate = (settings.taxRate !== undefined && settings.taxRate !== null)
          ? (settings.taxRate > 1 ? settings.taxRate / 100 : settings.taxRate)
          : 0.14;

        taxRate = defaultTaxRate;
        if (product.taxRate !== undefined && product.taxRate !== null && !isNaN(product.taxRate)) {
          taxRate = product.taxRate > 1 ? product.taxRate / 100 : product.taxRate;
        }
      }

      const isTaxIncluded = !!settings.taxIncluded;
      let taxAmount = 0;
      let lineTotal = 0;

      if (isTaxEnabled && taxRate > 0) {
        if (isTaxIncluded) {
          taxAmount = Math.round((taxable - (taxable / (1 + taxRate))) * 100) / 100;
          lineTotal = taxable;
        } else {
          taxAmount = Math.round(taxable * taxRate * 100) / 100;
          lineTotal = Math.round((taxable + taxAmount) * 100) / 100;
        }
      } else {
        lineTotal = taxable;
      }

      const lineKey = `${product.id}_${variant?.id || 'base'}_${customUnit?.id || 'base'}`;

      return {
        id: lineKey,
        productId: product.id,
        variantId: variant?.id || null,
        product,
        variant,
        productName: product.name,
        variantName: variant ? Object.values(variant.attributes || {}).join(' / ') || variant.sku : null,
        sku: variant?.sku || product.sku,
        barcode: variant?.barcode || product.barcode || '',
        categoryName: product.categoryId,
        brandName: product.brandId,
        quantity,
        inputUnitId: customUnit?.id || product.baseUnitId,
        conversionFactor: conv,
        allowFraction: allowFrac,
        baseQuantity: baseQty,
        unitSellingPrice: effectiveUnitPrice,
        originalUnitPrice: pricing.baseUnitSellingPrice * conv,
        discountAmount: discount,
        taxRate,
        taxAmount,
        lineTotal,
        priceSource: unitPriceOverride !== undefined ? 'manual_override' : (isWholesale ? 'wholesale' : 'retail'),
        minimumSellingPrice: (product.minimumSellingPrice || 0) * conv,
      };
    },
    [isWholesale, settings.taxEnabled, settings.taxRate, settings.taxIncluded]
  );

  // Add product to cart
  const addToCart = useCallback(
    (product: Product, variant?: ProductVariant | null, inputQuantity = 1, unit?: UnitDefinition) => {
      setItems((prev) => {
        const lineKey = `${product.id}_${variant?.id || 'base'}_${unit?.id || 'base'}`;
        const existingIdx = prev.findIndex((i) => i.id === lineKey);

        if (existingIdx >= 0) {
          const existing = prev[existingIdx];
          const newQty = existing.quantity + inputQuantity;
          const updatedLine = recalculateLine(
            product,
            variant,
            newQty,
            existing.priceSource === 'manual_override' ? existing.unitSellingPrice : undefined,
            existing.discountAmount,
            unit
          );
          const copy = [...prev];
          copy[existingIdx] = updatedLine;
          return copy;
        } else {
          const newLine = recalculateLine(product, variant, inputQuantity, undefined, 0, unit);
          return [...prev, newLine];
        }
      });
    },
    [recalculateLine]
  );

  // Direct fast barcode scan lookup
  const addByBarcode = useCallback(
    async (barcode: string): Promise<{ success: boolean; error?: string }> => {
      if (!barcode || !tenantId) return { success: false, error: 'الباركود غير صالح' };
      const normalizedBarcode = barcode.trim();

      try {
        // Fast direct lookup via index document
        const bRef = doc(db, 'product_barcodes', getBarcodeIndexDocId(tenantId, normalizedBarcode));
        const bSnap = await getDoc(bRef);

        let productId: string | null = null;
        let variantId: string | null = null;

        if (bSnap.exists()) {
          const bData = bSnap.data();
          if (bData.archived) {
            return { success: false, error: 'هذا الباركود يتبع صنفاً مؤرشفاً' };
          }
          productId = bData.productId;
          variantId = bData.variantId || null;
        }

        if (!productId) {
          return { success: false, error: `لم يتم العثور على صنف بالباركود: ${normalizedBarcode}` };
        }

        // Fetch product document
        const pRef = doc(db, 'products', productId);
        const pSnap = await getDoc(pRef);
        if (!pSnap.exists()) {
          return { success: false, error: 'بيانات الصنف غير موجودة في قاعدة البيانات' };
        }

        const prod = { id: pSnap.id, ...pSnap.data() } as Product;
        if (prod.archived || prod.status === 'archived') {
          return { success: false, error: 'الصنف مؤرشف ولا يمكن بيعه' };
        }

        let matchedVariant: ProductVariant | null = null;
        if (variantId && prod.variants) {
          matchedVariant = prod.variants.find((v) => v.id === variantId) || null;
        }

        addToCart(prod, matchedVariant, 1);
        return { success: true };
      } catch (err: any) {
        console.error('Barcode scan error:', err);
        return { success: false, error: err.message || 'خطأ أثناء فحص الباركود' };
      }
    },
    [tenantId, addToCart]
  );

  // Update quantity
  const updateQuantity = useCallback(
    (lineId: string, quantity: number) => {
      setItems((prev) => {
        if (quantity <= 0) {
          return prev.filter((i) => i.id !== lineId);
        }
        return prev.map((item) => {
          if (item.id !== lineId) return item;
          const roundedQty = item.allowFraction ? Math.round(quantity * 1000) / 1000 : Math.round(quantity);
          return recalculateLine(
            item.product,
            item.variant,
            roundedQty,
            item.priceSource === 'manual_override' ? item.unitSellingPrice : undefined,
            item.discountAmount
          );
        });
      });
    },
    [recalculateLine]
  );

  // Remove item
  const removeItem = useCallback((lineId: string) => {
    setItems((prev) => prev.filter((i) => i.id !== lineId));
  }, []);

  // Set line discount
  const setLineDiscount = useCallback(
    (lineId: string, discountAmount: number) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== lineId) return item;
          return recalculateLine(
            item.product,
            item.variant,
            item.quantity,
            item.priceSource === 'manual_override' ? item.unitSellingPrice : undefined,
            Math.max(0, discountAmount)
          );
        })
      );
    },
    [recalculateLine]
  );

  // Override price
  const overrideUnitPrice = useCallback(
    (lineId: string, newUnitPrice: number) => {
      setItems((prev) =>
        prev.map((item) => {
          if (item.id !== lineId) return item;
          return recalculateLine(
            item.product,
            item.variant,
            item.quantity,
            Math.max(0, newUnitPrice),
            item.discountAmount
          );
        })
      );
    },
    [recalculateLine]
  );

  // Clear cart
  const clearCart = useCallback(() => {
    setItems([]);
    setCartDiscountType('fixed');
    setCartDiscountValue(0);
    setSelectedCustomer(null);
  }, []);

  // Change Wholesale Mode and recalculate all lines
  const toggleWholesale = useCallback(
    (enable: boolean) => {
      setIsWholesale(enable);
      setItems((prev) =>
        prev.map((item) =>
          recalculateLine(
            item.product,
            item.variant,
            item.quantity,
            undefined,
            item.discountAmount
          )
        )
      );
    },
    [recalculateLine]
  );

  // Re-calculate cart lines when settings change
  useEffect(() => {
    setItems((prev) => {
      if (prev.length === 0) return prev;
      return prev.map((item) =>
        recalculateLine(
          item.product,
          item.variant,
          item.quantity,
          item.priceSource === 'manual_override' ? item.unitSellingPrice : undefined,
          item.discountAmount
        )
      );
    });
  }, [settings.taxEnabled, settings.taxRate, settings.taxIncluded, recalculateLine]);

  // Totals calculations linked to Settings
  const totals = useMemo(() => {
    const subtotal = Math.round(items.reduce((acc, i) => acc + (i.unitSellingPrice * i.quantity), 0) * 100) / 100;
    const lineDiscounts = Math.round(items.reduce((acc, i) => acc + i.discountAmount, 0) * 100) / 100;
    
    let effectiveCartDiscount = 0;
    if (cartDiscountType === 'percentage') {
      const clampedPct = Math.min(100, Math.max(0, cartDiscountValue));
      effectiveCartDiscount = Math.round((subtotal * (clampedPct / 100)) * 100) / 100;
    } else {
      effectiveCartDiscount = Math.min(subtotal, Math.max(0, cartDiscountValue));
    }

    const totalDiscount = Math.round((lineDiscounts + effectiveCartDiscount) * 100) / 100;
    const taxableSubtotal = Math.max(0, subtotal - totalDiscount);

    // 1. Service Charge linked to settings
    const isServiceEnabled = Boolean(settings.serviceChargeEnabled);
    const serviceChargeRate = isServiceEnabled ? (Number(settings.serviceChargeRate) || 0) : 0;
    const serviceRateDec = serviceChargeRate > 1 ? serviceChargeRate / 100 : serviceChargeRate;
    let totalServiceCharge = 0;
    if (isServiceEnabled && serviceRateDec > 0) {
      if (settings.serviceChargeIncluded) {
        totalServiceCharge = Math.round((taxableSubtotal - (taxableSubtotal / (1 + serviceRateDec))) * 100) / 100;
      } else {
        totalServiceCharge = Math.round(taxableSubtotal * serviceRateDec * 100) / 100;
      }
    }

    // 2. Tax linked to settings
    const isTaxEnabled = Boolean(settings.taxEnabled);
    const totalTax = isTaxEnabled ? Math.round(items.reduce((acc, i) => acc + i.taxAmount, 0) * 100) / 100 : 0;

    // 3. Grand Total Calculation
    const taxToAdd = settings.taxIncluded ? 0 : totalTax;
    const serviceToAdd = settings.serviceChargeIncluded ? 0 : totalServiceCharge;
    const grandTotal = Math.max(0, Math.round((subtotal - totalDiscount + taxToAdd + serviceToAdd) * 100) / 100);
    const totalItemsCount = items.reduce((acc, i) => acc + i.quantity, 0);

    return {
      subtotal,
      lineDiscounts,
      cartDiscount: effectiveCartDiscount,
      cartDiscountType,
      cartDiscountValue,
      effectiveCartDiscount,
      totalDiscount,
      taxEnabled: isTaxEnabled,
      taxRate: isTaxEnabled ? (settings.taxRate ?? 14) : 0,
      totalTax,
      taxIncluded: !!settings.taxIncluded,
      serviceChargeEnabled: isServiceEnabled,
      serviceChargeRate,
      totalServiceCharge,
      serviceChargeIncluded: !!settings.serviceChargeIncluded,
      grandTotal,
      totalItemsCount,
    };
  }, [
    items,
    cartDiscountType,
    cartDiscountValue,
    settings.taxEnabled,
    settings.taxRate,
    settings.taxIncluded,
    settings.serviceChargeEnabled,
    settings.serviceChargeRate,
    settings.serviceChargeIncluded,
  ]);

  const applyCartDiscount = useCallback((type: 'fixed' | 'percentage', value: number) => {
    setCartDiscountType(type);
    setCartDiscountValue(Math.max(0, value));
  }, []);

  const clearCartDiscount = useCallback(() => {
    setCartDiscountType('fixed');
    setCartDiscountValue(0);
  }, []);

  const setCartDiscount = useCallback((amountOrUpdater: number | ((prev: number) => number)) => {
    setCartDiscountType('fixed');
    if (typeof amountOrUpdater === 'function') {
      setCartDiscountValue((prev) => Math.max(0, amountOrUpdater(prev)));
    } else {
      setCartDiscountValue(Math.max(0, amountOrUpdater));
    }
  }, []);

  return {
    items,
    setItems,
    isWholesale,
    setIsWholesale: toggleWholesale,
    cartDiscount: totals.cartDiscount,
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
  };
}
