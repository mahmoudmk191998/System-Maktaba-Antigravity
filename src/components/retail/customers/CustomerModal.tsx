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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AlertCircle, UserCheck } from 'lucide-react';
import type { Customer, CustomerType } from '@/types/retail.types';
import { usePriceLists } from '@/hooks/retail/usePriceLists';

interface CustomerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
  onSave: (data: any) => Promise<void>;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  open,
  onOpenChange,
  customer,
  onSave,
}) => {
  const { priceLists } = usePriceLists();

  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [customerType, setCustomerType] = useState<CustomerType>('retail');
  const [phone, setPhone] = useState('');
  const [phone2, setPhone2] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [commercialRegistration, setCommercialRegistration] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [creditEnabled, setCreditEnabled] = useState(false);
  const [creditLimit, setCreditLimit] = useState<number>(0);
  const [paymentTermsDays, setPaymentTermsDays] = useState<number>(30);
  const [openingBalance, setOpeningBalance] = useState<number>(0);
  const [defaultPriceListId, setDefaultPriceListId] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customer) {
      setName(customer.name || '');
      setCompanyName(customer.companyName || '');
      setCustomerType(customer.customerType || 'retail');
      setPhone(customer.phone || '');
      setPhone2(customer.phone2 || '');
      setEmail(customer.email || '');
      setAddress(customer.address || '');
      setCity(customer.city || '');
      setTaxNumber(customer.taxNumber || '');
      setCommercialRegistration(customer.commercialRegistration || '');
      setContactPerson(customer.contactPerson || '');
      setCreditEnabled(!!customer.creditEnabled);
      setCreditLimit(customer.creditLimit || 0);
      setPaymentTermsDays(customer.paymentTermsDays || 30);
      setOpeningBalance(0); // Not editable on update
      setDefaultPriceListId(customer.defaultPriceListId || '');
      setNotes(customer.notes || '');
    } else {
      setName('');
      setCompanyName('');
      setCustomerType('retail');
      setPhone('');
      setPhone2('');
      setEmail('');
      setAddress('');
      setCity('');
      setTaxNumber('');
      setCommercialRegistration('');
      setContactPerson('');
      setCreditEnabled(false);
      setCreditLimit(0);
      setPaymentTermsDays(30);
      setOpeningBalance(0);
      setDefaultPriceListId('');
      setNotes('');
    }
    setError(null);
  }, [customer, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError('اسم العميل ورقم الهاتف حقول إلزامية');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: any = {
        name: name.trim(),
        companyName: companyName.trim() || undefined,
        customerType,
        phone: phone.trim(),
        phone2: phone2.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        taxNumber: taxNumber.trim() || undefined,
        commercialRegistration: commercialRegistration.trim() || undefined,
        contactPerson: contactPerson.trim() || undefined,
        creditEnabled,
        creditLimit: creditEnabled ? creditLimit : 0,
        paymentTermsDays,
        defaultPriceListId: defaultPriceListId || null,
        notes: notes.trim() || undefined,
      };

      if (!customer) {
        payload.openingBalance = openingBalance;
      }

      await onSave(payload);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء الحفظ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <UserCheck className="w-5 h-5" />
            {customer ? 'تعديل بيانات العميل' : 'إضافة عميل جديد'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-md flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cust_name">اسم العميل *</Label>
              <Input
                id="cust_name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: مدرسة النور الخاصة"
                required
              />
            </div>
            <div>
              <Label htmlFor="cust_company">اسم المنشأة / الشركة (اختياري)</Label>
              <Input
                id="cust_company"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="الاسم التجاري الرسمي..."
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="cust_type">نوع العميل *</Label>
              <Select value={customerType} onValueChange={(v: any) => setCustomerType(v)}>
                <SelectTrigger id="cust_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="retail">قطاعي / فردي (Retail)</SelectItem>
                  <SelectItem value="wholesale">تاجر جملة (Wholesale)</SelectItem>
                  <SelectItem value="school">مدرسة / حضانة (School)</SelectItem>
                  <SelectItem value="company">شركة خاصة (Company)</SelectItem>
                  <SelectItem value="teacher">مدرس / أكاديمي (Teacher)</SelectItem>
                  <SelectItem value="corporate">مؤسسة كبرى (Corporate)</SelectItem>
                  <SelectItem value="government">جهة حكومية (Government)</SelectItem>
                  <SelectItem value="other">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cust_phone">الهاتف الأساسي *</Label>
              <Input
                id="cust_phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01012345678"
                required
              />
            </div>
            <div>
              <Label htmlFor="cust_phone2">هاتف إضافي</Label>
              <Input
                id="cust_phone2"
                value={phone2}
                onChange={(e) => setPhone2(e.target.value)}
                placeholder="01234567890"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cust_email">البريد الإلكتروني</Label>
              <Input
                id="cust_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@school.com"
              />
            </div>
            <div>
              <Label htmlFor="cust_contact">الشخص المسؤول / المسؤول الإداري</Label>
              <Input
                id="cust_contact"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="اسم جهة الاتصال بالمؤسسة"
              />
            </div>
          </div>

          {/* Tax & Commercial */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cust_tax">الرقم الضريبي</Label>
              <Input
                id="cust_tax"
                value={taxNumber}
                onChange={(e) => setTaxNumber(e.target.value)}
                placeholder="123-456-789"
              />
            </div>
            <div>
              <Label htmlFor="cust_comm">السجل التجاري</Label>
              <Input
                id="cust_comm"
                value={commercialRegistration}
                onChange={(e) => setCommercialRegistration(e.target.value)}
                placeholder="رقم القيد بالسجل"
              />
            </div>
          </div>

          {/* Address */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cust_addr">العنوان</Label>
              <Input
                id="cust_addr"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="العنوان التفصيلي"
              />
            </div>
            <div>
              <Label htmlFor="cust_city">المدينة / الحي</Label>
              <Input
                id="cust_city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="مثال: مدينة نصر، القاهرة"
              />
            </div>
          </div>

          {/* Price List Assignment */}
          <div>
            <Label htmlFor="cust_plist">قائمة الأسعار الافتراضية للعميل</Label>
            <Select value={defaultPriceListId || 'none'} onValueChange={(v) => setDefaultPriceListId(v === 'none' ? '' : v)}>
              <SelectTrigger id="cust_plist">
                <SelectValue placeholder="اختر قائمة الأسعار..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">بدون قائمة مخصصة (الأسعار القياسية)</SelectItem>
                {priceLists.map((pl) => (
                  <SelectItem key={pl.id} value={pl.id}>
                    {pl.name} {pl.customerType ? `(${pl.customerType})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Credit & Terms Box */}
          <div className="border rounded-lg p-3 bg-slate-50 space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <Label htmlFor="cust_credit" className="font-semibold text-slate-800">تفعيل البيع الآجل (Credit Sales)</Label>
                <p className="text-[11px] text-slate-500">السماح بإصدار فواتير بيع آجلة وسحب بضاعة بحد ائتماني</p>
              </div>
              <Switch
                id="cust_credit"
                checked={creditEnabled}
                onCheckedChange={setCreditEnabled}
              />
            </div>

            {creditEnabled && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                <div>
                  <Label htmlFor="cust_limit">سقف الائتمان الأقصى (ج.م) *</Label>
                  <Input
                    id="cust_limit"
                    type="number"
                    min="0"
                    step="100"
                    value={creditLimit || ''}
                    onChange={(e) => setCreditLimit(Number(e.target.value))}
                    placeholder="مثال: 10000"
                    className="font-bold"
                  />
                </div>
                <div>
                  <Label htmlFor="cust_terms">فترة السداد الممنوحة (بالأيام)</Label>
                  <Input
                    id="cust_terms"
                    type="number"
                    min="1"
                    value={paymentTermsDays || ''}
                    onChange={(e) => setPaymentTermsDays(Number(e.target.value))}
                    placeholder="30"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Opening Balance (New Customers Only) */}
          {!customer && (
            <div>
              <Label htmlFor="cust_open">الرصيد الافتتاحي (ج.م)</Label>
              <Input
                id="cust_open"
                type="number"
                step="1"
                value={openingBalance || ''}
                onChange={(e) => setOpeningBalance(Number(e.target.value))}
                placeholder="موجب = العميل مدين للمكتبة، سالب = رصيد دائن للعميل"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                * الرقم الموجب يثبت مديونية مستحقة على العميل من فترات سابقة، والرقم السالب يثبت دفعة مقدمة دائنة.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="cust_notes">ملاحظات</Label>
            <Input
              id="cust_notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات تخص التعامل التجاري مع العميل..."
            />
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'جارٍ الحفظ...' : customer ? 'تحديث البيانات' : 'إضافة العميل'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
