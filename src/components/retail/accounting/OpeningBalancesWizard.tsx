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
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, ShieldCheck, Scale, AlertCircle } from 'lucide-react';
import {
  executeOpeningBalanceMigration,
  getOpeningBalanceMigration,
} from '@/services/accounting/openingBalances.service';
import { reconcileARSubledger, reconcileAPSubledger, reconcileInventory } from '@/services/accounting/reconciliation.service';

interface OpeningBalancesWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string;
  onSuccess: () => void;
}

export function OpeningBalancesWizard({
  open,
  onOpenChange,
  tenantId,
  userId,
  onSuccess,
}: OpeningBalancesWizardProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [alreadyMigrated, setAlreadyMigrated] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [inventoryVal, setInventoryVal] = useState('0');
  const [arVal, setArVal] = useState('0');
  const [apVal, setApVal] = useState('0');
  const [cashVal, setCashVal] = useState('0');
  const [bankVal, setBankVal] = useState('0');

  useEffect(() => {
    if (open && tenantId) {
      setScanning(true);
      getOpeningBalanceMigration(tenantId)
        .then(async (mig) => {
          if (mig) {
            setAlreadyMigrated(true);
            setInventoryVal(String(mig.inventorySnapshotValue));
            setArVal(String(mig.arSnapshotValue));
            setApVal(String(mig.apSnapshotValue));
            setCashVal(String(mig.cashSnapshotValue));
            setBankVal(String(mig.bankSnapshotValue));
            setDate(mig.migrationDate);
          } else {
            setAlreadyMigrated(false);
            // Auto-scan current subledgers
            try {
              const [invRes, arRes, apRes] = await Promise.all([
                reconcileInventory(tenantId).catch(() => null),
                reconcileARSubledger(tenantId).catch(() => null),
                reconcileAPSubledger(tenantId).catch(() => null),
              ]);

              if (invRes) setInventoryVal(String(invRes.stockValuationTotal));
              if (arRes) setArVal(String(arRes.subledgerTotal));
              if (apRes) setApVal(String(apRes.subledgerTotal));
            } catch (e) {
              console.error(e);
            }
          }
        })
        .finally(() => setScanning(false));
    }
  }, [open, tenantId]);

  // Real-time calculation of Balancing Owner Capital
  const invNum = Number(inventoryVal) || 0;
  const arNum = Number(arVal) || 0;
  const cashNum = Number(cashVal) || 0;
  const bankNum = Number(bankVal) || 0;
  const apNum = Number(apVal) || 0;

  const totalAssets = Math.round((invNum + arNum + cashNum + bankNum) * 100) / 100;
  const totalLiabilities = Math.round(apNum * 100) / 100;
  const netOpeningEquity = Math.round((totalAssets - totalLiabilities) * 100) / 100;

  const handleExecute = async () => {
    setLoading(true);
    try {
      await executeOpeningBalanceMigration({
        tenantId,
        migrationDate: date,
        cashBalance: cashNum,
        bankBalance: bankNum,
        migratedBy: userId,
        customInventoryValuation: invNum,
        customArTotal: arNum,
        customApTotal: apNum,
      });

      toast({
        title: 'تم اعتماد الأرصدة الافتتاحية بنجاح',
        description: 'تم إنشاء القيد الافتتاحي وتأمين الرصيد التأسيسي للمنشأة',
      });
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({
        title: 'فشل ترحيل الأرصدة الافتتاحية',
        description: err.message || 'حدث خطأ أثناء اعتماد الأرصدة',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            <span>معالج اعتماد الأرصدة الافتتاحية (Opening Balances Wizard)</span>
          </DialogTitle>
        </DialogHeader>

        {alreadyMigrated && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 rounded-lg text-sm flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 shrink-0" />
            <div>
              تم ترحيل واعتماد الأرصدة الافتتاحية لهذه المنشأة مسبقاً في تاريخ <strong>{date}</strong>. لا يمكن إعادة الترحيل لتجنب التكرار.
            </div>
          </div>
        )}

        <div className="space-y-4 text-sm">
          <div>
            <Label>تاريخ بداية الفترة المحاسبية (Go-Live Date)</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={alreadyMigrated || loading}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Asset Side */}
            <div className="space-y-3 p-3 bg-muted/30 border rounded-lg">
              <div className="font-semibold text-xs text-primary uppercase">أصول المنشأة الافتتاحية (Debit)</div>

              <div>
                <Label className="text-xs">تقييم المخزون التأسيسي (1140)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={inventoryVal}
                  onChange={(e) => setInventoryVal(e.target.value)}
                  disabled={alreadyMigrated || loading || scanning}
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <Label className="text-xs">مديونيات العملاء المستحقة (1130)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={arVal}
                  onChange={(e) => setArVal(e.target.value)}
                  disabled={alreadyMigrated || loading || scanning}
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <Label className="text-xs">رصيد النقدية بالخزائن (1111)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={cashVal}
                  onChange={(e) => setCashVal(e.target.value)}
                  disabled={alreadyMigrated || loading}
                  className="font-mono text-sm"
                />
              </div>

              <div>
                <Label className="text-xs">رصيد الحسابات البنكية (1120)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={bankVal}
                  onChange={(e) => setBankVal(e.target.value)}
                  disabled={alreadyMigrated || loading}
                  className="font-mono text-sm"
                />
              </div>

              <div className="pt-2 border-t flex justify-between font-bold text-xs">
                <span>إجمالي الأصول:</span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">{totalAssets.toFixed(2)} EGP</span>
              </div>
            </div>

            {/* Liabilities & Equity Side */}
            <div className="space-y-3 p-3 bg-muted/30 border rounded-lg">
              <div className="font-semibold text-xs text-primary uppercase">الالتزامات وحقوق الملكية (Credit)</div>

              <div>
                <Label className="text-xs">مستحقات الموردين القائمة (2110)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={apVal}
                  onChange={(e) => setApVal(e.target.value)}
                  disabled={alreadyMigrated || loading || scanning}
                  className="font-mono text-sm"
                />
              </div>

              <div className="p-3 bg-background border rounded-lg space-y-1">
                <div className="text-xs font-semibold text-muted-foreground">رأس المال الافتتاحي الموازن (3100)</div>
                <div className="text-xl font-bold font-mono text-primary">
                  {netOpeningEquity.toFixed(2)} EGP
                </div>
                <div className="text-[11px] text-muted-foreground">
                  يُحسب تلقائياً وفق معادلة الميزانية: الأصول - الالتزامات = حقوق الملكية
                </div>
              </div>

              <div className="pt-2 border-t flex justify-between font-bold text-xs">
                <span>إجمالي الخصوم وحقوق الملكية:</span>
                <span className="font-mono text-blue-600 dark:text-blue-400">
                  {(totalLiabilities + netOpeningEquity).toFixed(2)} EGP
                </span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400 rounded-lg text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <div>
              الترحيل ذري ومتوازن تماماً بنسبة 100%: إجمالي المدين = إجمالي الدائن = <strong>{totalAssets.toFixed(2)} EGP</strong>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إغلاق
          </Button>
          {!alreadyMigrated && (
            <Button
              onClick={handleExecute}
              disabled={loading || scanning}
              className="min-w-[140px]"
            >
              {loading ? 'جاري الترحيل...' : 'اعتماد وترحيل الأرصدة'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
