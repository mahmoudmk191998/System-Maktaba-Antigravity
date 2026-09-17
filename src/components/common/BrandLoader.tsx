import mkLogo from '@/assets/mk-logo.png';

interface BrandLoaderProps {
  message?: string;
}

export function BrandLoader({ message = 'جاري مزامنة النظام والعمليات...' }: BrandLoaderProps) {
  return (
    <div 
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background/95 backdrop-blur-xl select-none"
      dir="rtl"
    >
      <div className="relative flex items-center justify-center">
        {/* Ambient background glow */}
        <div className="absolute w-44 h-44 rounded-full bg-primary/15 blur-3xl animate-pulse pointer-events-none" />

        {/* Outer Orbital Ring 1 - Management Pulse */}
        <div className="absolute w-36 h-36 rounded-full border border-primary/20 border-dashed animate-[spin_12s_linear_infinite]" />

        {/* Middle Orbital Ring 2 - Kitchen Rhythm */}
        <div className="absolute w-28 h-28 rounded-full border-2 border-transparent border-t-accent/60 border-r-primary/40 animate-[spin_6s_linear_infinite_reverse]" />

        {/* Inner Operational Pulse Ring 3 */}
        <div className="absolute w-20 h-20 rounded-full border border-primary/40 animate-ping opacity-25" />

        {/* Core Brand Mark Card */}
        <div className="relative w-16 h-16 rounded-2xl bg-card border-2 border-primary/30 shadow-[0_0_30px_rgba(var(--primary),0.3)] flex items-center justify-center overflow-hidden p-2 z-10 transition-transform">
          <img 
            src={mkLogo} 
            alt="MK" 
            className="w-full h-full object-contain drop-shadow-md animate-pulse" 
          />
        </div>
      </div>

      {/* Brand Identity & Status */}
      <div className="mt-8 flex flex-col items-center text-center px-4 max-w-xs">
        <h2 className="text-xl font-black tracking-tight text-foreground bg-gradient-to-l from-primary via-foreground to-primary/80 bg-clip-text text-transparent">
          إم كـي سيستم
        </h2>
        <p className="text-xs text-muted-foreground font-medium mt-1">
          نظام إدارة المطاعم المتكامل
        </p>

        {/* Operational Pulse Line */}
        <div className="w-40 h-1 bg-muted/50 rounded-full overflow-hidden mt-4 relative">
          <div className="absolute top-0 bottom-0 w-16 bg-gradient-to-r from-transparent via-primary to-transparent rounded-full animate-[pulseLine_1.4s_ease-in-out_infinite]" />
        </div>

        <span className="text-[11px] text-muted-foreground/80 mt-2 font-medium">
          {message}
        </span>
      </div>

      <style>{`
        @keyframes pulseLine {
          0% { right: -40%; }
          50% { right: 40%; }
          100% { right: 110%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-spin, .animate-ping, .animate-pulse {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

export default BrandLoader;
