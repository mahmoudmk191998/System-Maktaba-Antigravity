import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Calculator, Plus, Edit, Trash2, Search } from "lucide-react";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTenantBranch } from '@/hooks/useDatabase';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

export default function Accounting() {
  const { tenantId } = useTenantBranch();
  const { toast } = useToast();

  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('expense');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const fetchRecords = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'accounting_records'), where('tenant_id', '==', tenantId), orderBy('date', 'desc'));
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
  }, [tenantId]);

  const filteredRecords = records.filter(r => 
    (r.description || '').includes(searchQuery)
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !amount) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'accounting_records'), {
        tenant_id: tenantId,
        description,
        amount: Number(amount),
        type,
        date,
        created_at: new Date().toISOString()
      });
      toast({ title: 'تمت الإضافة', description: 'تم تسجيل الحركة المالية بنجاح' });
      setIsAddOpen(false);
      setDescription(''); setAmount(''); setType('expense'); setDate(new Date().toISOString().split('T')[0]);
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
      await updateDoc(doc(db, 'accounting_records', editingRecord.id), {
        description: editingRecord.description,
        amount: Number(editingRecord.amount),
        type: editingRecord.type,
        date: editingRecord.date,
      });
      toast({ title: 'تم التعديل', description: 'تم التحديث بنجاح' });
      setEditingRecord(null);
      fetchRecords();
    } catch (e) {
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء التحديث', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه الحركة؟')) return;
    try {
      await deleteDoc(doc(db, 'accounting_records', id));
      toast({ title: 'تم الحذف', description: 'تم الحذف بنجاح' });
      fetchRecords();
    } catch (e) {
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء الحذف', variant: 'destructive' });
    }
  };

  return (
    <MainLayout
      title="الحسابات والضرائب (متقدم)"
      subtitle="إدارة قيود اليومية، شجرة الحسابات، الإقرارات الضريبية وتقارير الأرباح والخسائر."
      actions={
        <Button onClick={() => setIsAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          إضافة حركة مالية
        </Button>
      }
    >
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-primary" />
                  سجل الحركات المالية
                </CardTitle>
                <CardDescription>عرض وتعديل الإيرادات، المصروفات، والضرائب.</CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث بالبيان..."
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
                    <TableHead>التاريخ</TableHead>
                    <TableHead>البيان</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>المبلغ (جنية)</TableHead>
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
                        لا توجد حركات مالية
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>{record.date}</TableCell>
                        <TableCell className="font-medium">{record.description}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            record.type === 'income' ? 'bg-green-100 text-green-700' :
                            record.type === 'expense' ? 'bg-red-100 text-red-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {record.type === 'income' ? 'إيراد' : record.type === 'expense' ? 'مصروف' : 'ضريبة'}
                          </span>
                        </TableCell>
                        <TableCell dir="ltr" className="text-right font-bold">{Number(record.amount).toFixed(2)}</TableCell>
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
              <DialogTitle>تسجيل حركة مالية</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>البيان / الوصف *</Label>
                <Input required value={description} onChange={e => setDescription(e.target.value)} disabled={isSubmitting} />
              </div>
              <div className="space-y-2">
                <Label>المبلغ (جنية) *</Label>
                <Input type="number" step="0.01" required value={amount} onChange={e => setAmount(e.target.value)} disabled={isSubmitting} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>تاريخ الحركة *</Label>
                  <Input type="date" required value={date} onChange={e => setDate(e.target.value)} disabled={isSubmitting} />
                </div>
                <div className="space-y-2">
                  <Label>نوع الحركة</Label>
                  <Select value={type} onValueChange={setType} disabled={isSubmitting}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">إيراد</SelectItem>
                      <SelectItem value="expense">مصروف</SelectItem>
                      <SelectItem value="tax">ضريبة أو رسوم</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
              <DialogTitle>تعديل الحركة المالية</DialogTitle>
            </DialogHeader>
            {editingRecord && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>البيان / الوصف *</Label>
                  <Input required value={editingRecord.description} onChange={e => setEditingRecord({...editingRecord, description: e.target.value})} disabled={isSubmitting} />
                </div>
                <div className="space-y-2">
                  <Label>المبلغ (جنية) *</Label>
                  <Input type="number" step="0.01" required value={editingRecord.amount} onChange={e => setEditingRecord({...editingRecord, amount: e.target.value})} disabled={isSubmitting} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>تاريخ الحركة *</Label>
                    <Input type="date" required value={editingRecord.date} onChange={e => setEditingRecord({...editingRecord, date: e.target.value})} disabled={isSubmitting} />
                  </div>
                  <div className="space-y-2">
                    <Label>نوع الحركة</Label>
                    <Select value={editingRecord.type} onValueChange={v => setEditingRecord({...editingRecord, type: v})} disabled={isSubmitting}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="income">إيراد</SelectItem>
                        <SelectItem value="expense">مصروف</SelectItem>
                        <SelectItem value="tax">ضريبة أو رسوم</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
