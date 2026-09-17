import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  fetchPublicAttendanceInfo,
  submitPublicClock,
  PublicAttendanceInfo,
  PublicEmployee,
  ClockResult,
} from '@/services/attendanceApi';
import {
  Clock,
  Search,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  MapPin,
  ShieldAlert,
  ArrowRight,
  Phone,
  Building2,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function AttendancePublic() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [sessionInfo, setSessionInfo] = useState<PublicAttendanceInfo | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  // Selected Employee & Step
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<PublicEmployee | null>(null);
  const [pinDigits, setPinDigits] = useState(['', '', '', '']);
  const pinInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Geolocation
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'prompt' | 'granted' | 'denied' | 'checking'>('prompt');

  // Submitting
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clockResult, setClockResult] = useState<ClockResult | null>(null);

  // Current live time display
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch session info
  const loadSession = async () => {
    if (!token) {
      setInitError('رابط الحضور غير صالح. لم يتم تحديد رمز الفرع (Attendance Token).');
      setLoading(false);
      return;
    }

    setLoading(true);
    setInitError(null);
    try {
      const data = await fetchPublicAttendanceInfo(token);
      setSessionInfo(data);
    } catch (err: any) {
      setInitError(err.message || 'رمز الحضور غير صالح أو منتهي');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
  }, [token]);

  // Handle Location if restriction is enabled
  useEffect(() => {
    if (sessionInfo?.locationRestriction && navigator.geolocation) {
      setLocationStatus('checking');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
          setLocationStatus('granted');
        },
        () => {
          setLocationStatus('denied');
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }, [sessionInfo?.locationRestriction]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      toast.error('جهازك لا يدعم تحديد الموقع الجغرافي');
      return;
    }
    setLocationStatus('checking');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setLocationStatus('granted');
        toast.success('تم تحديد موقعك بنجاح');
      },
      (err) => {
        setLocationStatus('denied');
        toast.error('يرجى السماح بالوصول للموقع لتسجيل الحضور');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Filter employees
  const filteredEmployees = (sessionInfo?.employees || []).filter((emp) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return emp.name.toLowerCase().includes(query) || emp.phone.includes(query);
  });

  // Handle PIN input with auto-advance and backspace support
  const handlePinChange = (index: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    const newDigits = [...pinDigits];
    newDigits[index] = digit;
    setPinDigits(newDigits);
    setErrorMessage(null);

    // Auto advance to next input
    if (digit && index < 3) {
      pinInputRefs[index + 1].current?.focus();
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinInputRefs[index - 1].current?.focus();
    }
  };

  // Handle Clock Submit
  const handleClockSubmit = async () => {
    if (!selectedEmployee) return;
    const pin = pinDigits.join('');
    if (pin.length !== 4) {
      setErrorMessage('يرجى إدخال الرقم السري المكون من 4 أرقام كاملاً');
      return;
    }

    if (sessionInfo?.locationRestriction && locationStatus !== 'granted') {
      setErrorMessage('يجب السماح بتحديد الموقع الجغرافي للتحقق من تواجدك داخل المطعم');
      requestLocation();
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await submitPublicClock({
        token,
        employeeId: selectedEmployee.id,
        pin,
        action: 'auto',
        location: coords || undefined,
      });

      setClockResult(result);
    } catch (err: any) {
      setErrorMessage(err.message || 'تعذر تسجيل الحضور. يرجى المحاولة مرة أخرى.');
      setPinDigits(['', '', '', '']);
      pinInputRefs[0].current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset for next employee
  const handleResetForNext = () => {
    setSelectedEmployee(null);
    setPinDigits(['', '', '', '']);
    setErrorMessage(null);
    setClockResult(null);
    setSearchQuery('');
  };

  // Render: Loading Screen
  if (loading) {
    return (
      <div className="min-h-[100dvh] safe-area-inset bg-slate-950 text-slate-50 flex flex-col items-center justify-center p-4" dir="rtl">
        <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400 font-medium">جاري تجهيز شاشة تسجيل الحضور والانصراف...</p>
      </div>
    );
  }

  // Render: Invalid Token Error
  if (initError || !sessionInfo) {
    return (
      <div className="min-h-[100dvh] safe-area-inset bg-slate-950 text-slate-50 flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md w-full bg-slate-900 border-rose-900/50 shadow-2xl p-6 text-center">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 text-rose-500 mx-auto flex items-center justify-center mb-4">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold mb-2 text-rose-400">رمز الحضور غير صالح</h2>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            {initError || 'الرمز الممسوح منتهي أو تم إلغاؤه من قبل إدارة المطعم. يرجى مراجعة المدير لمسح أحدث رمز QR.'}
          </p>
          <Button onClick={loadSession} variant="outline" className="gap-2 border-slate-700">
            <RefreshCw className="w-4 h-4" />
            إعادة المحاولة
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] safe-area-inset bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col" dir="rtl">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-20 px-4 py-3 safe-area-top">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-bold">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-sm leading-tight text-slate-100">{sessionInfo.branchName}</h1>
              <p className="text-[11px] text-slate-400">تسجيل الحضور والانصراف</p>
            </div>
          </div>
          <div className="text-left font-mono">
            <span className="text-xs text-primary font-bold">
              {currentTime.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
            <span className="block text-[10px] text-slate-400">
              {currentTime.toLocaleDateString('ar-EG', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-md w-full mx-auto p-4 flex flex-col justify-center">
        <AnimatePresence mode="wait">
          {/* STEP 3: Success Screen */}
          {clockResult ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="my-auto"
            >
              <Card className="bg-slate-900/90 border-slate-800 backdrop-blur-xl shadow-2xl p-6 text-center">
                <div
                  className={cn(
                    'w-20 h-20 rounded-full mx-auto flex items-center justify-center mb-5',
                    clockResult.type === 'check_in'
                      ? 'bg-emerald-500/20 text-emerald-400 ring-4 ring-emerald-500/20'
                      : clockResult.type === 'check_out'
                      ? 'bg-indigo-500/20 text-indigo-400 ring-4 ring-indigo-500/20'
                      : 'bg-amber-500/20 text-amber-400 ring-4 ring-amber-500/20'
                  )}
                >
                  <CheckCircle2 className="w-10 h-10" />
                </div>

                <h2 className="text-2xl font-bold text-slate-100 mb-1">
                  {clockResult.type === 'check_in'
                    ? 'تم تسجيل الحضور بنجاح'
                    : clockResult.type === 'check_out'
                    ? 'تم تسجيل الانصراف بنجاح'
                    : 'سجل اليوم مكتمل'}
                </h2>

                <p className="text-primary font-bold text-lg mb-4">{clockResult.employeeName}</p>

                <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800 space-y-2 mb-6">
                  {clockResult.time && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">وقت التسجيل:</span>
                      <span className="font-mono font-bold text-slate-100">{clockResult.time}</span>
                    </div>
                  )}
                  {clockResult.checkIn && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">وقت الحضور:</span>
                      <span className="font-mono font-bold text-slate-100">{clockResult.checkIn}</span>
                    </div>
                  )}
                  {clockResult.checkOut && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">وقت الانصراف:</span>
                      <span className="font-mono font-bold text-slate-100">{clockResult.checkOut}</span>
                    </div>
                  )}
                  {clockResult.hours !== undefined && clockResult.hours > 0 && (
                    <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-800">
                      <span className="text-slate-400">ساعات العمل:</span>
                      <span className="font-bold text-emerald-400">{clockResult.hours} ساعة</span>
                    </div>
                  )}
                  {clockResult.lateMinutes !== undefined && clockResult.lateMinutes > 0 && (
                    <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-800">
                      <span className="text-amber-400">تأخير:</span>
                      <span className="font-bold text-amber-400">{clockResult.lateMinutes} دقيقة</span>
                    </div>
                  )}
                </div>

                <Button onClick={handleResetForNext} className="w-full h-12 text-base font-bold gap-2">
                  <UserCheck className="w-5 h-5" />
                  تسجيل موظف آخر
                </Button>
              </Card>
            </motion.div>
          ) : selectedEmployee ? (
            /* STEP 2: PIN Verification & Action */
            <motion.div
              key="pin-entry"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="my-auto"
            >
              <Card className="bg-slate-900/90 border-slate-800 backdrop-blur-xl shadow-2xl p-4 sm:p-6">
                {/* Back button */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedEmployee(null);
                    setPinDigits(['', '', '', '']);
                    setErrorMessage(null);
                  }}
                  className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 mb-4 transition-colors"
                >
                  <ArrowRight className="w-4 h-4" />
                  الرجوع لقائمة الموظفين
                </button>

                {/* Selected Employee Card */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-bold text-lg">
                    {selectedEmployee.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-100 truncate">{selectedEmployee.name}</h3>
                    <p className="text-xs text-primary font-medium">{selectedEmployee.role}</p>
                    <p className="text-[11px] text-slate-400 font-mono" dir="ltr">
                      {selectedEmployee.phone}
                    </p>
                  </div>
                </div>

                {/* PIN Input Section */}
                <div className="text-center mb-6">
                  <label className="block text-sm font-medium text-slate-300 mb-3 flex items-center justify-center gap-2">
                    <Lock className="w-4 h-4 text-primary" />
                    أدخل الرقم السري PIN الخاص بك (4 أرقام)
                  </label>

                  {/* 4 Digit Boxes */}
                  <div className="flex justify-center gap-2 sm:gap-3 dir-ltr" dir="ltr">
                    {pinDigits.map((digit, idx) => (
                      <input
                        key={idx}
                        ref={pinInputRefs[idx]}
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handlePinChange(idx, e.target.value)}
                        onKeyDown={(e) => handlePinKeyDown(idx, e)}
                        autoFocus={idx === 0}
                        className={cn(
                          'w-12 h-14 sm:w-14 sm:h-16 text-center text-xl sm:text-2xl font-bold rounded-xl border bg-slate-950 text-slate-100 transition-all focus:outline-none focus:ring-2 focus:ring-primary',
                          digit ? 'border-primary shadow-lg shadow-primary/20' : 'border-slate-800'
                        )}
                      />
                    ))}
                  </div>
                </div>

                {/* Geolocation Notice if applicable */}
                {sessionInfo.locationRestriction && (
                  <div className="mb-4">
                    {locationStatus === 'granted' ? (
                      <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                        <MapPin className="w-4 h-4 shrink-0" />
                        <span>تم التحقق من الموقع الجغرافي داخل المطعم</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2 text-xs text-amber-400 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 shrink-0" />
                          <span>التحقق من الموقع مطلوب</span>
                        </div>
                        <Button size="sm" variant="ghost" onClick={requestLocation} className="h-7 text-xs text-amber-300">
                          تحديد الموقع
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Error Banner */}
                {errorMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </motion.div>
                )}

                {/* Action Button */}
                <Button
                  onClick={handleClockSubmit}
                  disabled={isSubmitting || pinDigits.join('').length !== 4}
                  className="w-full h-14 text-lg font-bold shadow-xl rounded-xl gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                      جاري المعالجة والتحقق...
                    </>
                  ) : (
                    <>
                      <Clock className="w-5 h-5" />
                      تسجيل الحضور / الانصراف
                    </>
                  )}
                </Button>
              </Card>
            </motion.div>
          ) : (
            /* STEP 1: Employee Selection */
            <motion.div
              key="employee-select"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col h-full space-y-4"
            >
              {/* Title & Instructions */}
              <div className="text-center py-2">
                <h2 className="text-xl font-bold text-slate-100">اختر اسمك لتسجيل الحضور</h2>
                <p className="text-xs text-slate-400 mt-1">اضغط على اسمك ثم أدخل الرقم السري PIN المكون من 4 أرقام</p>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="ابحث باسمك أو رقم هاتفك..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10 h-12 bg-slate-900/90 border-slate-800 text-slate-100 placeholder:text-slate-500 rounded-xl"
                />
              </div>

              {/* Employees List */}
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {filteredEmployees.map((emp) => (
                  <Card
                    key={emp.id}
                    onClick={() => {
                      setSelectedEmployee(emp);
                      setPinDigits(['', '', '', '']);
                      setErrorMessage(null);
                    }}
                    className="cursor-pointer bg-slate-900/60 hover:bg-slate-800/80 border-slate-800 transition-all hover:border-primary/50 hover:shadow-lg active:scale-[0.98]"
                  >
                    <CardContent className="p-3.5 flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-primary/20 text-primary flex items-center justify-center font-bold text-base">
                        {emp.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <h3 className="font-bold text-slate-100 text-sm truncate">{emp.name}</h3>
                          <Badge variant="secondary" className="text-[10px] bg-slate-800 text-slate-300 border-none shrink-0">
                            {emp.role}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="flex items-center gap-1 font-mono text-[11px]" dir="ltr">
                            <Phone className="w-3 h-3 text-slate-500" />
                            {emp.phone || 'بدون هاتف'}
                          </span>
                          {emp.department && <span>• {emp.department}</span>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                {filteredEmployees.length === 0 && (
                  <div className="text-center py-12 text-slate-500">
                    <UserCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">لم يتم العثور على موظف مطابق للبحث</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="py-3 text-center text-[11px] text-slate-600 border-t border-slate-900 safe-area-bottom">
        نظام إدارة المطعم الذكي • الحضور والانصراف الآمن
      </footer>
    </div>
  );
}
