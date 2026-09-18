import { useState, useEffect } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import type { ChartAccount, AccountType, NormalBalance } from '@/types/retail.types';
import { createChartAccount } from '@/services/accounting/chartOfAccounts.service';

interface NewAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  existingAccounts: ChartAccount[];
  onSuccess: () => void;
}

export function NewAccountModal({
  open,
  onOpenChange,
  tenantId,
  existingAccounts,
  onSuccess,
}: NewAccountModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [accountCode, setAccountCode] = useState('');
  const [name, setName] = useState('');
  const [accountType, setAccountType] = useState<AccountType>('asset');
  const [parentId, setParentId] = useState<string>('none');
  const [normalBalance, setNormalBalance] = useState<NormalBalance>('debit');
  const [allowPosting, setAllowPosting] = useState(true);
  const [description, setDescription] = useState('');

  // Automatically adjust normal balance when account type changes
  useEffect(() => {
    if (['asset', 'cogs', 'expense'].includes(accountType)) {
      setNormalBalance('debit');
    } else {
      setNormalBalance('credit');
    }
  }, [accountType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountCode.trim() || !name.trim()) {
      toast({ title: 'خطأ', description: 'يرجى إدخال رمز الحساب واسمه', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      await createChartAccount({
        tenantId,
        accountCode: accountCode.trim(),
        name: name.trim(),
        accountType,
        parentId: parentId === 'none' ? null : parentId,
        normalBalance,
        allowPosting,
        description: description.trim(),
      });

      toast({ title: 'تم إنشاء الحساب بنجاح', description: `تمت إضافة الحساب ${accountCode} - ${name} لشجرة الحسابات` });
      onOpenChange(false);
      onSuccess();
      // Reset
      setAccountCode('');
      setName('');
      setDescription('');
      setParentId('none');
    } catch (err: any) {
      toast({
        title: 'فشل إنشاء الحساب',
        description: err.message || 'حدث خطأ أثناء حفظ الحساب المالي',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            إضافة حساب مالي جديد إلى شجرة الحسابات
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>رمز / رقم الحساب (Code)</Label>
              <Input
                placeholder="مثال: 1113"
                value={accountCode}
                onChange={(e) => setAccountCode(e.target.value)}
                className="font-mono text-sm"
                required
              />
            </div>
            <div>
              <Label>نوع الحساب الرئيسي</Label>
              <Select
                value={accountType}
                onValueChange={(val) => setAccountType(val as AccountType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asset">أصول (Assets)</SelectItem>
                  <SelectItem value="liability">خصوم / التزامات (Liabilities)</SelectItem>
                  <SelectItem value="equity">حقوق ملكية (Equity)</SelectItem>
                  <SelectItem value="revenue">إيرادات (Revenue)</SelectItem>
                  <SelectItem value="cogs">تكلفة مبيعات (COGS)</SelectItem>
                  <SelectItem value="expense">مصروفات تشغيل (Expenses)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>اسم الحساب</Label>
            <Input
              placeholder="مثال: خزينة فرع المعادي / مصروفات شحن..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>الحساب الرئيسي التابع له</Label>
              <Select
                value={parentId}
                onValueChange={setParentId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="بدون (حساب رئيسي أول)" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="none">بدون (حساب مستوى أول)</SelectItem>
                  {existingAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      {acc.accountCode} - {acc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>طبيعة الحساب الأصلية</Label>
              <Select
                value={normalBalance}
                onValueChange={(val) => setNormalBalance(val as NormalBalance)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">مدين (Debit)</SelectItem>
                  <SelectItem value="credit">دائن (Credit)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center space-x-2 space-x-reverse pt-2">
            <Checkbox
              id="allowPosting"
              checked={allowPosting}
              onCheckedChange={(c) => setAllowPosting(Boolean(c))}
            />
            <label
              htmlFor="allowPosting"
              className="text-sm font-medium leading-none cursor-pointer"
            >
              حساب فرعي يقبل الترحيل المباشر عليه (Sub-account for posting)
            </label>
          </div>

          <div>
            <Label>وصف أو ملاحظات إضافية (اختياري)</Label>
            <Input
              placeholder="وصف استخدام هذا الحساب..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              إلغاء
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'جاري الحفظ...' : 'حفظ الحساب'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
