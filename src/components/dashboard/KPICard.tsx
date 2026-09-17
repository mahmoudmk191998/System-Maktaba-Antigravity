import { motion } from 'framer-motion';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon: LucideIcon;
  iconColor?: 'primary' | 'success' | 'warning' | 'info' | 'destructive';
  loading?: boolean;
}

const iconColors = {
  primary: 'from-blue-500/20 to-blue-600/10 text-blue-600 dark:from-blue-500/30 dark:to-blue-600/20 dark:text-blue-400',
  success: 'from-emerald-500/20 to-emerald-600/10 text-emerald-600 dark:from-emerald-500/30 dark:to-emerald-600/20 dark:text-emerald-400',
  warning: 'from-amber-500/20 to-amber-600/10 text-amber-600 dark:from-amber-500/30 dark:to-amber-600/20 dark:text-amber-400',
  info: 'from-purple-500/20 to-purple-600/10 text-purple-600 dark:from-purple-500/30 dark:to-purple-600/20 dark:text-purple-400',
  destructive: 'from-rose-500/20 to-rose-600/10 text-rose-600 dark:from-rose-500/30 dark:to-rose-600/20 dark:text-rose-400',
};

const cardGradients = {
  primary: 'hover:border-blue-500/30 dark:hover:border-blue-500/50',
  success: 'hover:border-emerald-500/30 dark:hover:border-emerald-500/50',
  warning: 'hover:border-amber-500/30 dark:hover:border-amber-500/50',
  info: 'hover:border-purple-500/30 dark:hover:border-purple-500/50',
  destructive: 'hover:border-rose-500/30 dark:hover:border-rose-500/50',
};

export function KPICard({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  iconColor = 'primary',
  loading,
}: KPICardProps) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;
  const isNeutral = change !== undefined && change === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "kpi-card",
        cardGradients[iconColor]
      )}
    >
      <div className="flex flex-col h-full z-10 relative">
        <div className="flex items-start justify-between mb-2">
          <div className={cn('p-2.5 rounded-xl bg-gradient-to-br', iconColors[iconColor])}>
            <Icon className="w-4 h-4" />
          </div>
          {change !== undefined && (
            <div className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold backdrop-blur-md",
              isPositive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : 
              isNegative ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : 
              "bg-slate-500/10 text-slate-600 dark:text-slate-400"
            )}>
              {isPositive ? <TrendingUp className="w-3 h-3" /> : isNegative ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              <span>{Math.abs(change).toFixed(1)}%</span>
            </div>
          )}
        </div>
        
        <div className="flex-1 mt-auto">
          <h3 className="text-sm font-medium text-muted-foreground mb-1">{title}</h3>
          {loading ? (
            <div className="h-9 w-24 bg-muted animate-pulse rounded-lg mt-1" />
          ) : (
            <div className="flex items-baseline gap-2">
              <p className="text-2xl md:text-3xl font-black tracking-tight text-foreground">{value}</p>
            </div>
          )}
          {changeLabel && (
            <p className="text-xs text-muted-foreground mt-2 opacity-80">{changeLabel}</p>
          )}
        </div>
      </div>
      
      {/* Background decoration */}
      <div className={cn(
        "absolute -right-8 -top-8 w-32 h-32 rounded-full blur-3xl opacity-[0.05] pointer-events-none transition-opacity duration-300 group-hover:opacity-10",
        iconColors[iconColor].split(' ')[0]
      )} />
    </motion.div>
  );
}
