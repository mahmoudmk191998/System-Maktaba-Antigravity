import React, { useState, useEffect, useMemo } from 'react';
import { MainLayout } from '@/components/layout';
import { useTenantBranch } from '@/hooks/useDatabase';
import { useAuth } from '@/hooks/useAuth';
import { useUserPermissions } from '@/hooks/usePermissions';
import { useFormatters } from '@/lib/formatters';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  Search,
  RefreshCw,
  AlertTriangle,
  User,
  Building2,
  DollarSign,
  FileText,
  ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

import type { ApprovalRequest, ApprovalWorkflowType, ApprovalStatus } from '@/types/approval.types';
import {
  fetchApprovalRequests,
  processApprovalAction,
} from '@/services/governance/approvalEngine.service';

const WORKFLOW_LABELS: Record<ApprovalWorkflowType, string> = {
  high_value_purchase_order: 'أمر شراء مرتفع القيمة',
  large_discount: 'خصم استثنائي مرتفع',
  sale_below_minimum: 'بيع بأقل من الحد الأدنى للسعر',
  large_refund: 'مرتجع واسترداد مرتفع القيمة',
  inventory_adjustment: 'تسوية فروق جرد مخزني',
  damage_loss: 'اعتماد هالك وتوالف مستودع',
  supplier_payment: 'سداد دفعة نقدية للمورد',
  customer_credit_override: 'تجاوز السقف الائتماني للعميل',
  journal_entry: 'اعتماد قيد يومية يدوي',
  period_reopen: 'إعادة فتح فترة مالية مغلقة',
  backup_restore: 'استعادة نسخة احتياطية',
  sensitive_settings_change: 'تعديل إعدادات سيادية حساسة',
};

export default function Approvals() {
  const { tenantId, branchId } = useTenantBranch();
  const { user } = useAuth();
  const { userRole, isOwner, isAdmin } = useUserPermissions();
  const { currency } = useFormatters();

  const [activeTab, setActiveTab] = useState<'pending_for_me' | 'my_requests' | 'approved' | 'rejected'>('pending_for_me');
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [workflowFilter, setWorkflowFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Detail & Action Modal
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [actionComment, setActionComment] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const loadRequests = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const data = await fetchApprovalRequests(tenantId);
      setRequests(data);
    } catch (err: any) {
      console.error('Error fetching approval requests:', err);
      toast.error('حدث خطأ أثناء تحميل طلبات الاعتماد');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [tenantId]);

  // Tab Filtering
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      // 1. Tab filter
      if (activeTab === 'pending_for_me') {
        if (r.status !== 'pending') return false;
      } else if (activeTab === 'my_requests') {
        if (r.requestedBy !== user?.uid) return false;
      } else if (activeTab === 'approved') {
        if (r.status !== 'approved') return false;
      } else if (activeTab === 'rejected') {
        if (r.status !== 'rejected') return false;
      }

      // 2. Workflow Filter
      if (workflowFilter !== 'all' && r.workflowType !== workflowFilter) {
        return false;
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const num = (r.entityNumberSnapshot || '').toLowerCase();
        const reqName = (r.requesterNameSnapshot || '').toLowerCase();
        const id = r.entityId.toLowerCase();
        if (!num.includes(q) && !reqName.includes(q) && !id.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [requests, activeTab, workflowFilter, searchQuery, user?.uid]);

  const handleAction = async (action: 'approve' | 'reject' | 'cancel') => {
    if (!tenantId || !selectedRequest || !user) return;
    setIsProcessing(true);
    try {
      await processApprovalAction({
        tenantId,
        requestId: selectedRequest.id,
        actorId: user.uid,
        actorName: user.displayName || user.email || 'مسؤول',
        actorRole: userRole || (isOwner ? 'owner' : isAdmin ? 'admin' : 'manager'),
        action,
        comment: actionComment,
      });

      toast.success(
        action === 'approve'
          ? 'تم اعتماد الطلب بنجاح'
          : action === 'reject'
          ? 'تم رفض الطلب'
          : 'تم إلغاء الطلب بنجاح'
      );
      setSelectedRequest(null);
      setActionComment('');
      loadRequests();
    } catch (err: any) {
      toast.error(err.message || 'فشلت معالجة الإجراء');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 pb-12" dir="rtl">
        {/* Header */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground">مركز الاعتمادات والحوكمة (Approvals Center)</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                إدارة واعتماد العمليات المالية والتجارية والمخزنية الحساسة وفق سياسات التدقيق المزدوج
              </p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={loadRequests}
            disabled={loading}
            className="text-xs h-9 gap-1.5 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            تحديث
          </Button>
        </div>

        {/* Filter Bar & Tabs */}
        <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as any)} className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-card p-2 border border-border rounded-xl shadow-sm">
            <TabsList className="bg-transparent h-auto flex flex-wrap gap-1">
              <TabsTrigger
                value="pending_for_me"
                className="text-xs font-semibold py-2 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                بانتظار الاعتماد ({requests.filter((r) => r.status === 'pending').length})
              </TabsTrigger>
              <TabsTrigger
                value="my_requests"
                className="text-xs font-semibold py-2 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                طلباتي ({requests.filter((r) => r.requestedBy === user?.uid).length})
              </TabsTrigger>
              <TabsTrigger
                value="approved"
                className="text-xs font-semibold py-2 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                المعتمدة
              </TabsTrigger>
              <TabsTrigger
                value="rejected"
                className="text-xs font-semibold py-2 px-3 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                المرفوضة
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2 px-2">
              <Select value={workflowFilter} onValueChange={setWorkflowFilter}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <SelectValue placeholder="نوع العملية" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كافة أنواع العمليات</SelectItem>
                  {Object.entries(WORKFLOW_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="بحث في الطلبات..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-8 h-8 text-xs w-[180px]"
                />
              </div>
            </div>
          </div>

          {/* Table Content */}
          <Card className="border border-border bg-card shadow-sm">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead>نوع العملية</TableHead>
                    <TableHead>الرقم المرجعي</TableHead>
                    <TableHead>مقدم الطلب</TableHead>
                    <TableHead>القيمة / المبلغ</TableHead>
                    <TableHead>تاريخ الطلب</TableHead>
                    <TableHead>المرحلة الحالية</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className="text-left">الإجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.length === 0 ? (
                    <TableRow className="border-border">
                      <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                        لا توجد طلبات اعتماد مطابقة للتصفية الحالية
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRequests.map((req) => (
                      <TableRow key={req.id} className="border-border">
                        <TableCell className="font-semibold text-xs text-foreground">
                          {WORKFLOW_LABELS[req.workflowType] || req.workflowType}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-primary">
                          {req.entityNumberSnapshot || req.entityId.slice(0, 8)}
                        </TableCell>
                        <TableCell className="text-xs text-card-foreground">{req.requesterNameSnapshot}</TableCell>
                        <TableCell className="text-xs font-bold text-foreground">
                          {req.amount !== undefined ? currency(req.amount) : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {req.requestedAt.split('T')[0]}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="text-muted-foreground">
                            خطوة {req.currentStep} من {req.totalSteps}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={
                              req.status === 'approved'
                                ? 'bg-emerald-600 hover:bg-emerald-600 text-white'
                                : req.status === 'rejected'
                                ? 'bg-rose-600 hover:bg-rose-600 text-white'
                                : req.status === 'cancelled'
                                ? 'bg-muted-foreground text-card'
                                : 'bg-amber-600 hover:bg-amber-600 text-white'
                            }
                          >
                            {req.status === 'approved'
                              ? 'معتمد'
                              : req.status === 'rejected'
                              ? 'مرفوض'
                              : req.status === 'cancelled'
                              ? 'ملغي'
                              : 'قيد الانتظار'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-left">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedRequest(req)}
                            className="text-xs h-7 gap-1"
                          >
                            عرض التفاصيل
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Tabs>

        {/* Approval Details Modal */}
        {selectedRequest && (
          <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
            <DialogContent className="max-w-xl bg-card border-border text-foreground" dir="rtl">
              <DialogHeader>
                <DialogTitle className="text-base font-bold text-foreground">
                  تفاصيل طلب الاعتماد: {WORKFLOW_LABELS[selectedRequest.workflowType]}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  الرقم المرجعي: {selectedRequest.entityNumberSnapshot || selectedRequest.entityId}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                {/* Meta Summary */}
                <div className="grid grid-cols-2 gap-3 p-3 bg-muted/50 border border-border rounded-xl text-xs">
                  <div>
                    <span className="text-muted-foreground block">مقدم الطلب:</span>
                    <span className="font-semibold text-foreground">{selectedRequest.requesterNameSnapshot}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">المبلغ المعني:</span>
                    <span className="font-bold text-foreground">
                      {selectedRequest.amount !== undefined ? currency(selectedRequest.amount) : 'غير محدد'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">تاريخ الإنشاء:</span>
                    <span className="text-foreground">{selectedRequest.requestedAt.replace('T', ' ').slice(0, 16)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">الحالة العامة:</span>
                    <span className="font-bold text-primary">{selectedRequest.status}</span>
                  </div>
                </div>

                {/* Self-Approval Warning */}
                {selectedRequest.status === 'pending' && selectedRequest.requestedBy === user?.uid && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200 font-semibold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                    أنت منشئ هذا الطلب. وفق سياسة الحوكمة، يتطلب الاعتماد مراجعة شخص آخر مخول.
                  </div>
                )}

                {/* Steps Timeline */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-foreground block">مسار خطوات الاعتماد:</span>
                  <div className="space-y-2">
                    {selectedRequest.steps.map((step) => (
                      <div
                        key={step.stepNumber}
                        className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                          step.status === 'approved'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200'
                            : step.status === 'rejected'
                            ? 'bg-rose-500/10 border-rose-500/30 text-rose-950 dark:text-rose-200'
                            : 'bg-muted/40 border-border text-foreground'
                        }`}
                      >
                        <div>
                          <div className="font-bold">{step.stepName}</div>
                          <div className="text-[11px] text-muted-foreground">
                            الدور المطلوب: {step.requiredRole}
                          </div>
                          {step.actionRecord && (
                            <div className="text-[11px] text-muted-foreground mt-1">
                              بواسطة: {step.actionRecord.actorName} ({step.actionRecord.timestamp.slice(0, 10)})
                              {step.actionRecord.comment && ` - ملاحظة: "${step.actionRecord.comment}"`}
                            </div>
                          )}
                        </div>
                        <Badge variant="outline" className="border-border">{step.status}</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Comment Input (if pending) */}
                {selectedRequest.status === 'pending' && (
                  <div className="space-y-1.5 pt-2">
                    <label className="text-xs font-semibold text-foreground">ملاحظات الاعتماد أو الرفض:</label>
                    <Textarea
                      placeholder="أدخل أي ملاحظات مرافقة للقرار..."
                      value={actionComment}
                      onChange={(e) => setActionComment(e.target.value)}
                      className="text-xs h-18 resize-none bg-background border-border"
                    />
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                {selectedRequest.status === 'pending' ? (
                  <div className="flex items-center gap-2 w-full justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAction('cancel')}
                      disabled={isProcessing}
                      className="text-xs"
                    >
                      إلغاء الطلب
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleAction('reject')}
                      disabled={isProcessing}
                      className="text-xs"
                    >
                      رفض الطلب
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleAction('approve')}
                      disabled={isProcessing || selectedRequest.requestedBy === user?.uid}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                    >
                      اعتماد الطلب
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setSelectedRequest(null)} className="text-xs">
                    إغلاق
                  </Button>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </MainLayout>
  );
}
