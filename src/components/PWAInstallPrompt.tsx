import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    setIsStandalone(standalone);

    // Check iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(ios);

    // Listen for install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show after a short delay
      setTimeout(() => setShowPrompt(true), 2000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // For iOS, show prompt after delay if not standalone
    if (ios && !standalone) {
      const dismissed = localStorage.getItem('pwa-prompt-dismissed');
      if (!dismissed) {
        setTimeout(() => setShowPrompt(true), 3000);
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const result = await deferredPrompt.userChoice;
      if (result.outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-prompt-dismissed', 'true');
  };

  if (isStandalone || !showPrompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center border border-border"
        >
          <button
            onClick={handleDismiss}
            className="absolute top-3 left-3 text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-20 h-20 rounded-2xl bg-primary flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-3xl font-bold text-primary-foreground">MK</span>
          </div>

          <h2 className="text-xl font-bold mb-2">تثبيت MK</h2>
          <p className="text-muted-foreground text-sm mb-6">
            قم بتثبيت التطبيق على جهازك للوصول السريع والعمل بدون إنترنت
          </p>

          {isIOS ? (
            <div className="space-y-3">
              <div className="bg-muted rounded-xl p-4 text-sm space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                    <Share className="w-4 h-4" />
                  </div>
                  <span>اضغط على زر المشاركة <strong>(Share)</strong></span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                    <Download className="w-4 h-4" />
                  </div>
                  <span>اختر <strong>"إضافة إلى الشاشة الرئيسية"</strong></span>
                </div>
              </div>
              <Button variant="outline" className="w-full" onClick={handleDismiss}>
                فهمت
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <Button className="w-full h-12 text-base gap-2" onClick={handleInstall}>
                <Download className="w-5 h-5" />
                تثبيت التطبيق
              </Button>
              <Button variant="ghost" className="w-full" onClick={handleDismiss}>
                ليس الآن
              </Button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
