/**
 * Barcode Scanner Test & Lookup Dialog
 * Captures keyboard barcode scanner input, performs tenant lookup,
 * and allows quick navigation or creating a new product with the scanned code.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScanBarcode, CheckCircle2, AlertCircle, Plus, ArrowRight } from 'lucide-react';
import type { Product, ProductVariant } from '@/types/retail.types';
import { findProductOrVariantByBarcode } from '@/services/products/products.repository';
import { useAppStore } from '@/lib/store';

interface BarcodeScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectProduct?: (product: Product, variant?: ProductVariant) => void;
  onCreateWithBarcode?: (barcode: string) => void;
}

export function BarcodeScanDialog({
  open,
  onOpenChange,
  onSelectProduct,
  onCreateWithBarcode,
}: BarcodeScanDialogProps) {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const tenantId = currentTenant?.id || '';

  const inputRef = useRef<HTMLInputElement>(null);
  const [scannedCode, setScannedCode] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    product: Product;
    variant?: ProductVariant;
  } | null>(null);
  const [searchedCode, setSearchedCode] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Auto focus input on open
  useEffect(() => {
    if (open) {
      setScannedCode('');
      setSearchResult(null);
      setSearchedCode(null);
      setNotFound(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [open]);

  const handleLookup = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed || !tenantId) return;

    setIsSearching(true);
    setSearchedCode(trimmed);
    setNotFound(false);
    setSearchResult(null);

    try {
      const res = await findProductOrVariantByBarcode(tenantId, trimmed);
      if (res) {
        setSearchResult(res);
        setNotFound(false);
      } else {
        setNotFound(true);
      }
    } catch (err) {
      console.error('Barcode lookup error:', err);
      setNotFound(true);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLookup(scannedCode);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <ScanBarcode className="w-5 h-5 text-primary" />
            فحص ومسح الباركود
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              مرر قارئ الباركود على المنتج، أو اكتب الرمز واضغط Enter:
            </p>
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={scannedCode}
                onChange={(e) => setScannedCode(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="امسح أو اكتب الباركود..."
                className="font-mono text-base font-bold tracking-wider"
              />
              <Button
                type="button"
                onClick={() => handleLookup(scannedCode)}
                disabled={!scannedCode.trim() || isSearching}
              >
                {isSearching ? 'جاري الفحص...' : 'بحث'}
              </Button>
            </div>
          </div>

          {/* Results Display */}
          {searchResult && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span className="text-xs font-bold text-green-700">تم العثور على الصنف</span>
                  </div>
                  <h4 className="text-base font-bold text-foreground mt-1">
                    {searchResult.product.name}
                    {searchResult.variant && (
                      <span className="text-primary mr-1">({searchResult.variant.name})</span>
                    )}
                  </h4>
                </div>
                <Badge variant="outline" className="font-mono">
                  {searchResult.variant?.sku || searchResult.product.sku}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm bg-background/80 p-2.5 rounded-lg border border-border/50">
                <div>
                  <span className="text-xs text-muted-foreground">سعر البيع قطاعي:</span>
                  <p className="font-bold text-primary">
                    {(searchResult.variant?.sellingPrice ?? searchResult.product.sellingPrice).toFixed(2)} ج.م
                  </p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">سعر الجملة:</span>
                  <p className="font-bold">
                    {(searchResult.variant?.wholesalePrice ?? searchResult.product.wholesalePrice ?? searchResult.product.sellingPrice).toFixed(2)} ج.م
                  </p>
                </div>
              </div>

              {onSelectProduct && (
                <Button
                  type="button"
                  className="w-full gap-2 font-bold"
                  onClick={() => {
                    onSelectProduct(searchResult.product, searchResult.variant);
                    onOpenChange(false);
                  }}
                >
                  <ArrowRight className="w-4 h-4" />
                  عرض تفاصيل المنتج
                </Button>
              )}
            </div>
          )}

          {notFound && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 space-y-3 text-center">
              <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
              <div>
                <p className="text-sm font-bold text-foreground">الباركود غير مسجل في النظام</p>
                <p className="text-xs font-mono text-muted-foreground mt-1">{searchedCode}</p>
              </div>

              {onCreateWithBarcode && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 font-bold border-amber-500/40 text-amber-700 hover:bg-amber-500/10"
                  onClick={() => {
                    onCreateWithBarcode(searchedCode || scannedCode);
                    onOpenChange(false);
                  }}
                >
                  <Plus className="w-4 h-4" />
                  إضافة منتج جديد بهذا الباركود
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
