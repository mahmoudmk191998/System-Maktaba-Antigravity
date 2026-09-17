import { useState } from 'react';
import { MainLayout } from '@/components/layout';
import { useFormatters } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  Factory, Plus, Calendar, Clock, CheckCircle, Play, Pause, BarChart3,
  Package, AlertTriangle, Printer, ChefHat, Edit, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useProduction, useTenantBranch, useUnits } from '@/hooks/useDatabase';

// Removed mock data

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: 'في الانتظار', color: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'قيد التنفيذ', color: 'bg-info/10 text-info' },
  completed: { label: 'مكتمل', color: 'bg-success/10 text-success' },
};

export default function Production() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newBatch, setNewBatch] = useState({ recipe: '', quantity: '', unit: 'كجم', operator: '' });
  const [editingBatch, setEditingBatch] = useState<any>(null);

  const { tenantId } = useTenantBranch();
  const { units } = useUnits(tenantId);
  const { productionBatches: dbBatches, prepLists: dbPrep, addBatch, updateBatchStatus, updateBatch, deleteBatch, loading } = useProduction(tenantId);
  const { number } = useFormatters();

  const productionBatches = dbBatches.map(b => ({
    id: b.id,
    recipe: b.recipe || 'غير محدد',
    quantity: Number(b.quantity) || 0,
    unit: b.unit || 'كجم',
    status: b.status || 'pending',
    progress: b.progress || 0,
    startTime: b.start_time || '--:--',
    estimatedEnd: b.estimated_end || '--:--',
    operator: b.operator || 'غير محدد'
  }));

  const prepLists = dbPrep.map(p => ({
    id: p.id,
    name: p.name || 'غير محدد',
    items: Number(p.items) || 0,
    completed: Number(p.completed) || 0,
    date: p.date || '--'
  }));

  const inProgressCount = productionBatches.filter(b => b.status === 'in_progress').length;
  const completedToday = productionBatches.filter(b => b.status === 'completed').length;

  return (
    <MainLayout title="الإنتاج والتحضير" subtitle="إدارة خطط الإنتاج"
      actions={<div className="flex items-center gap-2"><Button onClick={() => setIsAddOpen(true)} className="gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white shadow-md font-medium px-4"><Plus className="w-5 h-5" /><span className="hidden sm:inline">دفعة إنتاج جديدة</span></Button></div>}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Card><CardContent className="p-3 md:p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-info/10 text-info flex items-center justify-center"><Play className="w-5 h-5 md:w-6 md:h-6" /></div><div><p className="text-lg md:text-2xl font-bold">{number(inProgressCount)}</p><p className="text-xs md:text-sm text-muted-foreground">قيد التنفيذ</p></div></div></CardContent></Card>
        <Card><CardContent className="p-3 md:p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-success/10 text-success flex items-center justify-center"><CheckCircle className="w-5 h-5 md:w-6 md:h-6" /></div><div><p className="text-lg md:text-2xl font-bold">{number(completedToday)}</p><p className="text-xs md:text-sm text-muted-foreground">مكتمل اليوم</p></div></div></CardContent></Card>
        <Card><CardContent className="p-3 md:p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><ChefHat className="w-5 h-5 md:w-6 md:h-6" /></div><div><p className="text-lg md:text-2xl font-bold">{number(prepLists.length)}</p><p className="text-xs md:text-sm text-muted-foreground">قوائم التحضير</p></div></div></CardContent></Card>
        <Card><CardContent className="p-3 md:p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-warning/10 text-warning flex items-center justify-center"><AlertTriangle className="w-5 h-5 md:w-6 md:h-6" /></div><div><p className="text-lg md:text-2xl font-bold">2</p><p className="text-xs md:text-sm text-muted-foreground">تأخير متوقع</p></div></div></CardContent></Card>
      </div>

      <Tabs defaultValue="batches" className="space-y-4">
        <TabsList className="flex-wrap h-auto"><TabsTrigger value="batches">دفعات الإنتاج</TabsTrigger><TabsTrigger value="prep">قوائم التحضير</TabsTrigger></TabsList>

        <TabsContent value="batches" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {productionBatches.map((batch) => {
              const status = statusConfig[batch.status];
              return (
                <Card key={batch.id} className={cn('border-r-4', batch.status === 'in_progress' ? 'border-r-info' : batch.status === 'completed' ? 'border-r-success' : 'border-r-muted')}>
                  <CardContent className="p-3 md:p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-xs text-muted-foreground">{batch.id.substring(0, 8)}...</p>
                        <h3 className="font-bold text-sm md:text-lg">{batch.recipe}</h3>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge className={status.color}>{status.label}</Badge>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => setEditingBatch(batch)}>
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={async () => {
                            if (confirm('هل أنت متأكد من حذف دفعة الإنتاج هذه؟')) {
                              await deleteBatch(batch.id);
                            }
                          }}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs md:text-sm mb-3"><div><p className="text-muted-foreground">الكمية</p><p className="font-medium">{number(batch.quantity)} {batch.unit}</p></div><div><p className="text-muted-foreground">المشغل</p><p className="font-medium">{batch.operator}</p></div><div><p className="text-muted-foreground">البداية</p><p className="font-medium">{batch.startTime}</p></div><div><p className="text-muted-foreground">النهاية</p><p className="font-medium">{batch.estimatedEnd}</p></div></div>
                    {batch.status !== 'pending' && <div className="mb-3"><div className="flex justify-between text-xs mb-1"><span>التقدم</span><span className="font-bold">{batch.progress}%</span></div><Progress value={batch.progress} className="h-2" /></div>}
                    <div className="flex gap-2">
                      {batch.status === 'pending' && <Button size="sm" className="flex-1 gap-1" onClick={() => updateBatchStatus(batch.id, 'in_progress')}><Play className="w-4 h-4" />بدء</Button>}
                      {batch.status === 'in_progress' && <><Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => updateBatchStatus(batch.id, 'pending')}><Pause className="w-4 h-4" />إيقاف</Button><Button size="sm" className="flex-1 gap-1 bg-success hover:bg-success/90" onClick={() => updateBatchStatus(batch.id, 'completed')}><CheckCircle className="w-4 h-4" />إنهاء</Button></>}
                      {batch.status === 'completed' && <Button variant="outline" size="sm" className="flex-1 gap-1"><Printer className="w-4 h-4" />طباعة ملصق</Button>}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="prep" className="space-y-4">
          <div className="grid gap-3">
            {prepLists.map((list) => (
              <Card key={list.id}><CardContent className="p-3 md:p-4"><div className="flex items-center gap-3 md:gap-4"><div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><ChefHat className="w-5 h-5 md:w-6 md:h-6" /></div><div className="flex-1 min-w-0"><h3 className="font-bold text-sm md:text-base">{list.name}</h3><p className="text-xs text-muted-foreground">{list.date}</p></div><div className="flex items-center gap-3 md:gap-6"><div className="text-center"><p className="text-lg md:text-2xl font-bold">{list.completed}/{list.items}</p><p className="text-[10px] md:text-xs text-muted-foreground">مكتمل</p></div><div className="w-16 md:w-32"><Progress value={(list.completed / list.items) * 100} className="h-2" /></div></div></div></CardContent></Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>دفعة إنتاج جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">الوصفة</label>
              <Input
                value={newBatch.recipe}
                onChange={(e) => setNewBatch({ ...newBatch, recipe: e.target.value })}
                placeholder="اسم الوصفة"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">الكمية</label>
                <Input
                  type="number"
                  value={newBatch.quantity}
                  onChange={(e) => setNewBatch({ ...newBatch, quantity: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">الوحدة</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={newBatch.unit} 
                  onChange={(e) => setNewBatch({ ...newBatch, unit: e.target.value })}
                >
                  {units.map((u: any) => (
                    <option key={u.id} value={u.abbreviation}>{u.name} ({u.abbreviation})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">المشغل</label>
              <Input
                value={newBatch.operator}
                onChange={(e) => setNewBatch({ ...newBatch, operator: e.target.value })}
                placeholder="اسم المشغل"
              />
            </div>
            <Button
              className="w-full mt-4"
              disabled={!newBatch.recipe || !newBatch.quantity}
              onClick={async () => {
                const now = new Date();
                const success = await addBatch({
                  recipe: newBatch.recipe,
                  quantity: Number(newBatch.quantity),
                  unit: newBatch.unit,
                  operator: newBatch.operator || 'غير محدد',
                  status: 'pending',
                  progress: 0,
                  start_time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`,
                  estimated_end: `${(now.getHours() + 2).toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}` // just a 2 hr estimation for mock
                });
                if (success) {
                  setIsAddOpen(false);
                  setNewBatch({ recipe: '', quantity: '', unit: 'كجم', operator: '' });
                }
              }}
            >
              حفظ وتأكيد
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!editingBatch} onOpenChange={(open) => !open && setEditingBatch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل بيانات الدفعة</DialogTitle>
          </DialogHeader>
          {editingBatch && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">الوصفة</label>
                <Input
                  value={editingBatch.recipe}
                  onChange={(e) => setEditingBatch({ ...editingBatch, recipe: e.target.value })}
                  placeholder="اسم الوصفة"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">الكمية</label>
                  <Input
                    type="number"
                    value={editingBatch.quantity}
                    onChange={(e) => setEditingBatch({ ...editingBatch, quantity: e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">الوحدة</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={editingBatch.unit} 
                    onChange={(e) => setEditingBatch({ ...editingBatch, unit: e.target.value })}
                  >
                    {units.map((u: any) => (
                      <option key={u.id} value={u.abbreviation}>{u.name} ({u.abbreviation})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">المشغل</label>
                <Input
                  value={editingBatch.operator}
                  onChange={(e) => setEditingBatch({ ...editingBatch, operator: e.target.value })}
                  placeholder="اسم المشغل"
                />
              </div>
              <Button
                className="w-full mt-4"
                disabled={!editingBatch.recipe || !editingBatch.quantity}
                onClick={async () => {
                  const success = await updateBatch(editingBatch.id, {
                    recipe: editingBatch.recipe,
                    quantity: Number(editingBatch.quantity),
                    unit: editingBatch.unit,
                    operator: editingBatch.operator || 'غير محدد',
                  });
                  if (success) {
                    setEditingBatch(null);
                  }
                }}
              >
                تحديث
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
