import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Wrench, Plus, Edit, Trash2, Search } from "lucide-react";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTenantBranch } from '@/hooks/useDatabase';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export default function Maintenance() {
  const { branchId } = useTenantBranch();
  const { toast } = useToast();

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [assetName, setAssetName] = useState('');
  const [type, setType] = useState('repair');
  const [status, setStatus] = useState('pending');
  const [cost, setCost] = useState('0');
  const [notes, setNotes] = useState('');

  const fetchRecords = async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'maintenance_records'), where('branch_id', '==', branchId), orderBy('created_at', 'desc'));
      const snap = await getDocs(q);
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [branchId]);

  const filteredRecords = records.filter(r => 
    (r.asset_name || '').includes(searchQuery) ||
    (r.notes || '').includes(searchQuery)
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetName) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'maintenance_records'), {
        branch_id: branchId,
        asset_name: assetName,
        type,
        status,
        cost: Number(cost),
        notes,
        created_at: new Date().toISOString()
      });
      toast({ title: 'تمت الإضافة', description: 'تم تسجيل طلب الصيانة بنجاح' });
      setIsAddOpen(false);
      setAssetName(''); setType('repair'); setStatus('pending'); setCost('0'); setNotes('');
      fetchRecords();
    } catch (e) {
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء التسجيل', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecord) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'maintenance_records', editingRecord.id), {
        asset_name: editingRecord.asset_name,
        type: editingRecord.type,
        status: editingRecord.status,
        cost: Number(editingRecord.cost),
        notes: editingRecord.notes,
      });
      toast({ title: 'تم التعديل', description: 'تم تحديث البيانات بنجاح' });
      setEditingRecord(null);
      fetchRecords();
    } catch (e) {
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء التحديث', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا السجل؟')) return;
    try {
      await deleteDoc(doc(db, 'maintenance_records', id));
      toast({ title: 'تم الحذف', description: 'تم حذف السجل بنجاح' });
      fetchRecords();
    } catch (e) {
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء الحذف', variant: 'destructive' });
    }
  };

  return (
    <MainLayout
      title="الأصول والصيانة"
      subtitle="إدارة المعدات، الماكينات، وجدولة ومتابعة أعمال الصيانة الدورية."
      actions={
        <Button onClick={() => setIsAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          تسجيل صيانة
        </Button>
      }
    >
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-primary" />
                  سجل أعمال الصيانة
                </CardTitle>
                <CardDescription>عرض وتعديل أعمال الصيانة الحالية والسابقة</CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث باسم الأصل أو الملاحظات..."
                  className="pr-8"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border/50 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الأصل / المعدة</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>التكلفة</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center">
                        <div className="flex justify-center items-center">
                          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        لا توجد سجلات صيانة
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">{record.asset_name}</TableCell>
                        <TableCell>
                          {record.type === 'repair' ? 'إصلاح طارئ' : 'صيانة دورية'}
                        </TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            record.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {record.status === 'completed' ? 'مكتملة' : 'قيد الانتظار'}
                          </span>
                        </TableCell>
                        <TableCell>{record.cost} جنية</TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" onClick={() => setEditingRecord(record)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => handleDelete(record.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <form onSubmit={handleAdd}>
            <DialogHeader>
              <DialogTitle>تسجيل عملية صيانة</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>الأصل / المعدة *</Label>
                <Input required value={assetName} onChange={e => setAssetName(e.target.value)} disabled={isSubmitting} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>نوع الصيانة</Label>
                  <Select value={type} onValueChange={setType} disabled={isSubmitting}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="repair">إصلاح طارئ</SelectItem>
                      <SelectItem value="routine">صيانة دورية</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الحالة</Label>
                  <Select value={status} onValueChange={setStatus} disabled={isSubmitting}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">قيد الانتظار</SelectItem>
                      <SelectItem value="completed">مكتملة</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>التكلفة التقديرية أو الفعلية</Label>
                <Input type="number" required value={cost} onChange={e => setCost(e.target.value)} disabled={isSubmitting} />
              </div>
              <div className="space-y-2">
                <Label>ملاحظات</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} disabled={isSubmitting} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)} disabled={isSubmitting}>إلغاء</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'جاري الحفظ...' : 'حفظ'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingRecord} onOpenChange={(open) => !open && setEditingRecord(null)}>
        <DialogContent>
          <form onSubmit={handleUpdate}>
            <DialogHeader>
              <DialogTitle>تعديل سجل الصيانة</DialogTitle>
            </DialogHeader>
            {editingRecord && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>الأصل / المعدة *</Label>
                  <Input required value={editingRecord.asset_name} onChange={e => setEditingRecord({...editingRecord, asset_name: e.target.value})} disabled={isSubmitting} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>نوع الصيانة</Label>
                    <Select value={editingRecord.type} onValueChange={v => setEditingRecord({...editingRecord, type: v})} disabled={isSubmitting}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="repair">إصلاح طارئ</SelectItem>
                        <SelectItem value="routine">صيانة دورية</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>الحالة</Label>
                    <Select value={editingRecord.status} onValueChange={v => setEditingRecord({...editingRecord, status: v})} disabled={isSubmitting}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">قيد الانتظار</SelectItem>
                        <SelectItem value="completed">مكتملة</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>التكلفة التقديرية أو الفعلية</Label>
                  <Input type="number" required value={editingRecord.cost} onChange={e => setEditingRecord({...editingRecord, cost: e.target.value})} disabled={isSubmitting} />
                </div>
                <div className="space-y-2">
                  <Label>ملاحظات</Label>
                  <Textarea value={editingRecord.notes || ''} onChange={e => setEditingRecord({...editingRecord, notes: e.target.value})} disabled={isSubmitting} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingRecord(null)} disabled={isSubmitting}>إلغاء</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'جاري الحفظ...' : 'حفظ التحديث'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
