/**
 * Barcode Label Printing Dialog
 * Supports real machine-readable SVG barcodes via JsBarcode, custom label sizes,
 * store name, price, and SKU display with direct browser printing.
 */

import React, { useState, useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Printer, X, Tag } from 'lucide-react';
import type { Product, ProductVariant } from '@/types/retail.types';
import { useAppStore } from '@/lib/store';

interface BarcodePrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  variant?: ProductVariant | null;
}

export function BarcodePrintDialog({
  open,
  onOpenChange,
  product,
  variant,
}: BarcodePrintDialogProps) {
  const currentTenant = useAppStore((state) => state.currentTenant);
  const printAreaRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [quantity, setQuantity] = useState(1);
  const [storeName, setStoreName] = useState(currentTenant?.name || 'مكتبة ألوان');
  const [showStoreName, setShowStoreName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showSku, setShowSku] = useState(true);

  const activeName = variant ? `${product?.name} (${variant.name})` : (product?.name || '');
  const activeBarcode = (variant?.barcode || product?.barcode || product?.sku || '0000000000000').trim();
  const activeSku = variant?.sku || product?.sku || '';
  const activePrice = variant?.sellingPrice ?? product?.sellingPrice ?? 0;

  // Render SVG barcode whenever barcode or options change
  useEffect(() => {
    if (open && svgRef.current && activeBarcode) {
      try {
        const isEan13 = /^\d{13}$/.test(activeBarcode);
        const format = isEan13 ? 'EAN13' : 'CODE128';

        JsBarcode(svgRef.current, activeBarcode, {
          format,
          lineColor: '#000',
          width: 1.8,
          height: 45,
          displayValue: true,
          fontSize: 13,
          font: 'Cairo, sans-serif',
          margin: 4,
          flat: true,
        });
      } catch (err) {
        console.warn('JsBarcode render fallback:', err);
        // Fallback to CODE128
        try {
          JsBarcode(svgRef.current, activeBarcode, {
            format: 'CODE128',
            width: 1.5,
            height: 40,
            displayValue: true,
          });
        } catch (_) {}
      }
    }
  }, [open, activeBarcode]);

  const handlePrint = () => {
    window.print();
  };

  if (!product) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Tag className="w-5 h-5 text-primary" />
            طباعة ملصقات الباركود
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Print settings */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">عدد الملصقات المطلوبة</Label>
              <Input
                type="number"
                min="1"
                max="500"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="mt-1 font-bold"
              />
            </div>
            <div>
              <Label className="text-xs">اسم المتجر / المكتبة</Label>
              <Input
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className="mt-1"
                disabled={!showStoreName}
              />
            </div>
          </div>

          {/* Display toggles */}
          <div className="bg-muted/30 p-3 rounded-xl space-y-2 border border-border/50 text-sm">
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer text-xs">إظهار اسم المكتبة</Label>
              <Switch checked={showStoreName} onCheckedChange={setShowStoreName} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer text-xs">إظهار سعر البيع</Label>
              <Switch checked={showPrice} onCheckedChange={setShowPrice} />
            </div>
            <div className="flex items-center justify-between">
              <Label className="cursor-pointer text-xs">إظهار رمز الصنف (SKU)</Label>
              <Switch checked={showSku} onCheckedChange={setShowSku} />
            </div>
          </div>

          {/* Live Label Preview */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">معاينة شكل الملصق (Label Preview)</Label>
            <div className="flex justify-center p-4 bg-muted/20 border-2 border-dashed border-border rounded-xl">
              <div className="w-64 bg-white text-black p-3 rounded-lg shadow-sm border border-gray-300 text-center font-cairo">
                {showStoreName && (
                  <p className="text-[11px] font-bold text-gray-700 truncate mb-0.5">{storeName}</p>
                )}
                <p className="text-xs font-bold truncate leading-tight">{activeName}</p>
                {showPrice && (
                  <p className="text-sm font-black text-black mt-0.5">
                    {Number(activePrice).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م
                  </p>
                )}

                {/* SVG Barcode */}
                <div className="flex justify-center my-1">
                  <svg ref={svgRef} className="max-w-full h-auto" />
                </div>

                {showSku && (
                  <p className="text-[10px] text-gray-500 font-mono tracking-wider">SKU: {activeSku}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Printable Hidden Container with Print Styles */}
        <div className="hidden print:block fixed inset-0 bg-white p-4 z-50">
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #barcode-print-area, #barcode-print-area * { visibility: visible !important; }
              #barcode-print-area { position: absolute; left: 0; top: 0; width: 100%; display: flex; flex-wrap: wrap; gap: 8px; }
              .printable-label { page-break-inside: avoid; width: 38mm; height: 25mm; border: 1px dotted #ccc; text-align: center; padding: 2mm; overflow: hidden; display: flex; flex-direction: column; justify-content: space-between; }
            }
          `}</style>
          <div id="barcode-print-area" ref={printAreaRef}>
            {Array.from({ length: quantity }).map((_, idx) => (
              <div key={idx} className="printable-label font-cairo">
                {showStoreName && <div className="text-[8px] font-bold truncate">{storeName}</div>}
                <div className="text-[9px] font-bold truncate leading-tight">{activeName}</div>
                {showPrice && <div className="text-[10px] font-black">{activePrice.toFixed(2)} ج.م</div>}
                <div className="flex justify-center">
                  <svg id={`print-svg-${idx}`} className="h-6 max-w-full" />
                </div>
                {showSku && <div className="text-[7px] font-mono">SKU: {activeSku}</div>}
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button type="button" onClick={handlePrint} className="gap-2 font-bold">
            <Printer className="w-4 h-4" />
            طباعة الملصقات ({quantity})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
