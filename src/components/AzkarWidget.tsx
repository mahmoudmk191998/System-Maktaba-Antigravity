import { useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { getRandomZikr } from '@/data/azkar';
import { toast } from 'sonner';
import { Moon, X } from 'lucide-react';

export function AzkarWidget() {
  const { settings } = useAppStore();
  const { azkarEnabled, azkarInterval } = settings;
  const intervalRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (!azkarEnabled || !azkarInterval) {
      return;
    }

    // Convert minutes to milliseconds
    const intervalMs = azkarInterval * 60 * 1000;

    const showZikr = () => {
      const zikr = getRandomZikr();
      toast.custom((t) => (
        <div dir="rtl" className="relative overflow-hidden flex flex-col gap-3 p-5 w-[350px] rounded-2xl bg-gradient-to-br from-[#064e3b] to-[#022c22] text-white shadow-2xl border border-emerald-500/30 font-arabic group animate-in slide-in-from-bottom-5">
          {/* Background decorative icon */}
          <div className="absolute -top-4 -left-4 opacity-5 transform -rotate-12 transition-transform duration-1000 group-hover:rotate-0">
            <Moon size={120} className="text-white" />
          </div>
          
          <div className="flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <span className="bg-emerald-500/20 text-emerald-200 text-xs px-3 py-1 rounded-full border border-emerald-500/30 shadow-sm backdrop-blur-md">
                {zikr.category === 'morning' ? 'أذكار الصباح' : zikr.category === 'evening' ? 'أذكار المساء' : 'ذكر وتسبیح'}
              </span>
            </div>
            <button 
              onClick={() => toast.dismiss(t)}
              className="text-emerald-200/50 hover:text-white transition-colors rounded-full p-1.5 hover:bg-white/10"
            >
              <X size={16} />
            </button>
          </div>
          
          <div className="z-10 text-xl leading-relaxed text-right font-semibold text-emerald-50 mt-2 py-2 drop-shadow-md">
            {zikr.text}
          </div>
          
          {zikr.count && zikr.count > 1 && (
            <div className="z-10 flex justify-end mt-1">
              <span className="text-xs text-emerald-200/80 bg-black/20 px-3 py-1 rounded-full backdrop-blur-sm border border-emerald-800/50">
                تُقال {zikr.count} مرات
              </span>
            </div>
          )}
        </div>
      ), {
        duration: 12000,
        position: 'bottom-left',
      });
    };

    // Show initial one if just enabled (optional, let's keep it quiet until interval passes, or show soon)
    // To be non-intrusive, we just set the interval instead of showing immediately

    intervalRef.current = setInterval(showZikr, intervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [azkarEnabled, azkarInterval]);

  return null; // This component handles side effects only
}
