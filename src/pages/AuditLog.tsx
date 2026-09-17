import { useState } from 'react';
import { MainLayout } from '@/components/layout';
import { useFormatters } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  FileText, Search, Filter, Download, Calendar, User, Clock, Eye,
  CheckCircle, XCircle, Edit, Trash2, DollarSign, Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuditLog, useTenantBranch } from '@/hooks/useDatabase';

// Removed mock data

const actionLabels: Record<string, { label: string; icon: any }> = {
  payment_received: { label: 'استلام دفعة', icon: DollarSign },
  order_cancelled: { label: 'إلغاء طلب', icon: XCircle },
  refund_processed: { label: 'مرتجع', icon: DollarSign },
  discount_applied: { label: 'تطبيق خصم', icon: DollarSign },
  stock_adjusted: { label: 'تسوية مخزون', icon: Package },
  user_login: { label: 'تسجيل دخول', icon: User },
  cashier_close: { label: 'إغلاق وردية', icon: CheckCircle },
};

const severityColors: Record<string, string> = {
  info: 'bg-info/10 text-info', success: 'bg-success/10 text-success', warning: 'bg-warning/10 text-warning', error: 'bg-destructive/10 text-destructive',
};

export default function AuditLog() {
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const { number } = useFormatters();
  const { tenantId } = useTenantBranch();
  const { auditLogs: dbLogs, loading } = useAuditLog(tenantId);

  const auditLogs = dbLogs.map(l => ({
    id: l.id,
    action: l.action || 'unknown',
    entity: l.entity || 'غير محدد',
    user: l.user || 'النظام',
    timestamp: l.created_at ? new Date(l.created_at).toLocaleString('ar-EG') : '--',
    details: l.details || '',
    severity: l.severity || 'info'
  }));

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch = searchQuery ? log.entity.includes(searchQuery) || log.user.includes(searchQuery) || log.details.includes(searchQuery) : true;
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  return (
    <MainLayout title="سجل التدقيق" subtitle="سجل جميع العمليات والتغييرات"
      actions={<Button variant="outline" className="gap-2 text-xs md:text-sm"><Download className="w-4 h-4" /><span className="hidden sm:inline">تصدير</span></Button>}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Card><CardContent className="p-3 md:p-4 text-center"><p className="text-2xl md:text-3xl font-bold text-primary">{number(auditLogs.length)}</p><p className="text-xs md:text-sm text-muted-foreground">إجمالي السجلات</p></CardContent></Card>
        <Card><CardContent className="p-3 md:p-4 text-center"><p className="text-2xl md:text-3xl font-bold text-warning">{number(auditLogs.filter(l => l.severity === 'warning').length)}</p><p className="text-xs md:text-sm text-muted-foreground">تحذيرات</p></CardContent></Card>
        <Card><CardContent className="p-3 md:p-4 text-center"><p className="text-2xl md:text-3xl font-bold text-success">{number(auditLogs.filter(l => l.severity === 'success').length)}</p><p className="text-xs md:text-sm text-muted-foreground">ناجحة</p></CardContent></Card>
        <Card><CardContent className="p-3 md:p-4 text-center"><p className="text-2xl md:text-3xl font-bold">{number(new Set(auditLogs.map(l => l.user)).size)}</p><p className="text-xs md:text-sm text-muted-foreground">مستخدمين نشطين</p></CardContent></Card>
      </div>

      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-4 mb-6">
        <div className="relative flex-1"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="بحث في السجلات..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-10" /></div>
        <Select value={actionFilter} onValueChange={setActionFilter}><SelectTrigger className="w-full md:w-48"><SelectValue placeholder="نوع العملية" /></SelectTrigger><SelectContent><SelectItem value="all">جميع العمليات</SelectItem><SelectItem value="payment_received">المدفوعات</SelectItem><SelectItem value="order_cancelled">الإلغاءات</SelectItem><SelectItem value="discount_applied">الخصومات</SelectItem><SelectItem value="stock_adjusted">تسويات المخزون</SelectItem></SelectContent></Select>
      </div>

      <div className="space-y-2">
        {filteredLogs.map((log) => {
          const action = actionLabels[log.action] || { label: log.action, icon: FileText };
          const ActionIcon = action.icon;
          return (
            <Card key={log.id}>
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center gap-3">
                  <div className={cn('w-8 h-8 md:w-10 md:h-10 rounded-lg flex items-center justify-center flex-shrink-0', severityColors[log.severity])}><ActionIcon className="w-4 h-4 md:w-5 md:h-5" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap"><span className="font-medium text-sm">{action.label}</span><span className="text-xs text-muted-foreground">• {log.entity}</span></div>
                    <p className="text-xs text-muted-foreground truncate">{log.details}</p>
                  </div>
                  <div className="text-left flex-shrink-0 hidden md:block">
                    <p className="text-xs text-muted-foreground">{log.user}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{log.timestamp}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </MainLayout>
  );
}
