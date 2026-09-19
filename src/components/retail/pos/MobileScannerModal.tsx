import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Camera,
  CameraOff,
  SwitchCamera,
  Zap,
  ZapOff,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Volume2,
  VolumeX,
  X,
  Keyboard,
  UploadCloud,
  Check,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';
import type { IScannerControls } from '@zxing/browser/esm/common/IScannerControls';
import { toast } from 'sonner';
import type { Product, ProductVariant } from '@/types/retail.types';

interface MobileScannerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (
    barcode: string
  ) => Promise<{ success: boolean; error?: string; product?: Product; variant?: ProductVariant }>;
  cartTotalCount?: number;
  availableProducts?: Product[];
  title?: string;
  subtitle?: string;
  mode?: 'pos' | 'input' | 'lookup';
}

export function MobileScannerModal({
  open,
  onOpenChange,
  onScan,
  cartTotalCount = 0,
  availableProducts = [],
  title,
  subtitle,
  mode = 'pos',
}: MobileScannerModalProps) {
  // UI State
  const [isScanning, setIsScanning] = useState(false);
  const [isLoadingCamera, setIsLoadingCamera] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [isTorchSupported, setIsTorchSupported] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Manual input and testing states
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [scannedSessionCount, setScannedSessionCount] = useState(0);

  // Last scanned product display
  const [lastScannedResult, setLastScannedResult] = useState<{
    code: string;
    success: boolean;
    name: string;
    price?: number;
    error?: string;
  } | null>(null);

  // References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const barcodeDetectorTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const isProcessingRef = useRef(false);
  const isTorchOnRef = useRef(false);
  isTorchOnRef.current = isTorchOn;

  const soundEnabledRef = useRef(true);
  soundEnabledRef.current = soundEnabled;

  const isStartingRef = useRef<boolean>(false);
  const lastScanTimestampRef = useRef<Record<string, number>>({});

  // Lazy-initialize ZXing reader with optimal barcode formats
  const getReader = useCallback(() => {
    if (!readerRef.current) {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.QR_CODE,
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
        BarcodeFormat.DATA_MATRIX,
        BarcodeFormat.ITF,
        BarcodeFormat.CODABAR,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      readerRef.current = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 80,
        delayBetweenScanSuccess: 1500,
      });
    }
    return readerRef.current;
  }, []);

  // Sound feedback
  const playBeep = useCallback(() => {
    if (!soundEnabledRef.current) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.05);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {
      // AudioContext policy blocked
    }
  }, []);

  // Haptic feedback
  const triggerHaptic = useCallback(() => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate([60, 40, 60]);
      }
    } catch {
      // Ignored
    }
  }, []);

  // Complete cleanup function
  const stopScanner = useCallback(() => {
    // 1. Clear BarcodeDetector timer
    if (barcodeDetectorTimerRef.current) {
      clearInterval(barcodeDetectorTimerRef.current);
      barcodeDetectorTimerRef.current = null;
    }

    // 2. Stop ZXing controls
    if (scannerControlsRef.current) {
      try {
        scannerControlsRef.current.stop();
      } catch (err) {
        console.warn('ZXing stop error:', err);
      }
      scannerControlsRef.current = null;
    }

    // 3. Stop MediaStream tracks
    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
      } catch (err) {
        console.warn('Track stop error:', err);
      }
      mediaStreamRef.current = null;
    }

    // 4. Detach video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsScanning(false);
    setIsLoadingCamera(false);
    setIsTorchOn(false);
    setIsTorchSupported(false);
  }, []);

  // Handle detected code (debounced and guarded)
  const handleCodeScanned = useCallback(
    async (rawCode: string) => {
      if (!rawCode || isProcessingRef.current) return;
      const code = rawCode.trim();
      if (!code) return;

      // Prevent duplicate scan within 1.5 seconds
      const now = Date.now();
      const lastTime = lastScanTimestampRef.current[code] || 0;
      if (now - lastTime < 1500) {
        return;
      }
      lastScanTimestampRef.current[code] = now;

      isProcessingRef.current = true;
      setIsProcessing(true);

      try {
        const res = await onScanRef.current(code);

        if (res.success) {
          playBeep();
          triggerHaptic();
          setScannedSessionCount((prev) => prev + 1);

          const prodName = res.product?.name || 'صنف مسجل';
          const price = res.product?.pricing?.retailPrice;

          setLastScannedResult({
            code,
            success: true,
            name: prodName,
            price,
          });

          if (mode === 'pos') {
            toast.success(`تمت إضافة: ${prodName} إلى السلة بنجاح`);
          } else {
            toast.success(`تم قراءة الباركود: ${code}`);
          }
        } else {
          setLastScannedResult({
            code,
            success: false,
            name: code,
            error: res.error || 'لم يتم العثور على صنف مطابق في النظام',
          });
          if (mode === 'pos') {
            toast.error(res.error || `لم يتم العثور على صنف بالرمز: ${code}`);
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'خطأ أثناء فحص الكود';
        setLastScannedResult({
          code,
          success: false,
          name: code,
          error: errMsg,
        });
        toast.error('حدث خطأ أثناء معالجة الكود');
      } finally {
        setTimeout(() => {
          isProcessingRef.current = false;
          setIsProcessing(false);
        }, 500);
      }
    },
    [playBeep, triggerHaptic]
  );

  // Progressive camera constraints resolver (100% device compatibility)
  const acquireMediaStream = async (deviceId?: string): Promise<MediaStream> => {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      throw new Error('NOT_SUPPORTED');
    }

    // Attempt 0: Explicit deviceId requested
    if (deviceId) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
          audio: false,
        });
      } catch (e) {
        console.warn('Specific deviceId stream failed, trying fallbacks:', e);
      }
    }

    // Attempt 1: Preferred rear camera with ideal mobile HD constraints
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (e1) {
      console.warn('Ideal HD rear camera constraints failed, trying basic:', e1);
    }

    // Attempt 2: Basic environment camera without dimensions
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
    } catch (e2) {
      console.warn('Basic environment constraint failed, trying bare video:', e2);
    }

    // Attempt 3: Any video device available
    return await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
  };

  // Main Camera Engine (ZXing + Hardware BarcodeDetector)
  const startCamera = useCallback(
    async (preferredDeviceId?: string) => {
      if (isStartingRef.current) return;
      isStartingRef.current = true;
      setCameraError(null);
      setIsLoadingCamera(true);

      try {
        stopScanner();

        // 1. Acquire media stream
        const stream = await acquireMediaStream(preferredDeviceId);
        mediaStreamRef.current = stream;

        // 2. Attach to React video element
        const video = videoRef.current;
        if (!video) {
          throw new Error('Video element reference is not mounted');
        }

        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.playsInline = true;
        video.muted = true;
        video.autoplay = true;
        video.srcObject = stream;

        try {
          await video.play();
        } catch (playErr) {
          console.warn('video.play() warning:', playErr);
        }

        // 3. Inspect torch capability
        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = (track.getCapabilities?.() || {}) as { torch?: boolean };
          if (capabilities.torch) {
            setIsTorchSupported(true);
          }
        }

        // 4. Enumerate camera devices for lens switching
        try {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = allDevices.filter((d) => d.kind === 'videoinput');
          if (videoDevices.length > 0) {
            setCameras(
              videoDevices.map((d, idx) => ({
                id: d.deviceId,
                label: d.label || `كاميرا ${idx + 1}`,
              }))
            );
            if (!preferredDeviceId && track) {
              const settings = track.getSettings();
              if (settings.deviceId) {
                setSelectedCameraId(settings.deviceId);
              }
            }
          }
        } catch {
          // Device listing notice
        }

        // 5. Start ZXing decoding loop directly from stream
        const reader = getReader();
        const controls = await reader.decodeFromStream(
          stream,
          video,
          (result, error) => {
            if (result && result.getText()) {
              handleCodeScanned(result.getText());
            }
          }
        );
        scannerControlsRef.current = controls;

        setIsScanning(true);
        setIsLoadingCamera(false);

        // 6. Secondary Hardware Acceleration: BarcodeDetector API (for fast Chrome Android detection)
        const AnyWindow = window as unknown as {
          BarcodeDetector?: {
            new (opts?: { formats: string[] }): {
              detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
            };
          };
        };

        if (AnyWindow.BarcodeDetector) {
          try {
            const hardwareDetector = new AnyWindow.BarcodeDetector({
              formats: [
                'qr_code',
                'ean_13',
                'ean_8',
                'code_128',
                'code_39',
                'upc_a',
                'upc_e',
                'data_matrix',
                'itf',
              ],
            });

            barcodeDetectorTimerRef.current = setInterval(async () => {
              if (!video || video.readyState < 2 || isProcessingRef.current) return;
              try {
                const detected = await hardwareDetector.detect(video);
                if (detected && detected.length > 0 && detected[0].rawValue) {
                  handleCodeScanned(detected[0].rawValue);
                }
              } catch {
                // Frame decode notice
              }
            }, 80);
          } catch (e) {
            console.debug('BarcodeDetector init notice:', e);
          }
        }
      } catch (err: unknown) {
        console.error('Camera startup error:', err);
        setIsScanning(false);
        setIsLoadingCamera(false);

        const errMsg = err instanceof Error ? err.message : String(err);
        const errName = err instanceof Error ? err.name : '';

        if (
          errName === 'NotAllowedError' ||
          errName === 'PermissionDeniedError' ||
          errMsg.includes('NotAllowedError') ||
          errMsg.includes('Permission')
        ) {
          setCameraError(
            'تم رفض إذن الوصول للكاميرا. يرجى الضغط على علامة القفل 🔒 أو أيقونة الإعدادات بجانب عنوان الموقع في المتصفح، واختيار "السماح للكاميرا" (Camera: Allow)، ثم الضغط على زر إعادة المحاولة.'
          );
        } else if (
          errName === 'NotFoundError' ||
          errName === 'DevicesNotFoundError' ||
          errMsg.includes('NotFound')
        ) {
          setCameraError('لم يتم العثور على أي كاميرا متصلة بهذا الجهاز.');
        } else if (
          errName === 'NotReadableError' ||
          errName === 'TrackStartError' ||
          errMsg.includes('NotReadable') ||
          errMsg.includes('in use')
        ) {
          setCameraError(
            'الكاميرا قيد الاستخدام حالياً بواسطة تطبيق آخر على هاتفك. يرجى إغلاق التطبيقات الأخرى وإعادة المحاولة.'
          );
        } else if (errMsg === 'NOT_SUPPORTED') {
          setCameraError(
            'المتصفح لا يدعم الوصول المباشر للكاميرا في هذا الإطار. يرجى فتح التطبيق في نافذة مستقلة (New Tab).'
          );
        } else {
          setCameraError(
            'تعذر فتح الكاميرا تلقائياً. تأكد من إعطاء الصلاحية أو استخدم التقاط صورة بالهاتف أو الإدخال اليدوي.'
          );
        }
      } finally {
        isStartingRef.current = false;
      }
    },
    [getReader, handleCodeScanned, stopScanner]
  );

  // Toggle Torch / Flashlight
  const toggleTorch = async () => {
    const stream = mediaStreamRef.current;
    const track = stream?.getVideoTracks()[0];
    if (!track) return;

    const nextState = !isTorchOnRef.current;
    try {
      await (track as unknown as {
        applyConstraints: (c: unknown) => Promise<void>;
      }).applyConstraints({
        advanced: [{ torch: nextState }],
      });
      setIsTorchOn(nextState);
    } catch (err) {
      console.warn('Torch toggle error:', err);
      toast.error('تعذر تشغيل كشاف الفلاش في هذا الجهاز');
    }
  };

  // Switch Camera Lens
  const switchCamera = async () => {
    if (cameras.length <= 1) {
      toast.info('توجد كاميرا واحدة فقط متاحة على هذا الجهاز');
      return;
    }
    const currIdx = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIdx = (currIdx + 1) % cameras.length;
    const nextCam = cameras[nextIdx];
    setSelectedCameraId(nextCam.id);
    await startCamera(nextCam.id);
    toast.info(`تم التبديل إلى: ${nextCam.label}`);
  };

  // Photo Capture Fallback (Instant Snapshot Decode via ZXing)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    toast.loading('جاري فحص صورة الباركود...', { id: 'file_scan' });
    const objectUrl = URL.createObjectURL(file);
    try {
      const reader = getReader();
      const result = await reader.decodeFromImageUrl(objectUrl);
      if (result && result.getText()) {
        toast.dismiss('file_scan');
        handleCodeScanned(result.getText());
      } else {
        toast.error('لم يتم التعرف على باركود أو رمز QR في الصورة', { id: 'file_scan' });
      }
    } catch {
      toast.error('تعذر قراءة الرمز من الصورة، يرجى المحاولة بصورة أوضح وأقرب', {
        id: 'file_scan',
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
      if (e.target) e.target.value = '';
    }
  };

  // Manual code submit
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    const code = manualCode.trim();
    setManualCode('');
    setShowManualInput(false);
    handleCodeScanned(code);
  };

  // STABLE LIFECYCLE: Controlled strictly by `open`
  useEffect(() => {
    if (open) {
      setLastScannedResult(null);
      setCameraError(null);
      setScannedSessionCount(0);
      setShowManualInput(false);
      lastScanTimestampRef.current = {};

      const timer = setTimeout(() => {
        startCamera();
      }, 150);

      return () => {
        clearTimeout(timer);
        stopScanner();
      };
    } else {
      stopScanner();
    }
  }, [open, startCamera, stopScanner]);

  if (!open) return null;

  const sampleProducts = availableProducts.filter((p) => p.barcode || p.sku).slice(0, 4);

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] bg-black text-white flex flex-col w-full h-[100dvh] overflow-hidden select-none font-sans"
      dir="rtl"
    >
      {/* Hidden File Input for Native Camera Snapshot Fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoUpload}
      />

      {/* TOP FLOATING CONTROLS BAR */}
      <div className="absolute top-0 inset-x-0 z-40 pt-safe px-3.5 py-3 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex items-center justify-between pointer-events-auto">
        {/* Right side: Exit Button */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="h-10 w-10 rounded-full bg-black/60 hover:bg-black/80 active:scale-95 border border-white/20 text-white flex items-center justify-center backdrop-blur-md transition-transform shadow-lg"
          aria-label="إغلاق الكاميرا"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Center: Title & Cart Status */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-black/60 border border-white/15 backdrop-blur-md text-xs font-bold text-white shadow-md">
            <span
              className={`w-2 h-2 rounded-full ${
                isScanning ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>{title || (isScanning ? 'كاميرا الباركود نشطة' : 'جاري تشغيل الكاميرا...')}</span>
          </div>
          {mode === 'pos' ? (
            <span className="text-[10px] text-slate-300 mt-0.5">
              بالسلة: <strong className="text-emerald-400">{cartTotalCount}</strong> أصناف
            </span>
          ) : (
            <span className="text-[10px] text-emerald-300 mt-0.5 font-medium">
              {subtitle || 'وجه الكاميرا نحو الباركود لقراءته فوراً'}
            </span>
          )}
        </div>

        {/* Left side: Tools (Torch, Switch lens, Sound) */}
        <div className="flex items-center gap-1.5">
          {/* Torch Toggle */}
          {isTorchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              className={`h-9 w-9 rounded-full border backdrop-blur-md flex items-center justify-center transition-transform active:scale-95 shadow-md ${
                isTorchOn
                  ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                  : 'bg-black/60 text-white border-white/20 hover:bg-black/80'
              }`}
              title="ضوء الفلاش"
            >
              {isTorchOn ? <Zap className="w-4 h-4 fill-current" /> : <ZapOff className="w-4 h-4" />}
            </button>
          )}

          {/* Switch Camera */}
          {cameras.length > 1 && (
            <button
              type="button"
              onClick={switchCamera}
              className="h-9 w-9 rounded-full bg-black/60 text-white border border-white/20 hover:bg-black/80 active:scale-95 backdrop-blur-md flex items-center justify-center transition-transform shadow-md"
              title="تبديل الكاميرا"
            >
              <SwitchCamera className="w-4 h-4" />
            </button>
          )}

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="h-9 w-9 rounded-full bg-black/60 text-white border border-white/20 hover:bg-black/80 active:scale-95 backdrop-blur-md flex items-center justify-center transition-transform shadow-md"
            title={soundEnabled ? 'كتم الصوت' : 'تشغيل الصوت'}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <VolumeX className="w-4 h-4 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {/* CAMERA VIEWPORT */}
      <div className="flex-1 relative w-full h-full min-h-0 bg-black overflow-hidden flex items-center justify-center">
        {/* React-controlled Native Video Element (ZXing Mount) */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          autoPlay
          muted
        />

        {/* SCANNING RETICLE / AIMING TARGET */}
        {isScanning && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4 z-20">
            {/* Viewfinder Frame */}
            <div className="relative w-[84%] max-w-[320px] aspect-[4/3] rounded-2xl border-2 border-emerald-500/30 flex items-center justify-center shadow-[0_0_0_9999px_rgba(0,0,0,0.48)]">
              {/* 4 Glowing Corner Brackets */}
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />

              {/* Sweeping Laser Line */}
              <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_#34d399] animate-[scanner-sweep_2s_ease-in-out_infinite]" />

              {/* Center Crosshair */}
              <div className="w-2 h-2 rounded-full bg-emerald-400/40" />

              {/* Target Instruction Pill */}
              <div className="absolute -bottom-9 text-center w-full">
                <span className="text-[11px] font-medium text-emerald-200 bg-black/75 backdrop-blur-md px-3 py-1 rounded-full border border-emerald-500/30 shadow-lg inline-block">
                  وجّه الكاميرا نحو باركود الصنف أو رمز QR
                </span>
              </div>
            </div>
          </div>
        )}

        {/* LOADING STATE OVERLAY */}
        {isLoadingCamera && !cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90 p-6 text-center z-30">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shadow-lg">
              <RotateCw className="w-7 h-7 text-emerald-400 animate-spin" />
            </div>
            <p className="text-base font-bold text-white">جاري تشغيل كاميرا الموبايل...</p>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              تأكد من الضغط على &quot;سماح&quot; (Allow) عندما يطلب المتصفح الإذن للوصول إلى الكاميرا
            </p>
          </div>
        )}

        {/* ERROR OVERLAY */}
        {cameraError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-center z-30 overflow-y-auto">
            <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
              <CameraOff className="w-7 h-7 text-rose-400" />
            </div>
            <p className="text-sm font-bold text-rose-300 max-w-sm leading-relaxed px-2">
              {cameraError}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 bg-slate-900 border-slate-700 text-white hover:bg-slate-800 text-xs font-bold rounded-xl"
                onClick={() => startCamera(selectedCameraId)}
              >
                <RefreshCw className="w-4 h-4" />
                <span>إعادة المحاولة</span>
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-2 bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30 text-xs font-bold rounded-xl"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="w-4 h-4" />
                <span>التقاط صورة للرمز</span>
              </Button>

              {window.self !== window.top && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-slate-300 text-xs hover:bg-slate-800 rounded-xl"
                  onClick={() => window.open(window.location.href, '_blank')}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>فتح برابط مستقل</span>
                </Button>
              )}
            </div>
          </div>
        )}

        {/* PROCESSING INDICATOR */}
        {isProcessing && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500 text-slate-950 font-bold text-xs shadow-xl animate-pulse">
              <RotateCw className="w-3.5 h-3.5 animate-spin" />
              <span>جاري قراءة الكود وإضافة الصنف...</span>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM FLOATING CONTROLS & FEEDBACK PANEL */}
      <div className="absolute bottom-0 inset-x-0 z-40 pb-safe p-3 bg-gradient-to-t from-black via-black/90 to-transparent flex flex-col gap-2.5 pointer-events-auto">
        {/* LIVE RESULT NOTIFICATION */}
        {lastScannedResult && (
          <div
            className={`p-2.5 rounded-2xl border flex items-center justify-between gap-2 backdrop-blur-md shadow-xl animate-in fade-in slide-in-from-bottom-2 ${
              lastScannedResult.success
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-100'
                : 'bg-rose-950/80 border-rose-500/50 text-rose-100'
            }`}
          >
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  lastScannedResult.success
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-rose-500/20 text-rose-400'
                }`}
              >
                {lastScannedResult.success ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <AlertTriangle className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{lastScannedResult.name}</p>
                <p className="text-[11px] text-slate-300 truncate">
                  {lastScannedResult.success
                    ? `تمت الإضافة بنجاح • ${
                        lastScannedResult.price !== undefined
                          ? `${lastScannedResult.price} ج.م • `
                          : ''
                      }كود: ${lastScannedResult.code}`
                    : lastScannedResult.error}
                </p>
              </div>
            </div>

            {lastScannedResult.success && (
              <Badge
                variant="outline"
                className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] px-2 py-0.5 flex-shrink-0 font-bold"
              >
                بالسلة
              </Badge>
            )}
          </div>
        )}

        {/* EXPANDABLE MANUAL INPUT FORM */}
        {showManualInput && (
          <form
            onSubmit={handleManualSubmit}
            className="flex items-center gap-2 p-2 bg-slate-900/90 border border-slate-700/80 rounded-2xl backdrop-blur-md"
          >
            <Input
              type="text"
              placeholder="اكتب رقم الباركود أو الـ SKU يدوياً..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="h-10 bg-slate-950 border-slate-700 text-xs text-white placeholder:text-slate-500 rounded-xl"
              autoFocus
              dir="ltr"
            />
            <Button
              type="submit"
              size="sm"
              className="h-10 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex-shrink-0"
              disabled={!manualCode.trim() || isProcessing}
            >
              إضافة
            </Button>
          </form>
        )}

        {/* QUICK SAMPLE PRODUCTS TEST STRIP */}
        {sampleProducts.length > 0 && !showManualInput && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar pt-1">
            <span className="text-[10px] text-slate-400 flex-shrink-0">اختبار سريع:</span>
            {sampleProducts.map((p) => {
              const code = p.barcode || p.sku || '';
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleCodeScanned(code)}
                  className="px-2.5 py-1 rounded-lg bg-slate-900/80 hover:bg-slate-800 active:scale-95 text-slate-200 border border-slate-700/80 text-[11px] font-medium whitespace-nowrap flex items-center gap-1 backdrop-blur-sm transition-transform"
                >
                  <span className="text-emerald-400 font-mono text-[10px]">[{code}]</span>
                  <span className="truncate max-w-[90px]">{p.name}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ACTION BUTTONS ROW */}
        <div className="grid grid-cols-12 gap-2 pt-1">
          {/* Toggle Manual Input */}
          <button
            type="button"
            onClick={() => setShowManualInput(!showManualInput)}
            className={`col-span-3 h-11 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1 transition-colors ${
              showManualInput
                ? 'bg-emerald-600/30 text-emerald-300 border-emerald-500/40'
                : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border-slate-700/80'
            }`}
          >
            <Keyboard className="w-4 h-4" />
            <span>يدوي</span>
          </button>

          {/* Photo Capture / Snap Fallback */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="col-span-3 h-11 rounded-2xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 text-slate-300 text-xs font-bold flex items-center justify-center gap-1 transition-colors"
            title="التقاط صورة للباركود"
          >
            <UploadCloud className="w-4 h-4" />
            <span>صورة</span>
          </button>

          {/* Primary Done & Return Button */}
          <Button
            type="button"
            size="lg"
            className="col-span-6 h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-2xl flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-950/50"
            onClick={() => onOpenChange(false)}
          >
            <Check className="w-4 h-4" />
            <span>تم والعودة ({scannedSessionCount} أضيف)</span>
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
