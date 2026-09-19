import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { auth as firebaseAuth } from '@/lib/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile, 
  GoogleAuthProvider, 
  signInWithPopup, 
  getAdditionalUserInfo 
} from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  Eye, 
  EyeOff, 
  LogIn, 
  UserPlus, 
  Mail, 
  Lock, 
  User, 
  Sparkles, 
  ShieldAlert, 
  KeyRound, 
  BookOpen, 
  BookMarked,
  Feather,
  Stamp,
  CheckCircle2,
  Library,
  Bookmark
} from 'lucide-react';
import mkLogo from '@/assets/mk-logo.png';
import { cn } from '@/lib/utils';
import { LibraryAtmosphere } from '@/components/auth/LibraryAtmosphere';

export default function Auth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // System Activation state
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
      toast.success('تم فك قفل خزانة المكتبة وتنشيط النظام بنجاح');
    } else {
      setActivationError(true);
      toast.error('رمز التنشيط غير صحيح (المطلوب: 2026)');
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
      toast.success('مرحباً بك في قاعة المكتبة - تم تسجيل الدخول بنجاح');
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
        toast.error('الحساب غير مسجل في بطاقات المكتبة. يرجى إنشاء حساب جديد أولاً.');
        return;
      }
      
      toast.success('تم التحقق من بطاقة القارئ عبر حساب جوجل بنجاح');
      navigate('/');
    } catch (error: any) {
      toast.error(error.message || 'خطأ في تسجيل الدخول بحساب جوجل');
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
        toast.success('بطاقة هذا الحساب موجودة بالفعل. تم تسجيل الدخول.');
      } else {
        toast.success('تم إصدار بطاقة حساب جوجل بنجاح في سجلات المكتبة');
      }
      navigate('/');
    } catch (error: any) {
      toast.error(error.message || 'خطأ في إنشاء الحساب بحساب جوجل');
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
      toast.success('تم تسجيل بطاقة الموظف الجديد في سجلات المكتبة بنجاح!');
      navigate('/');
    } catch (error: any) {
      toast.error(error.message || 'خطأ في إنشاء الحساب');
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Activation Screen (Library Security Seal & Antique Key Gate)
  // -------------------------------------------------------------
  if (!isActivated) {
    return (
      <div className="min-h-[100dvh] bg-[#0d0906] text-amber-50 flex items-center justify-center p-3 sm:p-4 relative overflow-hidden font-cairo select-none safe-area-inset-top safe-area-inset-bottom">
        {/* Deep Library Wood Glows */}
        <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-amber-600/10 rounded-full blur-[140px] pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-[600px] h-[600px] bg-emerald-700/10 rounded-full blur-[140px] pointer-events-none" />

        {/* Vintage Parchment Texture & Subtle Bookshelf Silhouette */}
        <div 
          className="absolute inset-0 opacity-[0.08] pointer-events-none" 
          style={{
            backgroundImage: `radial-gradient(#d97706 1px, transparent 1px), radial-gradient(#92400e 1px, #0d0906 1px)`,
            backgroundSize: '32px 32px'
          }}
        />

        {/* Floating atmospheric gold particles */}
        <div className="absolute inset-0 pointer-events-none">
          {[...Array(10)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full bg-amber-300/30"
              style={{
                top: `${(i * 11) % 90}%`,
                left: `${(i * 17) % 90}%`,
              }}
              animate={{
                y: [-10, 10, -10],
                opacity: [0.2, 0.6, 0.2],
              }}
              transition={{
                duration: 4 + (i % 4),
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md relative z-10"
        >
          {/* Antique Leather & Brass Vault Box */}
          <Card className="border-2 border-[#5c3a21] bg-gradient-to-b from-[#1f150e]/95 via-[#18100a]/95 to-[#120b07]/95 backdrop-blur-2xl shadow-[0_30px_70px_rgba(0,0,0,0.8),inset_0_1px_3px_rgba(251,191,36,0.2)] rounded-3xl p-6 sm:p-8 text-center space-y-6 relative overflow-hidden">
            {/* Top decorative velvet bookmark ribbon */}
            <div className="absolute -top-1 left-8 w-6 h-12 bg-gradient-to-b from-red-700 to-red-900 rounded-b-md shadow-md flex items-end justify-center pb-1 border-x border-b border-red-500/40">
              <div className="w-2 h-2 rounded-full bg-amber-400/80 shadow-sm" />
            </div>

            {/* Corner Brass Ornaments */}
            <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-amber-500/40 rounded-tr-lg" />
            <div className="absolute top-2 left-2 w-6 h-6 border-t-2 border-l-2 border-amber-500/40 rounded-tl-lg" />
            <div className="absolute bottom-2 right-2 w-6 h-6 border-b-2 border-r-2 border-amber-500/40 rounded-br-lg" />
            <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-amber-500/40 rounded-bl-lg" />

            {/* Brass Key Crest */}
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-2 flex items-center justify-center">
              <motion.div 
                animate={{ scale: [1, 1.12, 1], opacity: [0.2, 0.4, 0.2] }}
                transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                className="absolute inset-0 rounded-full bg-amber-500/20 blur-xl"
              />
              <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl bg-gradient-to-tr from-[#78350f] via-[#b45309] to-[#d97706] p-[2px] shadow-[0_0_25px_rgba(217,119,6,0.35)] flex items-center justify-center relative z-10">
                <div className="w-full h-full rounded-[14px] bg-[#1a110a] flex items-center justify-center">
                  <KeyRound className="w-8 h-8 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs font-bold">
                <Stamp className="w-3.5 h-3.5 text-amber-400" />
                <span>ختم أمان خزانة المكتبة</span>
              </div>
              <h2 className="text-2xl font-black text-amber-100 tracking-tight">تنشيط نظام المكتبة</h2>
              <p className="text-xs text-amber-200/70 leading-relaxed max-w-xs mx-auto font-medium">
                أدخل مفتاح الأمان المكتبي المعتمد (4 أرقام) لفتح سجلات المكتبة ونظام الفهرسة على هذا الجهاز.
              </p>
            </div>

            <form onSubmit={handleActivate} className="space-y-5">
              <div className="relative">
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={activationInput}
                  onChange={(e) => setActivationInput(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className={cn(
                    "w-48 mx-auto text-center font-bold text-3xl h-14 bg-black/60 border-2 border-amber-600/40 text-amber-200 tracking-[0.7em] pl-[0.7em] focus-visible:ring-2 focus-visible:ring-amber-500/60 rounded-2xl shadow-inner transition-all duration-300",
                    activationError && "border-red-500 ring-2 ring-red-500/40"
                  )}
                  dir="ltr"
                  required
                  autoFocus
                />
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 font-bold text-sm bg-gradient-to-l from-[#b45309] to-[#d97706] hover:from-[#92400e] hover:to-[#b45309] text-amber-950 shadow-[0_6px_20px_rgba(217,119,6,0.3)] transition-all rounded-xl border border-amber-400/40"
              >
                فتح الخزانة وتنشيط الصلاحية
              </Button>
            </form>
            
            <div className="text-[10px] text-amber-400/50 font-mono tracking-widest pt-1 flex items-center justify-center gap-2">
              <BookOpen className="w-3 h-3 text-amber-500/60" />
              <span>MK LIBRARY SECURITY GATE • 2026</span>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // Main Authentication Interface (Atmospheric Real Library Hall)
  // -------------------------------------------------------------
  return (
    <div className="min-h-[100dvh] bg-[#0c0805] text-amber-50 flex items-stretch overflow-x-hidden font-cairo safe-area-inset-top safe-area-inset-bottom">
      {/* Warm Ambient Background Highlights */}
      <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-amber-700/10 rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[600px] h-[600px] bg-emerald-800/10 rounded-full blur-[150px] pointer-events-none" />

      {/* Right Pane (Showcase of Grand Library Bookshelf - Desktop Only) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#18110b] via-[#140d08] to-[#0f0905] border-l-2 border-[#3d2719] flex-col justify-between p-8 xl:p-12 relative overflow-hidden">
        <LibraryAtmosphere />
      </div>

      {/* Left Pane (Reader's Registry Desk & Ledger Form) */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-3 sm:p-6 lg:p-10 relative bg-radial-at-c from-[#160e09] to-[#0b0704]">
        {/* Subtle wood grain background */}
        <div 
          className="absolute inset-0 opacity-[0.05] pointer-events-none" 
          style={{
            backgroundImage: `radial-gradient(#d97706 1px, transparent 1px), radial-gradient(#92400e 1px, #160e09 1px)`,
            backgroundSize: '24px 24px'
          }}
        />

        <div className="w-full max-w-md space-y-5 relative z-10">
          
          {/* Mobile Library Header (Shown on mobile/tablet) */}
          <div className="flex lg:hidden flex-col items-center text-center space-y-2 mb-2">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-b from-[#2d1c12] to-[#1a100a] border-2 border-amber-500/40 flex items-center justify-center p-2 shadow-xl">
                <img src={mkLogo} alt="MK" className="w-full h-full object-contain brightness-110" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-600 border border-amber-300/40 flex items-center justify-center shadow-md">
                <BookOpen className="w-2.5 h-2.5 text-amber-200" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-black text-amber-100 flex items-center justify-center gap-2">
                <span>مكتبة إم كـي المركزية</span>
              </h1>
              <p className="text-amber-400 text-xs font-semibold mt-0.5">سجل الدخول وقيد القراء والموظفين</p>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Master Library Registry Ledger Card */}
            <Card className="border-2 border-[#4a2e1a] bg-gradient-to-b from-[#1b120c]/95 via-[#160e08]/95 to-[#100905]/95 backdrop-blur-2xl shadow-[0_25px_55px_rgba(0,0,0,0.85),inset_0_1px_2px_rgba(251,191,36,0.2)] rounded-3xl overflow-hidden relative">
              
              {/* Velvet bookmark hanging at top right */}
              <div className="absolute -top-1 right-8 w-5 h-10 bg-gradient-to-b from-red-700 to-red-950 rounded-b-md shadow-md border-x border-b border-red-500/30 flex items-end justify-center pb-1 z-20">
                <Bookmark className="w-2.5 h-2.5 text-amber-400" />
              </div>

              {/* Decorative Leather Spine on side */}
              <div className="absolute top-0 bottom-0 right-0 w-1.5 bg-gradient-to-b from-amber-600 via-amber-800 to-amber-900 border-l border-amber-400/20" />

              <Tabs 
                defaultValue="login"
                onValueChange={(val) => {
                  if (val === 'login') {
                    setIsCreationUnlocked(false);
                    setSignupAuthPassword('');
                  }
                }}
              >
                {/* Vintage Tabs Header (Registry Book Tabs) */}
                <CardHeader className="p-0 border-b-2 border-[#3d2719]">
                  <TabsList className="w-full bg-[#120b07] border-0 rounded-none h-14 p-0 gap-0">
                    <TabsTrigger 
                      value="login" 
                      className="flex-1 rounded-none h-full gap-2 text-amber-200/60 data-[state=active]:text-amber-100 data-[state=active]:bg-[#1e140d] data-[state=active]:border-b-2 data-[state=active]:border-amber-400 font-bold text-xs sm:text-sm transition-all focus-visible:ring-0"
                    >
                      <BookOpen className="w-4 h-4 text-amber-400" />
                      <span>تسجيل الدخول</span>
                      <span className="hidden sm:inline text-[10px] text-amber-400/60 font-normal">(بطاقة القارئ)</span>
                    </TabsTrigger>

                    <TabsTrigger 
                      value="signup" 
                      className="flex-1 rounded-none h-full gap-2 text-amber-200/60 data-[state=active]:text-amber-100 data-[state=active]:bg-[#1e140d] data-[state=active]:border-b-2 data-[state=active]:border-amber-400 font-bold text-xs sm:text-sm transition-all focus-visible:ring-0"
                    >
                      <Feather className="w-4 h-4 text-amber-400" />
                      <span>حساب جديد</span>
                      <span className="hidden sm:inline text-[10px] text-amber-400/60 font-normal">(إصدار بطاقة)</span>
                    </TabsTrigger>
                  </TabsList>
                </CardHeader>

                <CardContent className="p-5 sm:p-7 pr-6">
                  {/* --------------------------------------------------- */}
                  {/* Tab 1: Reader Login */}
                  {/* --------------------------------------------------- */}
                  <TabsContent value="login" className="mt-0 space-y-5 outline-none">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-black text-amber-100 flex items-center gap-2">
                          <Library className="w-4 h-4 text-amber-400" />
                          <span>أهلاً بك في قاعة المكتبة</span>
                        </h3>
                        <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-500/30">
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          متصل بالسيرفر
                        </span>
                      </div>
                      <p className="text-xs text-amber-200/70">
                        أدخل بيانات حسابك المكتبي للمتابعة والوصول للفهارس ونقاط البيع
                      </p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                      {/* Email Field */}
                      <div className="space-y-1.5">
                        <Label className="text-amber-300/80 text-xs font-semibold flex items-center justify-between">
                          <span>البريد الإلكتروني المكتبي</span>
                          <span className="text-[10px] text-amber-400/40 font-mono">LIBRARY ID</span>
                        </Label>
                        <div className="relative group">
                          <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500/60 group-focus-within:text-amber-400 transition-colors" />
                          <Input
                            type="email"
                            placeholder="librarian@mksystem.com"
                            value={loginEmail}
                            onChange={(e) => setLoginEmail(e.target.value)}
                            className="pr-11 h-11 bg-black/50 border border-amber-600/30 text-amber-100 placeholder:text-amber-200/25 focus-visible:ring-1 focus-visible:ring-amber-500/60 hover:border-amber-500/50 transition-all rounded-xl text-sm"
                            required
                            dir="ltr"
                          />
                        </div>
                      </div>

                      {/* Password Field */}
                      <div className="space-y-1.5">
                        <Label className="text-amber-300/80 text-xs font-semibold flex items-center justify-between">
                          <span>كلمة المرور السرية</span>
                          <span className="text-[10px] text-amber-400/40 font-mono">ACCESS KEY</span>
                        </Label>
                        <div className="relative group">
                          <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500/60 group-focus-within:text-amber-400 transition-colors" />
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            className="pr-11 pl-11 h-11 bg-black/50 border border-amber-600/30 text-amber-100 placeholder:text-amber-200/25 focus-visible:ring-1 focus-visible:ring-amber-500/60 hover:border-amber-500/50 transition-all rounded-xl text-sm"
                            required
                            dir="ltr"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-400/50 hover:text-amber-200 transition-colors p-1"
                            title={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Submit Button */}
                      <Button 
                        type="submit" 
                        className="w-full h-11 font-bold text-sm mt-2 bg-gradient-to-l from-[#b45309] to-[#d97706] hover:from-[#92400e] hover:to-[#b45309] text-amber-950 shadow-[0_6px_20px_rgba(217,119,6,0.25)] hover:shadow-[0_8px_25px_rgba(217,119,6,0.35)] transition-all rounded-xl border border-amber-400/40"
                        disabled={loading}
                      >
                        {loading ? 'جاري فتح السجل والتحقق...' : (
                          <span className="flex items-center justify-center gap-2">
                            <LogIn className="w-4 h-4 text-amber-950" />
                            <span>دخول إلى قاعة المكتبة</span>
                          </span>
                        )}
                      </Button>
                      
                      {/* Divider */}
                      <div className="relative my-4 flex items-center justify-center">
                        <div className="absolute inset-x-0 h-px bg-amber-800/30" />
                        <span className="relative bg-[#160e08] px-3 text-amber-300/50 text-[11px] font-bold tracking-wider rounded-full border border-amber-700/30">
                          أو بالبطاقة الرقمية
                        </span>
                      </div>
                      
                      {/* Google Sign-in */}
                      <Button 
                        type="button" 
                        variant="outline" 
                        className="w-full h-11 bg-black/30 border border-amber-600/30 hover:bg-amber-500/10 text-amber-200 transition-all rounded-xl font-bold gap-2 text-xs shadow-sm hover:border-amber-400/50" 
                        onClick={handleGoogleLogin} 
                        disabled={loading}
                      >
                        <svg className="h-4 w-4 text-current" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                          <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z" />
                        </svg>
                        <span>تسجيل الدخول السريع عبر Google</span>
                      </Button>
                    </form>
                  </TabsContent>

                  {/* --------------------------------------------------- */}
                  {/* Tab 2: New Account / Employee Card Enrollment */}
                  {/* --------------------------------------------------- */}
                  <TabsContent value="signup" className="mt-0 space-y-5 outline-none">
                    {!isCreationUnlocked ? (
                      <div className="space-y-5 py-2 text-center">
                        <div className="w-14 h-14 bg-red-950/40 rounded-2xl flex items-center justify-center mx-auto border-2 border-red-500/30 shadow-lg shadow-red-900/20">
                          <ShieldAlert className="w-7 h-7 text-red-400" />
                        </div>
                        <div className="space-y-1.5">
                          <h3 className="text-lg font-black text-amber-100">سجل الموظفين مقفل</h3>
                          <p className="text-xs text-amber-200/70 max-w-xs mx-auto leading-relaxed">
                            يتطلب إصدار بطاقة مستخدم جديدة إدخال رمز تصريح أمين المكتبة / مسؤول النظام.
                          </p>
                        </div>
                        
                        <div className="space-y-2 text-right">
                          <Label className="text-amber-300/80 text-xs font-semibold flex items-center justify-between">
                            <span>رمز تصريح المسؤول (Admin PIN)</span>
                            <span className="text-[10px] text-amber-400/40 font-mono">MASTER PIN</span>
                          </Label>
                          <div className="relative group">
                            <Lock className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500/60 group-focus-within:text-amber-400 transition-colors" />
                            <Input
                              type="password"
                              placeholder="أدخل رمز المسؤول واضغط Enter..."
                              value={signupAuthPassword}
                              onChange={(e) => setSignupAuthPassword(e.target.value)}
                              className="pr-11 h-11 bg-black/50 border border-amber-600/30 text-amber-100 placeholder:text-amber-200/25 focus-visible:ring-1 focus-visible:ring-amber-500/60 rounded-xl text-center tracking-widest text-base font-mono font-bold"
                              dir="ltr"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  if (signupAuthPassword === '112233445566') {
                                    setIsCreationUnlocked(true);
                                    setSignupAuthPassword('');
                                    toast.success('تم فك قفل سجل الموظفين بنجاح');
                                  } else {
                                    toast.error('رمز المسؤول غير صحيح (المطلوب: 112233445566)');
                                  }
                                }
                              }}
                            />
                          </div>
                        </div>

                        <Button 
                          type="button"
                          className="w-full h-11 font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 border border-amber-500/30 rounded-xl text-xs transition-all" 
                          onClick={() => {
                            if (signupAuthPassword === '112233445566') {
                              setIsCreationUnlocked(true);
                              setSignupAuthPassword('');
                              toast.success('تم فك قفل سجل الموظفين بنجاح');
                            } else {
                              toast.error('رمز المسؤول غير صحيح (المطلوب: 112233445566)');
                            }
                          }}
                        >
                          فك قفل السجل وبدء التسجيل
                        </Button>
                      </div>
                    ) : (
                      <motion.form 
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-4"
                        onSubmit={handleSignup}
                      >
                        <div className="space-y-1">
                          <h3 className="text-lg font-black text-amber-100 flex items-center gap-2">
                            <Feather className="w-4 h-4 text-amber-400" />
                            <span>إصدار بطاقة موظف جديد</span>
                          </h3>
                          <p className="text-xs text-amber-200/70">سجل بيانات الموظف الجديد للبدء بالعمل في المكتبة</p>
                        </div>

                        {/* Full Name */}
                        <div className="space-y-1.5">
                          <Label className="text-amber-300/80 text-xs font-semibold">اسم الموظف / القارئ الكامل</Label>
                          <div className="relative group">
                            <User className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500/60 group-focus-within:text-amber-400 transition-colors" />
                            <Input
                              placeholder="الاسم الثلاثي"
                              value={signupName}
                              onChange={(e) => setSignupName(e.target.value)}
                              className="pr-11 h-11 bg-black/50 border border-amber-600/30 text-amber-100 placeholder:text-amber-200/25 focus-visible:ring-1 focus-visible:ring-amber-500/60 rounded-xl text-sm"
                              required
                            />
                          </div>
                        </div>

                        {/* Email */}
                        <div className="space-y-1.5">
                          <Label className="text-amber-300/80 text-xs font-semibold">البريد الإلكتروني المكتبي</Label>
                          <div className="relative group">
                            <Mail className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500/60 group-focus-within:text-amber-400 transition-colors" />
                            <Input
                              type="email"
                              placeholder="employee@mksystem.com"
                              value={signupEmail}
                              onChange={(e) => setSignupEmail(e.target.value)}
                              className="pr-11 h-11 bg-black/50 border border-amber-600/30 text-amber-100 placeholder:text-amber-200/25 focus-visible:ring-1 focus-visible:ring-amber-500/60 rounded-xl text-sm"
                              required
                              dir="ltr"
                            />
                          </div>
                        </div>

                        {/* Password & Confirm */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-amber-300/80 text-xs font-semibold">كلمة المرور</Label>
                            <Input
                              type="password"
                              placeholder="6+ حروف"
                              value={signupPassword}
                              onChange={(e) => setSignupPassword(e.target.value)}
                              className="h-11 text-center bg-black/50 border border-amber-600/30 text-amber-100 placeholder:text-amber-200/25 focus-visible:ring-1 focus-visible:ring-amber-500/60 rounded-xl text-sm font-bold"
                              required
                              dir="ltr"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-amber-300/80 text-xs font-semibold">تأكيد المرور</Label>
                            <Input
                              type="password"
                              placeholder="تطابق"
                              value={signupConfirmPassword}
                              onChange={(e) => setSignupConfirmPassword(e.target.value)}
                              className="h-11 text-center bg-black/50 border border-amber-600/30 text-amber-100 placeholder:text-amber-200/25 focus-visible:ring-1 focus-visible:ring-amber-500/60 rounded-xl text-sm font-bold"
                              required
                              dir="ltr"
                            />
                          </div>
                        </div>

                        {/* Submit Signup */}
                        <Button 
                          type="submit" 
                          className="w-full h-11 font-bold text-sm mt-3 bg-gradient-to-l from-[#b45309] to-[#d97706] hover:from-[#92400e] hover:to-[#b45309] text-amber-950 shadow-[0_6px_20px_rgba(217,119,6,0.25)] transition-all rounded-xl border border-amber-400/40" 
                          disabled={loading}
                        >
                          {loading ? 'جاري إصدار البطاقة...' : 'إصدار بطاقة الموظف في السجلات'}
                        </Button>

                        {/* Divider */}
                        <div className="relative my-3 flex items-center justify-center">
                          <div className="absolute inset-x-0 h-px bg-amber-800/30" />
                          <span className="relative bg-[#160e08] px-3 text-amber-300/50 text-[11px] font-bold tracking-wider rounded-full border border-amber-700/30">
                            أو
                          </span>
                        </div>

                        {/* Google Signup */}
                        <Button 
                          type="button" 
                          variant="outline" 
                          className="w-full h-11 bg-black/30 border border-amber-600/30 hover:bg-amber-500/10 text-amber-200 transition-all rounded-xl font-bold gap-2 text-xs shadow-sm" 
                          onClick={handleGoogleSignup} 
                          disabled={loading}
                        >
                          <svg className="h-4 w-4 text-current" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                            <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z" />
                          </svg>
                          <span>إصدار سريع عبر Google</span>
                        </Button>
                      </motion.form>
                    )}
                  </TabsContent>
                </CardContent>
              </Tabs>
            </Card>
          </motion.div>

          {/* Bottom Security Footer */}
          <div className="text-center">
            <p className="text-[11px] text-amber-400/40 font-mono flex items-center justify-center gap-1.5">
              <span>نظام إدارة المكتبة الشامل</span>
              <span>•</span>
              <span>MK BOOKSTORE & LIBRARY SYSTEM © {new Date().getFullYear()}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
