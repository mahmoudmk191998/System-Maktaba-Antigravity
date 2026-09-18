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
import { Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { ChartAccount } from '@/types/retail.types';
import { createAndPostJournalEntry, CreateJournalLineInput } from '@/services/accounting/journal.service';
import { getChartOfAccounts } from '@/services/accounting/chartOfAccounts.service';

interface NewJournalEntryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string;
  onSuccess: () => void;
}

interface DraftLine {
  id: string;
  accountId: string;
  debit: string;
  credit: string;
  description: string;
}

export function NewJournalEntryModal({
  open,
  onOpenChange,
  tenantId,
  userId,
  onSuccess,
}: NewJournalEntryModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    { id: '1', accountId: '', debit: '', credit: '', description: '' },
    { id: '2', accountId: '', debit: '', credit: '', description: '' },
  ]);

  useEffect(() => {
    if (open && tenantId) {
      getChartOfAccounts(tenantId).then((data) => {
        // Only accounts that allow posting
        setAccounts(data.filter((a) => a.allowPosting));
      });
    }
  }, [open, tenantId]);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { id: crypto.randomUUID(), accountId: '', debit: '', credit: '', description: '' },
    ]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 2) {
      toast({
        title: 'تنبيه',
        description: 'يجب أن يحتوي القيد على سطرين على الأقل',
        variant: 'destructive',
      });
      return;
    }
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, field: keyof DraftLine, val: string) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };

      // Mutual exclusivity between debit and credit
      if (field === 'debit' && Number(val) > 0) {
        copy[idx].credit = '';
      } else if (field === 'credit' && Number(val) > 0) {
        copy[idx].debit = '';
      }

      return copy;
    });
  };

  // Calculations
  const totalDebit = lines.reduce((sum, l) => sum + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (Number(l.credit) || 0), 0);
  const roundedDebit = Math.round(totalDebit * 100) / 100;
  const roundedCredit = Math.round(totalCredit * 100) / 100;
  const difference = Math.round(Math.abs(roundedDebit - roundedCredit) * 100) / 100;
  const isBalanced = difference < 0.001 && roundedDebit > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      toast({ title: 'خطأ', description: 'يرجى كتابة بيان القيد المحاسبي', variant: 'destructive' });
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.accountId) {
        toast({ title: 'خطأ', description: `يرجى اختيار الحساب في السطر رقم ${i + 1}`, variant: 'destructive' });
        return;
      }
      const dr = Number(l.debit) || 0;
      const cr = Number(l.credit) || 0;
      if (dr === 0 && cr === 0) {
        toast({ title: 'خطأ', description: `يرجى إدخال مبلغ مدين أو دائن في السطر رقم ${i + 1}`, variant: 'destructive' });
        return;
      }
    }

    if (!isBalanced) {
      toast({
        title: 'القيد غير متوازن',
        description: `إجمالي المدين (${roundedDebit}) لا يساوي إجمالي الدائن (${roundedCredit}). الفارق: ${difference}`,
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const formattedLines: CreateJournalLineInput[] = lines.map((l) => ({
        accountId: l.accountId,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        description: l.description || description,
      }));

      await createAndPostJournalEntry({
        tenantId,
        date,
        postingDate: date,
        sourceType: 'manual',
        sourceId: `manual_${Date.now()}`,
        description: description.trim(),
        createdBy: userId,
        lines: formattedLines,
      });

      toast({ title: 'تم ترحيل القيد بنجاح', description: 'تم إدراج القيد في دفتر اليومية وتحديث أرصدة الحسابات' });
      onOpenChange(false);
      onSuccess();
      // Reset form
      setDescription('');
      setLines([
        { id: '1', accountId: '', debit: '', credit: '', description: '' },
        { id: '2', accountId: '', debit: '', credit: '', description: '' },
      ]);
    } catch (err: any) {
      toast({
        title: 'فشل ترحيل القيد',
        description: err.message || 'حدث خطأ أثناء حفظ القيد المحاسبي',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <span>إنشاء قيد يومية يدوي (Manual Journal Entry)</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>تاريخ القيد</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="md:col-span-2">
              <Label>البيان العام للقيد</Label>
              <Input
                placeholder="مثال: إثبات إيجار شهر أكتوبر / تسوية بنكية..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Lines Table */}
          <div className="border rounded-lg overflow-hidden bg-background">
            <div className="bg-muted/50 p-3 grid grid-cols-12 gap-2 text-sm font-semibold text-muted-foreground border-b">
              <div className="col-span-5">الحساب المالي (Account)</div>
              <div className="col-span-3">البيان الفرعي (ملاحظات)</div>
              <div className="col-span-2 text-center">مدين (Debit)</div>
              <div className="col-span-2 text-center">دائن (Credit)</div>
            </div>

            <div className="divide-y max-h-[350px] overflow-y-auto p-2 space-y-2">
              {lines.map((line, idx) => (
                <div key={line.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <Select
                      value={line.accountId}
                      onValueChange={(val) => updateLine(idx, 'accountId', val)}
                    >
                      <SelectTrigger className="w-full text-xs">
                        <SelectValue placeholder="اختر الحساب..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {accounts.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id} className="text-xs">
                            <span className="font-mono text-muted-foreground ml-1">{acc.accountCode}</span>
                            <span>{acc.name}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-3">
                    <Input
                      placeholder="بيان اختياري"
                      value={line.description}
                      onChange={(e) => updateLine(idx, 'description', e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="col-span-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={line.debit}
                      onChange={(e) => updateLine(idx, 'debit', e.target.value)}
                      className="text-xs text-center font-mono h-9"
                    />
                  </div>

                  <div className="col-span-2 flex items-center gap-1">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={line.credit}
                      onChange={(e) => updateLine(idx, 'credit', e.target.value)}
                      className="text-xs text-center font-mono h-9"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                      onClick={() => removeLine(idx)}
                      disabled={lines.length <= 2}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-2 border-t bg-muted/20 flex justify-between items-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addLine}
                className="gap-1 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة طرف قيد آخر</span>
              </Button>

              <div className="flex items-center gap-6 text-sm font-semibold">
                <div>
                  إجمالي المدين: <span className="font-mono text-primary">{roundedDebit.toFixed(2)}</span>
                </div>
                <div>
                  إجمالي الدائن: <span className="font-mono text-primary">{roundedCredit.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Balance Status Banner */}
          <div
            className={`p-3 rounded-lg border flex items-center justify-between text-sm ${
              isBalanced
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-400'
            }`}
          >
            <div className="flex items-center gap-2">
              {isBalanced ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>القيد متوازن وجاهز للترحيل الفوري في الأستاذ العام</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4" />
                  <span>
                    القيد غير متوازن! الفارق بين المدين والدائن: <strong>{difference.toFixed(2)}</strong>
                  </span>
                </>
              )}
            </div>
            <div className="font-mono text-xs">
              Δ = {difference.toFixed(2)}
            </div>
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
            <Button
              type="submit"
              disabled={loading || !isBalanced}
              className="gap-1 min-w-[120px]"
            >
              {loading ? 'جاري الترحيل...' : 'ترحيل القيد'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
