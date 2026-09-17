import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { DollarSign, CheckCircle2, Clock, HandCoins, Users } from 'lucide-react';
import type { PayrollKPIs } from '@/types/payroll';

interface PayrollOverviewCardsProps {
  kpis: PayrollKPIs;
}

export const PayrollOverviewCards: React.FC<PayrollOverviewCardsProps> = ({ kpis }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
      {/* 1. Total Payroll */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg md:text-xl font-bold text-slate-100">
                {kpis.totalPayroll.toLocaleString('ar-EG')} <span className="text-xs font-normal text-muted-foreground">ج.م</span>
              </p>
              <p className="text-[11px] text-muted-foreground">إجمالي الرواتب المستحقة</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Paid */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg md:text-xl font-bold text-emerald-400">
                {kpis.totalPaid.toLocaleString('ar-EG')} <span className="text-xs font-normal text-muted-foreground">ج.م</span>
              </p>
              <p className="text-[11px] text-muted-foreground">المدفوع</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Remaining */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg md:text-xl font-bold text-rose-400">
                {kpis.totalRemaining.toLocaleString('ar-EG')} <span className="text-xs font-normal text-muted-foreground">ج.م</span>
              </p>
              <p className="text-[11px] text-muted-foreground">المتبقي</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. Active Advances */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardContent className="p-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
              <HandCoins className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg md:text-xl font-bold text-amber-400">
                {kpis.activeAdvancesTotal.toLocaleString('ar-EG')} <span className="text-xs font-normal text-muted-foreground">ج.م</span>
              </p>
              <p className="text-[11px] text-muted-foreground">السلف القائمة</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. Employees */}
      <Card className="bg-slate-900/50 border-slate-800 col-span-2 md:col-span-1">
        <CardContent className="p-3.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-lg md:text-xl font-bold text-slate-100">
                {kpis.employeesCount} <span className="text-xs font-normal text-muted-foreground">موظف</span>
              </p>
              <p className="text-[11px] text-muted-foreground">إجمالي الموظفين</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
