import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/formatters';
import { useFormatters } from '@/lib/formatters';
import { Clock, MapPin, Utensils, Bike, ShoppingBag } from 'lucide-react';

interface Order {
  id: string;
  orderNumber: string;
  type: 'dine-in' | 'delivery' | 'takeaway' | 'curbside';
  tableNumber?: number;
  customerName?: string;
  total: number;
  status: 'pending' | 'preparing' | 'ready' | 'completed';
  time: Date;
  itemsCount: number;
}

interface RecentOrdersListProps {
  orders: Order[];
}

const orderTypeIcons = {
  'dine-in': Utensils,
  delivery: Bike,
  takeaway: ShoppingBag,
  curbside: MapPin,
};

const orderTypeLabels = {
  'dine-in': 'صالة',
  delivery: 'توصيل',
  takeaway: 'تيك أواي',
  curbside: 'كربسايد',
};

const statusColors = {
  pending: 'bg-status-pending/10 text-status-pending border-status-pending/30',
  preparing: 'bg-status-preparing/10 text-status-preparing border-status-preparing/30',
  ready: 'bg-status-ready/10 text-status-ready border-status-ready/30',
  completed: 'bg-muted text-muted-foreground border-border',
};

const statusLabels = {
  pending: 'قيد الانتظار',
  preparing: 'قيد التحضير',
  ready: 'جاهز',
  completed: 'مكتمل',
};

export function RecentOrdersList({ orders }: RecentOrdersListProps) {
  const { currency } = useFormatters();

  return (
    <div className="space-y-3">
      {orders.map((order) => {
        const Icon = orderTypeIcons[order.type];
        return (
          <div
            key={order.id}
            className="flex items-center gap-4 p-4 bg-card rounded-xl border border-border hover:shadow-md transition-shadow cursor-pointer"
          >
            {/* Order Type Icon */}
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5" />
            </div>

            {/* Order Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-foreground">{order.orderNumber}</span>
                <span className="text-sm text-muted-foreground">
                  • {orderTypeLabels[order.type]}
                </span>
                {order.tableNumber && (
                  <span className="text-sm text-muted-foreground">
                    • طاولة {order.tableNumber}
                  </span>
                )}
                {order.customerName && (
                  <span className="text-sm text-muted-foreground truncate">
                    • {order.customerName}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span>{order.itemsCount} عناصر</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatRelativeTime(order.time)}
                </span>
              </div>
            </div>

            {/* Total */}
            <div className="text-left flex-shrink-0">
              <p className="font-bold text-foreground">{currency(order.total)}</p>
            </div>

            {/* Status Badge */}
            <div
              className={cn(
                'status-badge border',
                statusColors[order.status]
              )}
            >
              {statusLabels[order.status]}
            </div>
          </div>
        );
      })}
    </div>
  );
}
