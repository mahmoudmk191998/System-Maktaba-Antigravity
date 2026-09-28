import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCircle2,
  Download,
  MonitorDown,
  MoreVertical,
  Share,
  Smartphone,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';

export function PWAInstallPrompt() {
  const {
    isStandalone,
    canNativeInstall,
    platform,
    installOrShowHelp,
  } = usePWAInstall();

  const [showPrompt, setShowPrompt] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const openHelp = () => setShowPrompt(true);
    window.addEventListener('pwa:show-install-help', openHelp);

    return () => {
      window.removeEventListener('pwa:show-install-help', openHelp);
    };
  }, []);

  useEffect(() => {
    if (isStandalone || !canNativeInstall) return;

    let dismissed = false;
    try {
      dismissed = localStorage.getItem('pwa-prompt-dismissed') === 'true';
    } catch {
      // Ignore unavailable localStorage.
    }

    if (dismissed) return;

    const timer = window.setTimeout(() => setShowPrompt(true), 2200);
    return () => window.clearTimeout(timer);
  }, [isStandalone, canNativeInstall]);

  const handleInstall = async () => {
    if (installing) return;

    setInstalling(true);
    try {
      const result = await installOrShowHelp();

      if (result === 'accepted' || result === 'installed') {
        setShowPrompt(false);
      } else if (result === 'dismissed') {
        setShowPrompt(false);
      }
    } finally {
      setInstalling(false);
    }
  };

  const handleFloatingInstall = async () => {
    if (canNativeInstall) {
      await handleInstall();
      return;
    }
    setShowPrompt(true);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    try {
      localStorage.setItem('pwa-prompt-dismissed', 'true');
    } catch {
      // Non-critical preference.
    }
  };

  if (isStandalone) return null;

  const isIOS = platform === 'ios';
  const isAndroid = platform === 'android';

  return (
    <>
      {/* Persistent install affordance.
          This remains available even when beforeinstallprompt is not currently
          exposed by the browser, so the user always has a visible installation path. */}
      {!showPrompt && (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 10, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          onClick={handleFloatingInstall}
          className="fixed left-3 sm:left-5 bottom-[calc(env(safe-area-inset-bottom,0px)+5.25rem)] md:bottom-5 z-[90] inline-flex items-center gap-2 rounded-full bg-primary px-3.5 py-2.5 text-xs sm:text-sm font-black text-primary-foreground shadow-xl shadow-primary/20 border border-primary-foreground/10 hover:brightness-105 active:scale-95 transition"
          aria-label="تثبيت نظام إدارة المكتبة"
          title="تثبيت النظام على هذا الجهاز"
        >
          <Download className="w-4 h-4" />
          <span>تثبيت النظام</span>
          {canNativeInstall && (
            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" aria-hidden="true" />
          )}
        </motion.button>
      )}

      <AnimatePresence>
        {showPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
            dir="rtl"
          >
            <motion.div
              initial={{ scale: 0.94, y: 18, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.94, y: 18, opacity: 0 }}
              className="relative bg-card rounded-[26px] shadow-2xl max-w-sm w-full p-6 text-center border border-border"
            >
              <button
                type="button"
                onClick={handleDismiss}
                className="absolute top-3 left-3 w-9 h-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center transition"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-24 h-24 rounded-[24px] overflow-hidden mx-auto mb-4 shadow-xl ring-1 ring-border bg-[#07111f]">
                <img
                  src="/icons/mk-library-192-v2.png"
                  alt="MK Library"
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              </div>

              <h2 className="text-xl font-black mb-2">تثبيت نظام إدارة المكتبة</h2>
              <p className="text-muted-foreground text-sm mb-5 leading-6">
                ثبّت النظام على الجهاز ليعمل كتطبيق مستقل مع أيقونته الخاصة ووصول أسرع.
              </p>

              {canNativeInstall ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 justify-center text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                    <CheckCircle2 className="w-4 h-4" />
                    الجهاز والمتصفح جاهزان للتثبيت المباشر
                  </div>

                  <Button
                    className="w-full h-12 text-base gap-2 font-black"
                    onClick={handleInstall}
                    disabled={installing}
                  >
                    <Download className="w-5 h-5" />
                    {installing ? 'جاري فتح نافذة التثبيت...' : 'تثبيت الآن'}
                  </Button>
                </div>
              ) : isIOS ? (
                <div className="space-y-3">
                  <div className="bg-muted/70 border border-border rounded-xl p-4 text-sm space-y-3 text-right">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Share className="w-4 h-4" />
                      </div>
                      <span>افتح قائمة <strong>المشاركة</strong> في Safari.</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <span>اختر <strong>إضافة إلى الشاشة الرئيسية</strong>.</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-muted/70 border border-border rounded-xl p-4 text-sm space-y-3 text-right">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        {isAndroid ? <Smartphone className="w-4 h-4" /> : <MonitorDown className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="font-bold">
                          {isAndroid ? 'على Android' : 'على الكمبيوتر'}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          استخدم Chrome أو Edge على رابط HTTPS الخاص بالنظام.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <MoreVertical className="w-4 h-4" />
                      </div>
                      <span>
                        من قائمة المتصفح اختر <strong>تثبيت التطبيق / Install app</strong>
                        {isAndroid ? ' أو إضافة إلى الشاشة الرئيسية.' : '.'}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-5">
                    إذا كان Chrome قد رفض أو أخفى نافذة التثبيت مؤقتًا، اترك الصفحة مفتوحة لثوانٍ ثم اضغط زر «تثبيت النظام» مرة أخرى.
                  </p>
                </div>
              )}

              <Button
                variant="ghost"
                className="w-full mt-3"
                onClick={handleDismiss}
              >
                إغلاق
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default PWAInstallPrompt;
