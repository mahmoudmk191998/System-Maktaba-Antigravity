import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

/**
 * Native-only PWA install action.
 *
 * This component intentionally does NOT show any custom install dialog.
 * If the browser exposes beforeinstallprompt, clicking the button calls
 * event.prompt() immediately. If the native prompt is unavailable, the
 * button is not rendered.
 */
export function PWAInstallPrompt() {
  const { isStandalone, canNativeInstall, installNative } = usePWAInstall();

  if (isStandalone || !canNativeInstall) return null;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      onClick={() => void installNative()}
      className="fixed left-3 sm:left-5 bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] md:hidden z-[90] inline-flex items-center gap-2 rounded-full bg-primary px-3.5 py-2.5 text-xs font-black text-primary-foreground shadow-xl shadow-primary/20 border border-primary-foreground/10 hover:brightness-105 active:scale-95 transition"
      aria-label="تثبيت نظام إدارة المكتبة"
      title="فتح نافذة التثبيت الأصلية"
    >
      <Download className="w-4 h-4" />
      <span>تثبيت النظام</span>
      <span
        className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse"
        aria-hidden="true"
      />
    </motion.button>
  );
}

export default PWAInstallPrompt;
