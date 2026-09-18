import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { History, ArrowDownLeft, ArrowUpRight, Clock } from 'lucide-react';
import type { StockMovement } from '@/types/retail.types';

interface StockMovementsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movements: StockMovement[];
  title?: string;
  loading?: boolean;
}

export const StockMovementsDrawer: React.FC<StockMovementsDrawerProps> = ({
  open,
  onOpenChange,
  movements,
  title,
  loading = false,
}) => {
  const getMovementLabel = (type: string) => {
    switch (type) {
      case 'opening_balance':
        return 'رصيد افتتاحي';
      case 'purchase_receive':
      case 'purchase':
        return 'استلام مشتريات';
      case 'sale':
        return 'مبيعات نقدية';
      case 'sale_return':
        return 'مرتجع مبيعات';
      case 'purchase_return':
        return 'مرتجع مشتريات لمورد';
      case 'transfer_out':
        return 'مناقلة صادرة (شحن)';
      case 'transfer_in':
        return 'مناقلة واردة (استلام)';
      case 'stock_adjustment_in':
        return 'تسوية إضافة (فائض)';
      case 'stock_adjustment_out':
        return 'تسوية خصم (عجز)';
      case 'damage':
        return 'توالف وهالك';
      case 'loss':
        return 'فقد وعجز مخزن';
      case 'recovery':
        return 'استرداد بضاعة';
      default:
        return type;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[750px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-600">
              <History className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle>دفتر حركات المخزون غير القابل للتعديل (Ledger)</DialogTitle>
              <DialogDescription>{title || 'سجل التدقيق التاريخي لكافة الإدخالات والإخراجات'}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto border rounded-lg max-h-[60vh]">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">جاري تحميل سجل الحركات...</div>
          ) : movements.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">لا توجد حركات مخزنية مسجلة بعد</div>
          ) : (
            <table className="w-full text-xs text-right">
              <thead className="bg-muted text-muted-foreground sticky top-0">
                <tr>
                  <th className="p-2.5">التاريخ والوقت</th>
                  <th className="p-2.5">نوع الحركة</th>
                  <th className="p-2.5 text-center">الكمية</th>
                  <th className="p-2.5 text-center">قبل الحركة</th>
                  <th className="p-2.5 text-center">بعد الحركة</th>
                  <th className="p-2.5 text-center">التكلفة</th>
                  <th className="p-2.5">البيان والملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {movements.map((m) => {
                  const isOut = m.quantity < 0 || m.direction === 'out';
                  return (
                    <tr key={m.id} className="hover:bg-muted/20">
                      <td className="p-2.5 font-mono text-muted-foreground whitespace-nowrap">
                        {new Date(m.createdAt).toLocaleString('ar-EG', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="p-2.5">
                        <Badge
                          variant="outline"
                          className={
                            isOut
                              ? 'border-rose-300 text-rose-700 bg-rose-50/50 dark:bg-rose-950/20'
                              : 'border-emerald-300 text-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20'
                          }
                        >
                          {isOut ? (
                            <ArrowUpRight className="w-3 h-3 ml-1" />
                          ) : (
                            <ArrowDownLeft className="w-3 h-3 ml-1" />
                          )}
                          {getMovementLabel(m.movementType)}
                        </Badge>
                      </td>
                      <td className="p-2.5 text-center font-bold">
                        <span className={isOut ? 'text-rose-600' : 'text-emerald-600'}>
                          {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                        </span>
                      </td>
                      <td className="p-2.5 text-center text-muted-foreground">{m.beforeQuantity}</td>
                      <td className="p-2.5 text-center font-bold text-foreground">{m.afterQuantity}</td>
                      <td className="p-2.5 text-center font-mono">
                        {(m.unitCost || 0).toLocaleString()} ج.م
                      </td>
                      <td className="p-2.5 text-muted-foreground max-w-[200px] truncate" title={m.reason || m.notes}>
                        {m.reason || m.notes || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="pt-2 text-left">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
