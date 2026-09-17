import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { auth as firebaseAuth } from '@/lib/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, GoogleAuthProvider, signInWithPopup, getAdditionalUserInfo } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Eye, EyeOff, LogIn, UserPlus, Mail, Lock, User, Sparkles, Store, ShieldAlert, BadgeCheck, KeyRound, LockKeyhole } from 'lucide-react';
import mkLogo from '@/assets/mk-logo.png';
import { cn } from '@/lib/utils';

export default function Auth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [isActivated, setIsActivated] = useState(() => {
    return localStorage.getItem('sys_activated') === 'true';
  });
  const [activationInput, setActivationInput] = useState('');
  const [activationError, setActivationError] = useState(false);

  const handleActivate = (e: React.FormEvent) => {
    e.preventDefault();
    if (activationInput === '2026') {
      localStorage.setItem('sys_activated', 'true');
      setIsActivated(true);
      toast.success('تم تنشيط النظام بنجاح');
    } else {
      setActivationError(true);
      toast.error('رمز التنشيط غير صحيح، يرجى المحاولة مرة أخرى');
    }
  };

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Signup state
  const [isCreationUnlocked, setIsCreationUnlocked] = useState(false);
  const [signupAuthPassword, setSignupAuthPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithEmailAndPassword(firebaseAuth, loginEmail, loginPassword);
      toast.success('تم تسجيل الدخول بنجاح');
      navigate('/');
    } catch (error: any) {
      toast.error(error.message || 'خطأ في تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(firebaseAuth, provider);
      const additionalInfo = getAdditionalUserInfo(result);
      
      if (additionalInfo?.isNewUser) {
        await result.user.delete();
        await firebaseAuth.signOut();
        toast.error('الحساب غير موجود. يرجى إنشاء حساب جديد أولاً.');
        return;
      }
      
      toast.success('تم تسجيل الدخول بحساب جوجل بنجاح');
      navigate('/');
    } catch (error: any) {
      toast.error(error.message || 'خطأ في تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(firebaseAuth, provider);
      const additionalInfo = getAdditionalUserInfo(result);
      
      if (!additionalInfo?.isNewUser) {
        toast.success('هذا الحساب موجود بالفعل. تم تسجيل الدخول.');
      } else {
        toast.success('تم إنشاء حساب جوجل بنجاح');
      }
      navigate('/');
    } catch (error: any) {
      toast.error(error.message || 'خطأ في إنشاء الحساب');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupPassword !== signupConfirmPassword) {
      toast.error('كلمات المرور غير متطابقة');
      return;
    }
    if (signupPassword.length < 6) {
      toast.error('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
      return;
    }
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(firebaseAuth, signupEmail, signupPassword);
      await updateProfile(userCredential.user, { displayName: signupName });
      toast.success('تم إنشاء الحساب بنجاح!');
      navigate('/');
    } catch (error: any) {
      toast.error(error.message || 'خطأ في إنشاء الحساب');
    } finally {
      setLoading(false);
    }
  };

  if (!isActivated) {
    return (
      <div className="min-h-[100dvh] bg-[#080b11] text-white flex items-center justify-center p-3 sm:p-4 relative overflow-hidden font-cairo safe-area-inset-top safe-area-inset-bottom">
        {/* Ambient background glows */}
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
        
        {/* Animated pattern background */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff02_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md relative z-10"
        >
          {/* Glassmorphism Card */}
          <Card className="border-0 bg-[#0d121f]/60 backdrop-blur-[32px] shadow-[0_30px_60px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.05)] rounded-2xl sm:rounded-[32px] overflow-hidden p-5 sm:p-8 text-center space-y-5 sm:space-y-6">
            
            {/* Pulsing Lock/Key Icon */}
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-2 flex items-center justify-center">
              {/* Outer pulsing ring */}
              <motion.div 
                animate={{ scale: [1, 1.15, 1], opacity: [0.15, 0.3, 0.15] }}
                transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}
                className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl"
              />
              
              {/* Rotating decorative border */}
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
                className="absolute inset-0 rounded-full border border-dashed border-emerald-500/30"
              />

              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr from-emerald-500 to-emerald-400 p-[1px] shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center justify-center relative z-10">
                <div className="w-full h-full rounded-[14px] bg-[#0d121f]/90 flex items-center justify-center">
                  <KeyRound className="w-7 h-7 sm:w-8 sm:h-8 text-emerald-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-black text-white drop-shadow-sm">تنشيط النظام</h2>
              <p className="text-xs text-slate-400 leading-relaxed font-semibold max-w-xs mx-auto">
                الرجاء إدخال رمز الأمان المكون من 4 أرقام لتنشيط صلاحية النظام للعمل على هذا الجهاز.
              </p>
            </div>

            <form onSubmit={handleActivate} className="space-y-5 sm:space-y-6">
              <div className="space-y-3">
                <div className="relative">
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={activationInput}
                    onChange={(e) => setActivationInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className={cn(
                      "w-44 sm:w-48 mx-auto text-center font-bold text-2xl sm:text-3xl h-14 sm:h-16 bg-black/40 border-white/10 text-white tracking-[0.8em] pl-[0.8em] focus-visible:ring-emerald-500/50 rounded-2xl transition-all duration-300",
                      activationError && "border-red-500 ring-2 ring-red-500/20"
                    )}
                    dir="ltr"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 sm:h-14 font-bold text-sm sm:text-base bg-gradient-to-l from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-[0_8px_25px_rgba(16,185,129,0.2)] hover:shadow-[0_8px_30px_rgba(16,185,129,0.4)] transition-all rounded-2xl border-0"
              >
                تنشيط الصلاحية
              </Button>
            </form>
            
            <div className="text-[10px] text-slate-600 font-bold uppercase tracking-widest pt-2">
              MK SYSTEM SECURITY GATE
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[#080b11] text-white flex items-stretch overflow-x-hidden font-cairo safe-area-inset-top safe-area-inset-bottom">
      {/* Ambient background glows */}
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Right Side Pane - Showcase (hidden on mobile/tablet) */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#0d121f]/50 border-l border-white/5 flex-col justify-between p-12 relative overflow-hidden">
        {/* Animated pattern background */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff03_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />
        
        {/* Logo and brand name */}
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center p-1 backdrop-blur-md">
            <img src={mkLogo} alt="MK" className="w-full h-full object-contain mix-blend-screen brightness-125" />
          </div>
          <span className="font-black text-xl bg-gradient-to-l from-white to-gray-400 bg-clip-text text-transparent">إم كـي سيستم</span>
        </div>

        {/* Dynamic graphics and welcoming */}
        <div className="my-auto space-y-8 relative z-10 max-w-lg">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-4"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
              الجيل القادم من إدارة المطاعم
            </div>
            <h2 className="text-4xl xl:text-5xl font-black leading-tight bg-gradient-to-l from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
              نظام إدارة المطاعم المتقدم والمميز
            </h2>
            <p className="text-slate-400 text-base leading-relaxed">
              حل برمجي متكامل وسحابي مصمم خصيصاً لتسريع عمليات البيع، وإدارة المطبخ، وتتبع المخزون والعمليات المالية بدقة متناهية وسهولة مطلقة.
            </p>
          </motion.div>

          {/* Interactive stat mockups */}
          <div className="grid grid-cols-2 gap-4">
            <motion.div 
              whileHover={{ y: -5 }}
              className="p-5 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm space-y-2 transition-all"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Store className="w-4 h-4" />
              </div>
              <p className="text-xs text-slate-500 font-bold">نقاط البيع الحية</p>
              <p className="text-lg font-black text-white">متصلة وتعمل بنشاط</p>
            </motion.div>

            <motion.div 
              whileHover={{ y: -5 }}
              className="p-5 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm space-y-2 transition-all"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <BadgeCheck className="w-4 h-4" />
              </div>
              <p className="text-xs text-slate-500 font-bold">حماية وتشفير</p>
              <p className="text-lg font-black text-white">بياناتك مشفرة بالكامل</p>
            </motion.div>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-xs text-slate-600 relative z-10">
          MK System © {new Date().getFullYear()} - جميع الحقوق محفوظة لشركة إم كي.
        </div>
      </div>

      {/* Left Side Pane - Form (takes full width on mobile) */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 lg:p-12 relative">
        <div className="w-full max-w-md space-y-6 sm:space-y-8">
          
          {/* Logo only shown on mobile */}
          <div className="flex lg:hidden flex-col items-center text-center space-y-3 sm:space-y-4 mb-2">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center p-2 backdrop-blur-md shadow-2xl">
              <img src={mkLogo} alt="MK" className="w-full h-full object-contain mix-blend-screen brightness-125" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white">إم كـي سيستم</h1>
              <p className="text-emerald-400 text-xs mt-1 font-bold">نظام إدارة المطاعم المتقدم</p>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            {/* Glassmorphism Card */}
            <Card className="border-0 bg-[#0d121f]/60 backdrop-blur-[32px] shadow-[0_30px_60px_rgba(0,0,0,0.4),inset_0_1px_1px_rgba(255,255,255,0.05)] rounded-2xl sm:rounded-[28px] overflow-hidden">
              <Tabs 
                defaultValue="login"
                onValueChange={(val) => {
                  if (val === 'login') {
                    setIsCreationUnlocked(false);
                    setSignupAuthPassword('');
                  }
                }}
              >
                <CardHeader className="p-0 border-b border-white/5">
                  <TabsList className="w-full bg-black/20 border-0 rounded-none h-14 sm:h-16 p-0 gap-0">
                    <TabsTrigger value="login" className="flex-1 rounded-none h-full gap-2 data-[state=active]:bg-white/[0.03] data-[state=active]:text-white text-slate-400 data-[state=active]:border-b-2 data-[state=active]:border-emerald-500 font-bold text-xs sm:text-sm transition-all focus-visible:ring-0">
                      <LogIn className="w-4 h-4" />
                      تسجيل الدخول
                    </TabsTrigger>
                    <TabsTrigger value="signup" className="flex-1 rounded-none h-full gap-2 data-[state=active]:bg-white/[0.03] data-[state=active]:text-white text-slate-400 data-[state=active]:border-b-2 data-[state=active]:border-emerald-500 font-bold text-xs sm:text-sm transition-all focus-visible:ring-0">
                      <UserPlus className="w-4 h-4" />
                      حساب جديد
                    </TabsTrigger>
                  </TabsList>
                </CardHeader>

                <CardContent className="p-5 sm:p-8">
                  <TabsContent value="login" className="mt-0 space-y-6 outline-none">
                    <div className="space-y-1">
                      <h3 className="text-xl font-black text-white">أهلاً بك مجدداً</h3>
                      <p className="text-xs text-slate-400 font-medium">الرجاء إدخال بيانات حسابك لمتابعة العمل</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-5">
                      <div className="space-y-2">
                        <Label className="text-slate-300 text-xs font-semibold uppercase tracking-wider">البريد الإلكتروني</Label>
                        <div className="relative group">
                          <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
                          <Input
                            type="email"
                            placeholder="email@example.com"
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            className="pr-11 h-12 bg-black/30 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-1 focus-visible:ring-emerald-500/50 hover:bg-black/40 transition-all rounded-xl border"
                            required
                            dir="ltr"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Label className="text-slate-300 text-xs font-semibold uppercase tracking-wider">كلمة المرور</Label>
                        </div>
                        <div className="relative group">
                          <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            className="pr-11 pl-11 h-12 bg-black/30 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-1 focus-visible:ring-emerald-500/50 hover:bg-black/40 transition-all rounded-xl border"
                            required
                            dir="ltr"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors p-1"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <Button type="submit" className="w-full h-12 font-bold text-base mt-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-[0_8px_25px_rgba(16,185,129,0.2)] hover:shadow-[0_8px_30px_rgba(16,185,129,0.4)] transition-all rounded-xl border-0" disabled={loading}>
                        {loading ? 'جاري التحقق والدخول...' : 'دخول'}
                      </Button>
                      
                      <div className="relative my-6 flex items-center justify-center">
                        <div className="absolute inset-x-0 h-px bg-white/5" />
                        <span className="relative bg-[#0d121f] px-3.5 text-slate-500 text-xs font-bold uppercase tracking-wider rounded-full border border-white/5">أو</span>
                      </div>
                      
                      <Button type="button" variant="outline" className="w-full h-12 bg-white/5 border-white/10 hover:bg-white/10 text-white transition-all rounded-xl font-bold gap-2 text-sm shadow-sm" onClick={handleGoogleLogin} disabled={loading}>
                        <svg className="h-4 w-4 text-current" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                          <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z" />
                        </svg>
                        الدخول باستخدام جوجل
                      </Button>
                    </form>
                  </TabsContent>

                  <TabsContent value="signup" className="mt-0 space-y-6 outline-none">
                    {!isCreationUnlocked ? (
                      <div className="space-y-6 py-2 text-center">
                        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto border border-red-500/20 shadow-lg shadow-red-500/5">
                          <ShieldAlert className="w-7 h-7 text-red-400" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-xl font-black text-white">منطقة محظورة</h3>
                          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">تطلب هذه الميزة صلاحية مسؤول النظام لإنشاء حساب جديد.</p>
                        </div>
                        
                        <div className="space-y-3 text-right">
                          <Label className="text-slate-300 text-xs font-semibold uppercase tracking-wider">رمز تصريح المسؤول (Admin PIN)</Label>
                          <div className="relative group">
                            <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
                            <Input
                              type="password"
                              placeholder="أدخل الرمز ثم اضغط Enter..."
                              value={signupAuthPassword}
                              onChange={(e) => setSignupAuthPassword(e.target.value)}
                              className="pr-11 h-12 bg-black/30 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-1 focus-visible:ring-emerald-500/50 rounded-xl text-center tracking-widest text-lg font-mono font-bold"
                              dir="ltr"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (signupAuthPassword === '112233445566') {
                                    setIsCreationUnlocked(true);
                                    setSignupAuthPassword('');
                                    toast.success('تم فك قفل الصلاحية بنجاح');
                                  } else {
                                    toast.error('رمز المسؤول غير صحيح');
                                  }
                                }
                              }}
                            />
                          </div>
                        </div>

                        <Button 
                          type="button"
                          className="w-full h-12 font-bold bg-white/5 hover:bg-white/10 text-white border border-white/5 rounded-xl text-sm" 
                          onClick={() => {
                            if (signupAuthPassword === '112233445566') {
                              setIsCreationUnlocked(true);
                              setSignupAuthPassword('');
                              toast.success('تم فك قفل الصلاحية بنجاح');
                            } else {
                              toast.error('رمز المسؤول غير صحيح');
                            }
                          }}
                        >
                          فتح الصلاحية
                        </Button>
                      </div>
                    ) : (
                      <motion.form 
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-5"
                        onSubmit={handleSignup}
                      >
                        <div className="space-y-1">
                          <h3 className="text-xl font-black text-white">إنشاء حساب موظف</h3>
                          <p className="text-xs text-slate-400 font-medium">سجل بيانات الموظف الجديد للبدء بالعمل</p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-slate-300 text-xs font-semibold uppercase tracking-wider">الاسم الكامل</Label>
                          <div className="relative group">
                            <User className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
                            <Input
                              placeholder="الاسم"
                              value={signupName}
                              onChange={(e) => setSignupName(e.target.value)}
                              className="pr-11 h-12 bg-black/30 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-1 focus-visible:ring-emerald-500/50 rounded-xl"
                              required
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-slate-300 text-xs font-semibold uppercase tracking-wider">البريد الإلكتروني</Label>
                          <div className="relative group">
                            <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-emerald-400 transition-colors" />
                            <Input
                              type="email"
                              placeholder="email@example.com"
                              value={signupEmail}
                              onChange={(e) => setSignupEmail(e.target.value)}
                              className="pr-11 h-12 bg-black/30 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-1 focus-visible:ring-emerald-500/50 rounded-xl"
                              required
                              dir="ltr"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          <div className="space-y-2">
                            <Label className="text-slate-300 text-xs font-semibold uppercase tracking-wider">كلمة المرور</Label>
                            <Input
                              type="password"
                              placeholder="6+ حروف"
                              value={signupPassword}
                              onChange={(e) => setSignupPassword(e.target.value)}
                              className="h-12 text-center bg-black/30 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-1 focus-visible:ring-emerald-500/50 rounded-xl font-bold"
                              required
                              dir="ltr"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-slate-300 text-xs font-semibold uppercase tracking-wider">تأكيد المرور</Label>
                            <Input
                              type="password"
                              placeholder="تطابق"
                              value={signupConfirmPassword}
                              onChange={(e) => setSignupConfirmPassword(e.target.value)}
                              className="h-12 text-center bg-black/30 border-white/10 text-white placeholder:text-slate-600 focus-visible:ring-1 focus-visible:ring-emerald-500/50 rounded-xl font-bold"
                              required
                              dir="ltr"
                            />
                          </div>
                        </div>

                        <Button type="submit" className="w-full h-12 font-bold mt-4 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-[0_8px_25px_rgba(16,185,129,0.2)] transition-all rounded-xl border-0" disabled={loading}>
                          {loading ? 'جاري إنشاء الحساب...' : 'تسجيل حساب جديد'}
                        </Button>

                        <div className="relative my-6 flex items-center justify-center">
                          <div className="absolute inset-x-0 h-px bg-white/5" />
                          <span className="relative bg-[#0d121f] px-3.5 text-slate-500 text-xs font-bold uppercase tracking-wider rounded-full border border-white/5">أو</span>
                        </div>

                        <Button type="button" variant="outline" className="w-full h-12 bg-white/5 border-white/10 hover:bg-white/10 text-white transition-all rounded-xl font-bold gap-2 text-sm shadow-sm" onClick={handleGoogleSignup} disabled={loading}>
                          <svg className="h-4 w-4 text-current" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                            <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z" />
                          </svg>
                          التسجيل السريع باستخدام جوجل
                        </Button>
                      </motion.form>
                    )}
                  </TabsContent>
                </CardContent>
              </Tabs>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
