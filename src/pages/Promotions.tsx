import { useState } from 'react';
import { MainLayout } from '@/components/layout';
import { useFormatters } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  Percent, Plus, Calendar, Clock, Tag, Gift, Ticket, TrendingUp, Copy, Edit, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { usePromotions, useTenantBranch, useOrders } from '@/hooks/useDatabase';

// Removed mock data

export default function Promotions() {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAddCouponOpen, setIsAddCouponOpen] = useState(false);
  const [newPromo, setNewPromo] = useState({ name: '', type: 'percentage', value: '', minOrder: '', startDate: '', endDate: '' });
  const [newCoupon, setNewCoupon] = useState({ code: '', type: 'percentage', discount: '' });
  const [editingPromo, setEditingPromo] = useState<any>(null);
  const [editingCoupon, setEditingCoupon] = useState<any>(null);

  const { tenantId, branchId } = useTenantBranch();
  const { promotions: dbPromotions, coupons: dbCoupons, updatePromotion, updateCoupon, deletePromotion, deleteCoupon, addPromotion, addCoupon, loading } = usePromotions(tenantId);
  const { orders } = useOrders(tenantId, branchId);
  const { currency, number } = useFormatters();

  const promotions = dbPromotions.map(p => ({
    id: p.id,
    name: p.name || '',
    type: p.type || 'percentage',
    value: Number(p.value) || 0,
    minOrder: Number(p.min_order) || 0,
    maxDiscount: Number(p.max_discount) || null,
    startDate: p.start_date || '',
    endDate: p.end_date || '',
    usageCount: p.usage_count || 0,
    usageLimit: p.usage_limit || null,
    isActive: p.is_active ?? true
  }));

  const coupons = dbCoupons.map(c => ({
    id: c.id,
    code: c.code || '',
    discount: Number(c.discount) || 0,
    type: c.type || 'percentage',
    usageCount: c.usage_count || 0,
    usageLimit: c.usage_limit || null,
    expiryDate: c.expiry_date || null,
    isActive: c.is_active ?? true
  }));

  const activePromotions = promotions.filter(p => p.isActive).length;
  const activeCoupons = coupons.filter(c => c.isActive).length;
  
  const totalPromoUsage = promotions.reduce((sum, p) => sum + p.usageCount, 0);
  const totalCouponUsage = coupons.reduce((sum, c) => sum + c.usageCount, 0);
  const totalUsage = totalPromoUsage + totalCouponUsage;

  const totalDiscount = orders.reduce((sum: number, order: any) => sum + (Number(order.discount) || 0), 0);

  return (
    <MainLayout title="العروض والخصومات" subtitle="إدارة العروض والكوبونات"
      actions={<div className="flex items-center gap-2"><Button variant="outline" onClick={() => setIsAddCouponOpen(true)} className="gap-2 text-xs md:text-sm"><Plus className="w-4 h-4" /><span className="hidden sm:inline">كوبون جديد</span></Button><Button onClick={() => setIsAddOpen(true)} className="gap-2 text-xs md:text-sm"><Plus className="w-4 h-4" /><span className="hidden sm:inline">عرض جديد</span></Button></div>}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Card><CardContent className="p-3 md:p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Percent className="w-5 h-5 md:w-6 md:h-6" /></div><div><p className="text-lg md:text-2xl font-bold">{number(activePromotions)}</p><p className="text-xs md:text-sm text-muted-foreground">عروض نشطة</p></div></div></CardContent></Card>
        <Card><CardContent className="p-3 md:p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-success/10 text-success flex items-center justify-center"><Ticket className="w-5 h-5 md:w-6 md:h-6" /></div><div><p className="text-lg md:text-2xl font-bold">{number(activeCoupons)}</p><p className="text-xs md:text-sm text-muted-foreground">كوبونات نشطة</p></div></div></CardContent></Card>
        <Card><CardContent className="p-3 md:p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-info/10 text-info flex items-center justify-center"><TrendingUp className="w-5 h-5 md:w-6 md:h-6" /></div><div><p className="text-lg md:text-2xl font-bold">{number(totalUsage)}</p><p className="text-xs md:text-sm text-muted-foreground">إجمالي الاستخدام</p></div></div></CardContent></Card>
        <Card><CardContent className="p-3 md:p-4"><div className="flex items-center gap-3"><div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-warning/10 text-warning flex items-center justify-center"><Gift className="w-5 h-5 md:w-6 md:h-6" /></div><div><p className="text-lg md:text-2xl font-bold">{currency(totalDiscount)}</p><p className="text-xs md:text-sm text-muted-foreground">قيمة الخصومات</p></div></div></CardContent></Card>
      </div>

      <Tabs defaultValue="promotions" className="space-y-4">
        <TabsList className="flex-wrap h-auto"><TabsTrigger value="promotions">العروض</TabsTrigger><TabsTrigger value="coupons">الكوبونات</TabsTrigger></TabsList>

        <TabsContent value="promotions" className="space-y-3">
          {promotions.map((promo) => (
            <Card key={promo.id} className={cn(!promo.isActive && 'opacity-60')}>
              <CardContent className="p-3 md:p-4">
                <div className="flex items-center gap-3">
                  <div className={cn('w-10 h-10 md:w-14 md:h-14 rounded-xl flex items-center justify-center text-white font-bold text-sm md:text-lg flex-shrink-0', promo.type === 'percentage' ? 'bg-primary' : promo.type === 'fixed' ? 'bg-success' : 'bg-info')}>
                    {promo.type === 'percentage' ? `${promo.value}%` : promo.type === 'fixed' ? currency(promo.value) : '🚚'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap"><h3 className="font-bold text-sm md:text-lg">{promo.name}</h3><Badge variant={promo.isActive ? 'default' : 'secondary'} className="text-[10px] md:text-xs">{promo.isActive ? 'نشط' : 'غير نشط'}</Badge></div>
                    <div className="flex items-center gap-2 md:gap-4 text-[10px] md:text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><Tag className="w-3 h-3" />الحد الأدنى: {currency(promo.minOrder)}</span>
                      <span className="hidden md:flex items-center gap-1"><Calendar className="w-3 h-3" />{promo.startDate} - {promo.endDate}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
                    {promo.usageLimit && <div className="hidden md:block w-24"><div className="flex justify-between text-xs mb-1"><span>الاستخدام</span><span>{promo.usageCount}/{promo.usageLimit}</span></div><Progress value={(promo.usageCount / promo.usageLimit) * 100} className="h-2" /></div>}
                    <Button variant="ghost" size="icon" onClick={() => setEditingPromo(promo)}><Edit className="w-4 h-4 text-muted-foreground" /></Button>
                    <Button variant="ghost" size="icon" onClick={async () => { if(confirm('هل أنت متأكد من حذف هذا العرض؟')) await deletePromotion(promo.id); }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    <Switch checked={promo.isActive} onCheckedChange={(v) => updatePromotion(promo.id, { is_active: v })} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="coupons" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {coupons.map((coupon) => (
              <Card key={coupon.id} className={cn(!coupon.isActive && 'opacity-60')}>
                <CardContent className="p-3 md:p-4">
                  <div className="flex items-start justify-between mb-3"><div><div className="flex items-center gap-2 mb-2"><code className="text-base md:text-xl font-bold bg-muted px-2 py-1 rounded">{coupon.code}</code><Button variant="ghost" size="icon" className="h-7 w-7"><Copy className="w-4 h-4" /></Button></div><Badge variant={coupon.isActive ? 'default' : 'secondary'}>{coupon.isActive ? 'نشط' : 'غير نشط'}</Badge></div><div className="text-left"><p className="text-xl md:text-2xl font-bold text-primary">{coupon.type === 'percentage' ? `${coupon.discount}%` : currency(coupon.discount)}</p><p className="text-xs text-muted-foreground">خصم</p></div></div>
                  <div className="flex gap-2 mt-3">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditingCoupon(coupon)}><Edit className="w-4 h-4 ml-1" />تعديل</Button>
                    <Button variant="outline" size="icon" className="text-destructive hover:bg-destructive/10" onClick={async () => { if(confirm('هل أنت متأكد من حذف هذا الكوبون؟')) await deleteCoupon(coupon.id); }}><Trash2 className="w-4 h-4" /></Button>
                    <Switch checked={coupon.isActive} onCheckedChange={(v) => updateCoupon(coupon.id, { is_active: v })} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة عرض جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">اسم العرض</label>
              <Input
                value={newPromo.name}
                onChange={(e) => setNewPromo({ ...newPromo, name: e.target.value })}
                placeholder="اسم العرض"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">النوع</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={newPromo.type} 
                  onChange={(e) => setNewPromo({ ...newPromo, type: e.target.value })}
                >
                  <option value="percentage">نسبة مئوية</option>
                  <option value="fixed">مبلغ ثابت</option>
                  <option value="free_delivery">توصيل مجاني</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">القيمة</label>
                <Input
                  type="number"
                  value={newPromo.value}
                  onChange={(e) => setNewPromo({ ...newPromo, value: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">الحد الأدنى للطلب</label>
              <Input
                type="number"
                value={newPromo.minOrder}
                onChange={(e) => setNewPromo({ ...newPromo, minOrder: e.target.value })}
                placeholder="0"
              />
            </div>
            <Button
              className="w-full mt-4"
              disabled={!newPromo.name}
              onClick={async () => {
                const success = await addPromotion({
                  name: newPromo.name,
                  type: newPromo.type,
                  value: Number(newPromo.value),
                  min_order: Number(newPromo.minOrder),
                  start_date: new Date().toISOString().split('T')[0],
                  end_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
                  usage_count: 0,
                  is_active: true
                });
                if (success) {
                  setIsAddOpen(false);
                  setNewPromo({ name: '', type: 'percentage', value: '', minOrder: '', startDate: '', endDate: '' });
                }
              }}
            >
              حفظ العرض
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      <Dialog open={isAddCouponOpen} onOpenChange={setIsAddCouponOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة كوبون جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">كود الكوبون</label>
              <Input
                value={newCoupon.code}
                onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() })}
                placeholder="مثال: SUMMER2024"
                dir="ltr"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">النوع</label>
                <select 
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={newCoupon.type} 
                  onChange={(e) => setNewCoupon({ ...newCoupon, type: e.target.value })}
                >
                  <option value="percentage">نسبة مئوية</option>
                  <option value="fixed">مبلغ ثابت</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">قيمة الخصم</label>
                <Input
                  type="number"
                  value={newCoupon.discount}
                  onChange={(e) => setNewCoupon({ ...newCoupon, discount: e.target.value })}
                  placeholder="20"
                />
              </div>
            </div>
            <Button
              className="w-full mt-4"
              disabled={!newCoupon.code || !newCoupon.discount}
              onClick={async () => {
                const success = await addCoupon({
                  code: newCoupon.code,
                  type: newCoupon.type,
                  discount: Number(newCoupon.discount),
                  usage_count: 0,
                  is_active: true
                });
                if (success) {
                  setIsAddCouponOpen(false);
                  setNewCoupon({ code: '', type: 'percentage', discount: '' });
                }
              }}
            >
              حفظ الكوبون
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!editingPromo} onOpenChange={(open) => !open && setEditingPromo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل العرض</DialogTitle>
          </DialogHeader>
          {editingPromo && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">اسم العرض</label>
                <Input
                  value={editingPromo.name}
                  onChange={(e) => setEditingPromo({ ...editingPromo, name: e.target.value })}
                  placeholder="اسم العرض"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">النوع</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={editingPromo.type} 
                    onChange={(e) => setEditingPromo({ ...editingPromo, type: e.target.value })}
                  >
                    <option value="percentage">نسبة مئوية</option>
                    <option value="fixed">مبلغ ثابت</option>
                    <option value="free_delivery">توصيل مجاني</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">القيمة</label>
                  <Input
                    type="number"
                    value={editingPromo.value}
                    onChange={(e) => setEditingPromo({ ...editingPromo, value: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">الحد الأدنى للطلب</label>
                <Input
                  type="number"
                  value={editingPromo.minOrder}
                  onChange={(e) => setEditingPromo({ ...editingPromo, minOrder: Number(e.target.value) })}
                  placeholder="0"
                />
              </div>
              <Button
                className="w-full mt-4"
                disabled={!editingPromo.name}
                onClick={async () => {
                  const success = await updatePromotion(editingPromo.id, {
                    name: editingPromo.name,
                    type: editingPromo.type,
                    value: Number(editingPromo.value),
                    min_order: Number(editingPromo.minOrder)
                  });
                  if (success) {
                    setEditingPromo(null);
                  }
                }}
              >
                تحديث العرض
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      <Dialog open={!!editingCoupon} onOpenChange={(open) => !open && setEditingCoupon(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل الكوبون</DialogTitle>
          </DialogHeader>
          {editingCoupon && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">كود الكوبون</label>
                <Input
                  value={editingCoupon.code}
                  onChange={(e) => setEditingCoupon({ ...editingCoupon, code: e.target.value })}
                  placeholder="مثال: SUMMER2023"
                  dir="ltr"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">النوع</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    value={editingCoupon.type} 
                    onChange={(e) => setEditingCoupon({ ...editingCoupon, type: e.target.value })}
                  >
                    <option value="percentage">نسبة مئوية</option>
                    <option value="fixed">مبلغ ثابت</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">قيمة الخصم</label>
                  <Input
                    type="number"
                    value={editingCoupon.discount}
                    onChange={(e) => setEditingCoupon({ ...editingCoupon, discount: Number(e.target.value) })}
                    placeholder="20"
                  />
                </div>
              </div>
              <Button
                className="w-full mt-4"
                disabled={!editingCoupon.code}
                onClick={async () => {
                  const success = await updateCoupon(editingCoupon.id, {
                    code: editingCoupon.code,
                    type: editingCoupon.type,
                    discount: Number(editingCoupon.discount)
                  });
                  if (success) {
                    setEditingCoupon(null);
                  }
                }}
              >
                تحديث الكوبون
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
