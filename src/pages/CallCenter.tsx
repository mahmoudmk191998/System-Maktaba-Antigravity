import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PhoneCall, Plus, Edit, Trash2, Search } from "lucide-react";
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

export default function CallCenter() {
  const { tenantId } = useTenantBranch();
  const { toast } = useToast();

  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [orderDetails, setOrderDetails] = useState('');
  const [status, setStatus] = useState('pending');

  const fetchOrders = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'call_center_orders'), where('tenant_id', '==', tenantId), orderBy('created_at', 'desc'));
      const snap = await getDocs(q);
      setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [tenantId]);

  const filteredOrders = orders.filter(o => 
    (o.customer_name || '').includes(searchQuery) ||
    (o.phone || '').includes(searchQuery)
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || !phone) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'call_center_orders'), {
        tenant_id: tenantId,
        customer_name: customerName,
        phone,
        address,
        order_details: orderDetails,
        status,
        created_at: new Date().toISOString()
      });
      toast({ title: 'تمت الإضافة', description: 'تم تسجيل طلب الدليفري بنجاح' });
      setIsAddOpen(false);
      setCustomerName(''); setPhone(''); setAddress(''); setOrderDetails(''); setStatus('pending');
      fetchOrders();
    } catch (e) {
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء التسجيل', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;
    setIsSubmitting(true);
    try {
      await updateDoc(doc(db, 'call_center_orders', editingOrder.id), {
        customer_name: editingOrder.customer_name,
        phone: editingOrder.phone,
        address: editingOrder.address,
        order_details: editingOrder.order_details,
        status: editingOrder.status,
      });
      toast({ title: 'تم التعديل', description: 'تم التحديث بنجاح' });
      setEditingOrder(null);
      fetchOrders();
    } catch (e) {
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء التحديث', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الطلب؟')) return;
    try {
      await deleteDoc(doc(db, 'call_center_orders', id));
      toast({ title: 'تم الحذف', description: 'تم الحذف بنجاح' });
      fetchOrders();
    } catch (e) {
      toast({ title: 'خطأ', description: 'حدث خطأ أثناء الحذف', variant: 'destructive' });
    }
  };

  return (
    <MainLayout
      title="الكول سنتر والتوصيل"
      subtitle="استقبال طلبات العملاء هاتفياً، تتبع الدليفري والسائقين حتى باب العميل."
      actions={
        <Button onClick={() => setIsAddOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          طلب دليفري جديد
        </Button>
      }
    >
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <PhoneCall className="w-5 h-5 text-primary" />
                  طلبات الكول سنتر المفتوحة
                </CardTitle>
                <CardDescription>إدارة الشحنات وتتباع العمليات</CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="بحث باسم العميل أو الهاتف..."
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
                    <TableHead>العميل</TableHead>
                    <TableHead>الهاتف</TableHead>
                    <TableHead className="hidden md:table-cell">تفاصيل الطلب</TableHead>
                    <TableHead>الحالة</TableHead>
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
                  ) : filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        لا توجد طلبات كول سنتر حالياً
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.customer_name}</TableCell>
                        <TableCell dir="ltr" className="text-right">{order.phone}</TableCell>
                        <TableCell className="hidden md:table-cell truncate max-w-[200px]">{order.order_details}</TableCell>
                        <TableCell>
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            order.status === 'delivered' ? 'bg-green-100 text-green-700' :
                            order.status === 'dispatched' ? 'bg-blue-100 text-blue-700' :
                            order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {order.status === 'delivered' ? 'تم التوصيل' :
                             order.status === 'dispatched' ? 'في الطريق' :
                             order.status === 'cancelled' ? 'ملغي' : 'قيد التحضير'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex justify-center items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" onClick={() => setEditingOrder(order)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-destructive" onClick={() => handleDelete(order.id)}>
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
              <DialogTitle>تسجيل طلب جديد</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>اسم العميل *</Label>
                  <Input required value={customerName} onChange={e => setCustomerName(e.target.value)} disabled={isSubmitting} />
                </div>
                <div className="space-y-2">
                  <Label>رقم الهاتف *</Label>
                  <Input required value={phone} onChange={e => setPhone(e.target.value)} disabled={isSubmitting} dir="ltr" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>عنوان التوصيل</Label>
                <Input value={address} onChange={e => setAddress(e.target.value)} disabled={isSubmitting} />
              </div>
              <div className="space-y-2">
                <Label>تفاصيل الطلب</Label>
                <Textarea value={orderDetails} onChange={e => setOrderDetails(e.target.value)} disabled={isSubmitting} />
              </div>
              <div className="space-y-2">
                <Label>حالة الطلب</Label>
                <Select value={status} onValueChange={setStatus} disabled={isSubmitting}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">قيد التحضير</SelectItem>
                    <SelectItem value="dispatched">في الطريق للمنزل</SelectItem>
                    <SelectItem value="delivered">تم التوصيل بنجاح</SelectItem>
                    <SelectItem value="cancelled">ملغي</SelectItem>
                  </SelectContent>
                </Select>
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
      <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
        <DialogContent>
          <form onSubmit={handleUpdate}>
            <DialogHeader>
              <DialogTitle>تعديل حالة الطلب</DialogTitle>
            </DialogHeader>
            {editingOrder && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>اسم العميل *</Label>
                    <Input required value={editingOrder.customer_name} onChange={e => setEditingOrder({...editingOrder, customer_name: e.target.value})} disabled={isSubmitting} />
                  </div>
                  <div className="space-y-2">
                    <Label>رقم الهاتف *</Label>
                    <Input required value={editingOrder.phone} onChange={e => setEditingOrder({...editingOrder, phone: e.target.value})} disabled={isSubmitting} dir="ltr" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>عنوان التوصيل</Label>
                  <Input value={editingOrder.address || ''} onChange={e => setEditingOrder({...editingOrder, address: e.target.value})} disabled={isSubmitting} />
                </div>
                <div className="space-y-2">
                  <Label>تفاصيل الطلب</Label>
                  <Textarea value={editingOrder.order_details || ''} onChange={e => setEditingOrder({...editingOrder, order_details: e.target.value})} disabled={isSubmitting} />
                </div>
                <div className="space-y-2">
                  <Label>حالة الطلب</Label>
                  <Select value={editingOrder.status} onValueChange={v => setEditingOrder({...editingOrder, status: v})} disabled={isSubmitting}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">قيد التحضير</SelectItem>
                      <SelectItem value="dispatched">في الطريق للمنزل</SelectItem>
                      <SelectItem value="delivered">تم التوصيل بنجاح</SelectItem>
                      <SelectItem value="cancelled">ملغي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingOrder(null)} disabled={isSubmitting}>إلغاء</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'جاري الحفظ...' : 'حفظ التحديث'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
