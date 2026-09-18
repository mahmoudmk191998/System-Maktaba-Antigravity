import React, { useState, useEffect } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Tag, Plus, CheckCircle, AlertCircle } from 'lucide-react';
import { usePriceLists } from '@/hooks/retail/usePriceLists';
import { formatCurrency } from '@/lib/utils';
import type { PriceList, PriceListItem } from '@/types/retail.types';

interface PriceListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PriceListModal: React.FC<PriceListModalProps> = ({ open, onOpenChange }) => {
  const { priceLists, addPriceList, setItemPrice, fetchItems } = usePriceLists();

  const [selectedList, setSelectedList] = useState<PriceList | null>(null);
  const [items, setItems] = useState<PriceListItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  // New List State
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDesc, setNewListDesc] = useState('');
  const [newListPriority, setNewListPriority] = useState(1);

  // New Item Price State
  const [productId, setProductId] = useState('');
  const [productName, setProductName] = useState('');
  const [price, setPrice] = useState<number>(0);
  const [minQty, setMinQty] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (priceLists.length > 0 && !selectedList) {
      setSelectedList(priceLists[0]);
    }
  }, [priceLists, selectedList]);

  useEffect(() => {
    if (!selectedList) return;
    const loadItems = async () => {
      setLoadingItems(true);
      try {
        const listItems = await fetchItems(selectedList.id);
        setItems(listItems);
      } catch (err: any) {
        console.error('Error fetching price list items:', err);
      } finally {
        setLoadingItems(false);
      }
    };
    loadItems();
  }, [selectedList]);

  const handleCreateList = async () => {
    if (!newListName.trim()) return;
    try {
      const created = await addPriceList({
        name: newListName.trim(),
        description: newListDesc.trim() || undefined,
        priority: newListPriority,
      });
      setSelectedList(created);
      setIsCreatingList(false);
      setNewListName('');
      setNewListDesc('');
    } catch (err: any) {
      setError(err.message || 'فشل في إنشاء قائمة الأسعار');
    }
  };

  const handleAddItem = async () => {
    if (!selectedList || !productId.trim() || price <= 0) {
      setError('يرجى إدخال معرف المنتج وسعر البيع');
      return;
    }
    try {
      await setItemPrice({
        priceListId: selectedList.id,
        productId: productId.trim(),
        productNameSnapshot: productName.trim() || undefined,
        price,
        minimumQuantity: minQty,
      });
      const updated = await fetchItems(selectedList.id);
      setItems(updated);
      setProductId('');
      setProductName('');
      setPrice(0);
      setMinQty(1);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'فشل في إضافة تسعير الصنف');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Tag className="w-5 h-5" />
            إدارة قوائم الأسعار وأسعار الجملة (Price Lists)
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-4 flex-1 overflow-hidden text-xs">
          {/* Price Lists Sidebar */}
          <div className="border rounded-lg p-3 space-y-2 overflow-y-auto bg-slate-50">
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold text-slate-700">القوائم النشطة</span>
              <Button size="sm" variant="ghost" onClick={() => setIsCreatingList(true)} className="h-6 w-6 p-0">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>

            {isCreatingList ? (
              <div className="p-2 border rounded bg-white space-y-2">
                <Input
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  placeholder="اسم القائمة (مثال: مدارس)"
                  className="h-7 text-xs"
                />
                <Input
                  value={newListDesc}
                  onChange={(e) => setNewListDesc(e.target.value)}
                  placeholder="الوصف (اختياري)"
                  className="h-7 text-xs"
                />
                <div className="flex gap-1 justify-end">
                  <Button size="sm" variant="outline" onClick={() => setIsCreatingList(false)} className="h-6 text-[10px]">
                    إلغاء
                  </Button>
                  <Button size="sm" onClick={handleCreateList} className="h-6 text-[10px]">
                    حفظ
                  </Button>
                </div>
              </div>
            ) : null}

            {priceLists.map((pl) => (
              <div
                key={pl.id}
                onClick={() => setSelectedList(pl)}
                className={`p-2 rounded cursor-pointer border transition-colors ${
                  selectedList?.id === pl.id ? 'bg-primary/10 border-primary text-primary font-bold' : 'bg-white hover:bg-slate-100'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span>{pl.name}</span>
                  <Badge variant="outline" className="text-[10px] h-4">أولوية {pl.priority}</Badge>
                </div>
                {pl.description && <div className="text-[10px] text-slate-500 font-normal mt-0.5">{pl.description}</div>}
              </div>
            ))}
          </div>

          {/* Items & Pricing Table */}
          <div className="col-span-2 border rounded-lg p-3 flex flex-col overflow-hidden bg-white">
            {selectedList ? (
              <>
                <div className="flex justify-between items-center border-b pb-2 mb-3">
                  <div>
                    <h3 className="font-bold text-sm text-slate-800">{selectedList.name}</h3>
                    <p className="text-[11px] text-slate-500">{selectedList.description || 'قائمة أسعار مخصصة'}</p>
                  </div>
                </div>

                {error && (
                  <div className="p-2 bg-red-50 text-red-700 text-[11px] rounded border border-red-200 mb-2 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Add Item Row */}
                <div className="bg-slate-50 p-2.5 rounded border mb-3 grid grid-cols-4 gap-2">
                  <Input
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                    placeholder="معرف المنتج / SKU *"
                    className="h-7 text-xs"
                  />
                  <Input
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="اسم الصنف (للعرض)"
                    className="h-7 text-xs"
                  />
                  <Input
                    type="number"
                    min="0.5"
                    step="0.5"
                    value={price || ''}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    placeholder="السعر الخاص *"
                    className="h-7 text-xs font-bold text-emerald-700"
                  />
                  <div className="flex gap-1.5">
                    <Input
                      type="number"
                      min="1"
                      value={minQty}
                      onChange={(e) => setMinQty(Number(e.target.value))}
                      placeholder="أقل كمية"
                      title="الحد الأدنى للكمية"
                      className="h-7 text-xs w-16"
                    />
                    <Button size="sm" onClick={handleAddItem} className="h-7 text-xs gap-1 flex-1">
                      <Plus className="w-3 h-3" />
                      إضافة
                    </Button>
                  </div>
                </div>

                {/* Items Table */}
                <div className="flex-1 overflow-y-auto border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b text-slate-600 sticky top-0">
                      <tr>
                        <th className="py-2 px-2.5 text-right">معرف الصنف / الاسم</th>
                        <th className="py-2 px-2.5 text-center">الحد الأدنى للكمية</th>
                        <th className="py-2 px-2.5 text-left">السعر بالقائمة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {loadingItems ? (
                        <tr><td colSpan={3} className="text-center py-4 text-slate-400">جارٍ التحميل...</td></tr>
                      ) : items.length === 0 ? (
                        <tr><td colSpan={3} className="text-center py-4 text-slate-400">لا توجد أسعار مخصصة في هذه القائمة حتى الآن</td></tr>
                      ) : (
                        items.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="py-1.5 px-2.5">
                              <span className="font-semibold text-slate-800">{item.productNameSnapshot || item.productId}</span>
                              {item.skuSnapshot && <span className="text-[10px] text-slate-400 block font-mono">{item.skuSnapshot}</span>}
                            </td>
                            <td className="py-1.5 px-2.5 text-center">{item.minimumQuantity || 1} قطعة</td>
                            <td className="py-1.5 px-2.5 text-left font-bold text-emerald-700">
                              {formatCurrency(item.price)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-slate-400">اختر قائمة أسعار لإدارتها</div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
