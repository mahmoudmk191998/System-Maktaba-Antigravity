import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RotateCcw, FileText, CheckCircle, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import type { JournalEntry } from '@/types/retail.types';
import { reverseJournalEntry } from '@/services/accounting/journal.service';

interface JournalDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: JournalEntry | null;
  tenantId: string;
  userId: string;
  onReversalSuccess: () => void;
}

export function JournalDetailsDrawer({
  open,
  onOpenChange,
  entry,
  tenantId,
  userId,
  onReversalSuccess,
}: JournalDetailsDrawerProps) {
  const { toast } = useToast();
  const [reversing, setReversing] = useState(false);
  const [reversalReason, setReversalReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!entry) return null;

  const handleReverse = async () => {
    if (!reversalReason.trim()) {
      toast({ title: 'تنبيه', description: 'يرجى كتابة سبب عكس القيد المحاسبي', variant: 'destructive' });
      return;
    }

    setReversing(true);
    try {
      await reverseJournalEntry({
        tenantId,
        journalEntryId: entry.id,
        reversedBy: userId,
        reason: reversalReason.trim(),
      });

      toast({
        title: 'تم عكس القيد بنجاح',
        description: `تم إنشاء قيد عكسي لقيد رقم ${entry.journalNumber} وتحديث أرصدة الحسابات`,
      });
      setConfirmOpen(false);
      onOpenChange(false);
      onReversalSuccess();
    } catch (err: any) {
      toast({
        title: 'فشل عكس القيد',
        description: err.message || 'حدث خطأ أثناء عكس القيد المحاسبي',
        variant: 'destructive',
      });
    } finally {
      setReversing(false);
    }
  };

  const isReversed = entry.status === 'reversed';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-xl font-bold flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              <span>تفاصيل القيد المحاسبي</span>
            </SheetTitle>
            <Badge
              variant={isReversed ? 'destructive' : 'default'}
              className="text-xs"
            >
              {isReversed ? 'تم عكسه (Reversed)' : 'مُرحل في الأستاذ (Posted)'}
            </Badge>
          </div>
          <SheetDescription className="text-sm font-mono pt-1">
            رقم القيد: {entry.journalNumber}
          </SheetDescription>
        </SheetHeader>

        <div className="py-4 space-y-5">
          {/* Metadata Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="p-3 bg-muted/40 rounded-lg">
              <div className="text-muted-foreground text-xs">تاريخ الترحيل</div>
              <div className="font-semibold">{entry.postingDate}</div>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg">
              <div className="text-muted-foreground text-xs">مصدر القيد</div>
              <div className="font-semibold font-mono text-xs">{entry.sourceType}</div>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg">
              <div className="text-muted-foreground text-xs">إجمالي القيد</div>
              <div className="font-bold text-primary font-mono">{entry.totalDebit.toFixed(2)} EGP</div>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1 font-medium">البيان العام للقيد</div>
            <div className="p-3 bg-muted/20 border rounded-lg text-sm">{entry.description}</div>
          </div>

          {isReversed && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 rounded-lg text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">هذا القيد تم عكسه بقيد محاسبي مضاد</div>
                {entry.reversalReason && <div className="text-xs mt-0.5">السبب: {entry.reversalReason}</div>}
              </div>
            </div>
          )}

          {/* Lines Table */}
          <div>
            <div className="font-semibold text-sm mb-2">أطراف القيد المحاسبي (Journal Lines)</div>
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted/50 p-2.5 grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground border-b">
                <div className="col-span-6">الحساب المالي</div>
                <div className="col-span-3 text-center">مدين (Debit)</div>
                <div className="col-span-3 text-center">دائن (Credit)</div>
              </div>

              <div className="divide-y text-xs">
                {entry.lines.map((line) => (
                  <div key={line.id} className="p-2.5 grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6">
                      <div className="font-medium text-foreground">
                        <span className="font-mono text-muted-foreground ml-1.5">{line.accountCodeSnapshot}</span>
                        {line.accountNameSnapshot}
                      </div>
                      {line.description && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">{line.description}</div>
                      )}
                    </div>

                    <div className="col-span-3 text-center font-mono font-semibold">
                      {line.debit > 0 ? (
                        <span className="text-emerald-600 dark:text-emerald-400">{line.debit.toFixed(2)}</span>
                      ) : (
                        <span className="text-muted-foreground/40">-</span>
                      )}
                    </div>

                    <div className="col-span-3 text-center font-mono font-semibold">
                      {line.credit > 0 ? (
                        <span className="text-blue-600 dark:text-blue-400">{line.credit.toFixed(2)}</span>
                      ) : (
                        <span className="text-muted-foreground/40">-</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-muted/30 p-2.5 grid grid-cols-12 gap-2 text-xs font-bold border-t">
                <div className="col-span-6">الإجمالي المتوازن:</div>
                <div className="col-span-3 text-center font-mono text-emerald-600 dark:text-emerald-400">
                  {entry.totalDebit.toFixed(2)}
                </div>
                <div className="col-span-3 text-center font-mono text-blue-600 dark:text-blue-400">
                  {entry.totalCredit.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <SheetFooter className="border-t pt-4 flex sm:justify-between items-center">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>

          {!isReversed && (
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-1 text-xs">
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>عكس القيد (Reversal)</span>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>هل أنت متأكد من رغبتك في عكس هذا القيد؟</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-3 pt-2">
                    <div>
                      سيتم إنشاء قيد يومية عكسي متطابق (عكس الأطراف المدينة والدائنة)
                      لتصفير أثر هذا القيد على الأستاذ العام بصورة محاسبية دقيقة ومحمية من الحذف.
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-foreground">سبب عكس القيد:</Label>
                      <Input
                        placeholder="اكتب سبب العكس (مثال: خطأ في إدخال الحساب)..."
                        value={reversalReason}
                        onChange={(e) => setReversalReason(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>تراجع</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleReverse}
                    disabled={reversing || !reversalReason.trim()}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    {reversing ? 'جاري العكس...' : 'تأكيد عكس القيد'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
