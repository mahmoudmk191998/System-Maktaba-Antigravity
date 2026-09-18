import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ReconciliationCardProps {
  title: string;
  glAccountCode: string;
  glBalance: number;
  subledgerTitle: string;
  subledgerTotal: number;
  variance: number;
  isMatched: boolean;
  itemCountLabel?: string;
  itemCount?: number;
  onRefresh?: () => void;
  loading?: boolean;
}

export function ReconciliationCard({
  title,
  glAccountCode,
  glBalance,
  subledgerTitle,
  subledgerTotal,
  variance,
  isMatched,
  itemCountLabel,
  itemCount,
  onRefresh,
  loading,
}: ReconciliationCardProps) {
  return (
    <Card className="shadow-sm border">
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <span>{title}</span>
            <span className="font-mono text-xs text-muted-foreground">({glAccountCode})</span>
          </CardTitle>
          {itemCountLabel && itemCount !== undefined && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {itemCountLabel}: <span className="font-semibold text-foreground">{itemCount}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant={isMatched ? 'outline' : 'destructive'}
            className={
              isMatched
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                : ''
            }
          >
            {isMatched ? (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                متطابق (Matched)
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                غير متطابق
              </span>
            )}
          </Badge>
          {onRefresh && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-2">
        <div className="grid grid-cols-3 gap-2 p-3 bg-muted/30 rounded-lg text-center">
          <div>
            <div className="text-xs text-muted-foreground">الأستاذ العام (GL)</div>
            <div className="text-sm font-bold font-mono text-foreground mt-0.5">
              {glBalance.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">{subledgerTitle}</div>
            <div className="text-sm font-bold font-mono text-foreground mt-0.5">
              {subledgerTotal.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">الفارق (Variance)</div>
            <div
              className={`text-sm font-bold font-mono mt-0.5 ${
                isMatched
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-destructive'
              }`}
            >
              {Math.abs(variance).toFixed(2)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
