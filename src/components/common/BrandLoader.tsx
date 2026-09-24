import { BookOpen, LibraryBig, Sparkles } from 'lucide-react';

interface BrandLoaderProps {
  message?: string;
}

export function BrandLoader({ message = 'جاري تجهيز نظام المكتبة...' }: BrandLoaderProps) {
  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-background text-foreground select-none"
      dir="rtl"
      role="status"
      aria-live="polite"
      aria-label={message}
    >
      {/* Soft ambient background that follows the active theme */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/[0.07] blur-[90px]" />
        <div className="absolute right-[12%] top-[18%] h-40 w-40 rounded-full bg-amber-500/[0.06] blur-3xl" />
        <div className="absolute bottom-[14%] left-[14%] h-44 w-44 rounded-full bg-emerald-500/[0.05] blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center">
        {/* Library loading emblem */}
        <div className="relative h-44 w-44 sm:h-48 sm:w-48 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border border-dashed border-primary/25 animate-[libraryOrbit_14s_linear_infinite]" />
          <div className="absolute inset-[14px] rounded-full border border-border/70" />

          <div className="absolute inset-[20px] rounded-full overflow-hidden">
            <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-primary border-l-primary/30 animate-[spin_2.8s_linear_infinite]" />
            <div className="absolute inset-[9px] rounded-full border-2 border-transparent border-b-amber-500/70 border-r-primary/50 animate-[spin_4.6s_linear_infinite_reverse]" />
          </div>

          {/* Small orbiting catalog marker */}
          <div className="absolute inset-[5px] animate-[libraryOrbit_7s_linear_infinite]">
            <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-card border border-border shadow-lg flex items-center justify-center">
              <LibraryBig className="w-4 h-4 text-primary" />
            </div>
          </div>

          {/* Brand core — intentionally image-free so no legacy restaurant mark can appear */}
          <div className="relative z-10 w-[82px] h-[82px] rounded-[26px] bg-card/95 border border-primary/30 shadow-[0_18px_50px_rgba(0,0,0,0.18)] backdrop-blur-xl flex flex-col items-center justify-center">
            <BookOpen className="w-8 h-8 text-primary" strokeWidth={1.8} />
            <span className="mt-1 text-[13px] leading-none font-black tracking-[0.18em] text-foreground">
              MK
            </span>
            <div className="absolute -right-1 -top-1 w-5 h-5 rounded-full bg-primary text-primary-foreground border-2 border-background flex items-center justify-center shadow-md">
              <Sparkles className="w-2.5 h-2.5" />
            </div>
          </div>
        </div>

        <div className="mt-7 flex flex-col items-center text-center px-5">
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">
            نظام إدارة المكتبة
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm font-semibold text-muted-foreground">
            المبيعات • المخزون • الحسابات • التقارير
          </p>

          {/* Smooth loading rail */}
          <div className="relative mt-6 h-1.5 w-56 sm:w-64 overflow-hidden rounded-full bg-muted/70 border border-border/30">
            <div className="absolute inset-y-0 w-24 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent animate-[librarySweep_1.55s_ease-in-out_infinite]" />
          </div>

          <div className="mt-3 flex items-center gap-2 text-[11px] sm:text-xs font-medium text-muted-foreground/90">
            <span className="inline-flex gap-1" aria-hidden="true">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-[pageDot_1.2s_ease-in-out_infinite]" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-[pageDot_1.2s_ease-in-out_150ms_infinite]" />
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-[pageDot_1.2s_ease-in-out_300ms_infinite]" />
            </span>
            <span>{message}</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes libraryOrbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes librarySweep {
          0% { right: -45%; opacity: 0.25; }
          45% { opacity: 1; }
          100% { right: 105%; opacity: 0.25; }
        }
        @keyframes pageDot {
          0%, 100% { transform: translateY(0); opacity: 0.35; }
          50% { transform: translateY(-3px); opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [class*="animate-"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

export default BrandLoader;
