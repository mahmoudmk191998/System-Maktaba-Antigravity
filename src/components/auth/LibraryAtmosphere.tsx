import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Sparkles, Lamp, Glasses, Bookmark, Award, ShieldCheck, Feather, Compass } from 'lucide-react';

const LIBRARY_QUOTES = [
  { text: "أعز مكان في الدنى سرج سابح، وخير جليس في الزمان كتابُ", author: "أبو الطيب المتنبي" },
  { text: "المكتبة ليست مجرد مكان لحفظ الكتب، بل هي ملاذ الفكر ومصنع الحضارة", author: "حكمة مكتبية" },
  { text: "القراءة تمنحك ألف حياة لتعيشها، ومن لا يقرأ يعيش حياة واحدة فقط", author: "جورج ر. ر. مارتن" },
  { text: "تنظيم المعرفة وتيسير العلم هو أرقى فنون الإدارة والريادة", author: "سجل حكماء المكتبة" },
];

interface BookSpine {
  title: string;
  category: string;
  color: string;
  goldTrim?: boolean;
  height: number; // 70 to 100%
  width: number; // 24 to 38px
  ribbon?: boolean;
}

const SHELF_BOOKS: BookSpine[] = [
  { title: "سجل اليومية المالي", category: "محاسبة", color: "from-[#881337] to-[#4c0519]", goldTrim: true, height: 96, width: 34, ribbon: true },
  { title: "فهرس المراجع", category: "أدلة", color: "from-[#1e3a8a] to-[#172554]", goldTrim: true, height: 88, width: 28 },
  { title: "أصول المحاسبة والتجارة", category: "تجارة", color: "from-[#065f46] to-[#022c22]", goldTrim: true, height: 92, width: 32 },
  { title: "ديوان الحكمة", category: "أدب", color: "from-[#78350f] to-[#451a03]", goldTrim: false, height: 82, width: 26 },
  { title: "موسوعة المعرفة", category: "موسوعات", color: "from-[#312e81] to-[#1e1b4b]", goldTrim: true, height: 100, width: 38, ribbon: true },
  { title: "دليل إدارة المخازن", category: "إدارة", color: "from-[#14532d] to-[#052e16]", goldTrim: true, height: 86, width: 30 },
  { title: "قوانين التوثيق", category: "قانون", color: "from-[#701a75] to-[#4a044e]", goldTrim: true, height: 94, width: 32 },
  { title: "دفتر الأستاذ العام", category: "مالية", color: "from-[#831843] to-[#500724]", goldTrim: true, height: 90, width: 34 },
  { title: "تاريخ الطباعة والورق", category: "وثائقي", color: "from-[#92400e] to-[#713f12]", goldTrim: false, height: 84, width: 26 },
  { title: "أطلس المبيعات والفروع", category: "إحصاء", color: "from-[#1e293b] to-[#0f172a]", goldTrim: true, height: 98, width: 36, ribbon: true },
  { title: "فنون الخط والقرطاسية", category: "فنون", color: "from-[#047857] to-[#064e3b]", goldTrim: true, height: 80, width: 28 },
];

export function LibraryAtmosphere() {
  const [lampOn, setLampOn] = useState(true);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [selectedBook, setSelectedBook] = useState<BookSpine | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % LIBRARY_QUOTES.length);
    }, 7000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative w-full h-full flex flex-col justify-between select-none overflow-hidden font-cairo">
      {/* Background Library Texture (Wooden Panel & Ambient Light) */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#140e0a] via-[#1a130d] to-[#0f0a07] pointer-events-none" />
      
      {/* Wood grain pattern overlay */}
      <div 
        className="absolute inset-0 opacity-[0.07] pointer-events-none" 
        style={{
          backgroundImage: `radial-gradient(#d97706 1px, transparent 1px), radial-gradient(#92400e 1px, #140e0a 1px)`,
          backgroundSize: '40px 40px',
          backgroundPosition: '0 0, 20px 20px'
        }}
      />

      {/* Warm Banker's Lamp Light Cone */}
      <AnimatePresence>
        {lampOn && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute top-12 left-1/4 -translate-x-1/2 w-[550px] h-[550px] pointer-events-none"
          >
            {/* Emerald lamp glow */}
            <div className="absolute top-8 left-1/2 -translate-x-1/2 w-48 h-32 bg-emerald-500/25 rounded-full blur-[70px]" />
            {/* Warm incandescent amber spotlight onto the desk */}
            <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[420px] h-[480px] bg-gradient-to-b from-amber-400/20 via-amber-500/10 to-transparent rounded-full blur-[90px]" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating dust motes / light particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(14)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-amber-200/40"
            style={{
              width: (i % 3) + 2,
              height: (i % 3) + 2,
              top: `${(i * 7) % 95}%`,
              left: `${(i * 13) % 90}%`,
              filter: 'blur(0.6px)',
            }}
            animate={{
              y: [-15, 15, -15],
              x: [-10, 10, -10],
              opacity: [0.2, 0.7, 0.2],
            }}
            transition={{
              duration: 5 + (i % 5),
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.4,
            }}
          />
        ))}
      </div>

      {/* Top Header: Library Brand & Classical Arch Banner */}
      <div className="relative z-10 pt-2">
        <div className="flex items-center justify-between border-b border-amber-900/40 pb-4">
          <div className="flex items-center gap-3">
            {/* Antique brass crest */}
            <div className="relative w-12 h-12 rounded-xl bg-gradient-to-b from-[#3a2618] to-[#1c130c] border border-amber-500/40 shadow-[0_4px_16px_rgba(0,0,0,0.6),inset_0_1px_2px_rgba(251,191,36,0.3)] flex items-center justify-center p-2 group">
              <BookOpen className="w-6 h-6 text-amber-400 group-hover:scale-110 transition-transform" />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-600 border border-amber-300/40 flex items-center justify-center">
                <Sparkles className="w-2.5 h-2.5 text-amber-200" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-xl tracking-tight text-amber-100">
                  مكتبة إم كـي المركزية
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold">
                  تأسست 2026
                </span>
              </div>
              <p className="text-xs text-amber-200/60 font-medium">
                بوابة السجلات والمخطوطات الرقمية ونظام إدارة الفروع
              </p>
            </div>
          </div>

          {/* Interactive Classic Banker's Lamp Control */}
          <button
            type="button"
            onClick={() => setLampOn(!lampOn)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#231810]/80 border border-amber-500/30 hover:border-amber-400/60 transition-all text-xs font-bold text-amber-200 shadow-md group"
            title="انقر لتشغيل/إطفاء أباجورة المكتبة"
          >
            <div className={`w-3 h-3 rounded-full transition-colors ${lampOn ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-stone-600'}`} />
            <Lamp className={`w-4 h-4 transition-transform group-hover:rotate-12 ${lampOn ? 'text-emerald-400' : 'text-stone-400'}`} />
            <span className="hidden xl:inline">{lampOn ? 'مصباح المطالعة مضاء' : 'إضاءة المصباح'}</span>
          </button>
        </div>
      </div>

      {/* Middle: Grand Realistic Bookshelf Section */}
      <div className="relative z-10 my-auto py-6 space-y-6">
        {/* Classical Library Shelf Frame (Carved Dark Wood & Brass Rails) */}
        <div className="relative rounded-2xl bg-gradient-to-b from-[#241710] to-[#180f0a] border-2 border-[#452d1d] shadow-[0_20px_40px_rgba(0,0,0,0.8),inset_0_2px_4px_rgba(251,191,36,0.15)] p-4 sm:p-6 overflow-hidden">
          {/* Decorative brass arch top */}
          <div className="flex items-center justify-between border-b border-amber-800/40 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_6px_#f59e0b]" />
              <span className="text-xs font-bold tracking-wider text-amber-300/80 uppercase">
                خزانة المجلدات الرئيسية • الرف الأول
              </span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-amber-400/60 font-mono">
              <span className="flex items-center gap-1">
                <Glasses className="w-3.5 h-3.5" />
                فهرسة فورية
              </span>
              <span>•</span>
              <span>100% سحابي</span>
            </div>
          </div>

          {/* Realistic Bookshelf Row */}
          <div className="relative pb-4 pt-2">
            {/* Upper shadow underneath top panel */}
            <div className="absolute top-0 inset-x-0 h-6 bg-gradient-to-b from-black/60 to-transparent pointer-events-none z-10" />

            {/* Books Collection aligned vertically on the shelf */}
            <div className="flex items-end justify-start gap-1 sm:gap-1.5 h-44 sm:h-52 px-2 overflow-x-auto no-scrollbar relative z-0">
              {SHELF_BOOKS.map((book, idx) => {
                const isSelected = selectedBook?.title === book.title;
                return (
                  <motion.div
                    key={idx}
                    whileHover={{ y: -12, scale: 1.04 }}
                    onClick={() => setSelectedBook(isSelected ? null : book)}
                    style={{
                      height: `${book.height}%`,
                      width: `${book.width}px`,
                      minWidth: `${book.width}px`,
                    }}
                    className={`relative rounded-t-sm cursor-pointer transition-all duration-200 shadow-[2px_4px_8px_rgba(0,0,0,0.6)] flex flex-col justify-between items-center py-2 px-0.5 border-t border-l border-r border-white/10 ${
                      isSelected ? 'ring-2 ring-amber-400 -translate-y-4 z-20' : ''
                    } bg-gradient-to-r ${book.color}`}
                  >
                    {/* Leather spine ribs (حلقات تجليد الكتب الفاخرة) */}
                    <div className="w-full h-1 bg-amber-300/30 shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
                    
                    {/* Book Title (Vertical Arabic text) */}
                    <div className="writing-mode-vertical text-[10px] sm:text-[11px] font-bold text-amber-100/90 tracking-wider truncate max-h-32 select-none" style={{ writingMode: 'vertical-rl' }}>
                      {book.title}
                    </div>

                    {/* Gold filigree trim / Category initials */}
                    <div className="flex flex-col items-center gap-1">
                      {book.ribbon && (
                        <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-1.5 h-3 bg-red-600 rounded-b-sm shadow-sm" />
                      )}
                      {book.goldTrim && (
                        <div className="w-3.5 h-3.5 rounded-full border border-amber-400/50 flex items-center justify-center">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400/70" />
                        </div>
                      )}
                      <div className="w-full h-1 bg-amber-300/30 shadow-[0_1px_2px_rgba(0,0,0,0.5)]" />
                    </div>
                  </motion.div>
                );
              })}

              {/* Bookend: Antique Brass Globe & Bookstand */}
              <div className="mr-auto pl-2 flex flex-col items-center justify-end h-full">
                <div className="w-10 h-16 sm:w-12 sm:h-20 rounded-t-xl bg-gradient-to-b from-amber-600/30 to-amber-900/40 border border-amber-500/30 flex flex-col items-center justify-center text-amber-300/70 shadow-inner">
                  <Compass className="w-5 h-5 mb-1 animate-spin-slow" />
                  <span className="text-[9px] font-bold uppercase tracking-tighter">إسناد</span>
                </div>
              </div>
            </div>

            {/* Solid Mahogany Wooden Shelf Plank with brass nameplate */}
            <div className="relative w-full h-5 sm:h-6 bg-gradient-to-r from-[#3e2719] via-[#5c3a21] to-[#3e2719] rounded-b-md border-t-2 border-amber-400/30 shadow-[0_8px_16px_rgba(0,0,0,0.7)] flex items-center justify-center">
              {/* Brass plate */}
              <div className="px-4 py-0.5 rounded bg-gradient-to-b from-[#d97706] to-[#92400e] border border-amber-300/60 shadow-sm flex items-center gap-1.5 text-[9px] font-black text-amber-950">
                <Bookmark className="w-2.5 h-2.5 text-amber-950" />
                <span>جناح المبيعات والفهارس الرقمية</span>
              </div>
            </div>
          </div>

          {/* Book Details Popup if clicked */}
          <AnimatePresence>
            {selectedBook && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="mt-3 p-3 rounded-xl bg-black/50 border border-amber-500/40 backdrop-blur-md flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-amber-500/20 text-amber-300">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-bold text-amber-100">{selectedBook.title}</span>
                    <span className="text-amber-400/70 mr-2 text-[10px]">({selectedBook.category})</span>
                    <p className="text-[10px] text-amber-200/60">مجلد مفهرس ومحفوظ في قاعدة البيانات السحابية</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedBook(null)}
                  className="text-amber-400 hover:text-amber-200 text-xs font-bold px-2 py-1"
                >
                  إغلاق
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Vintage Card Catalog Drawers (أدراج الفهرس الكلاسيكية للمكتبة) */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-b from-[#221710] to-[#180f0a] border border-amber-600/30 shadow-md flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Award className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <p className="text-[10px] text-amber-300/70 font-semibold">حالة الأرشيف</p>
              <p className="text-xs font-black text-amber-100 truncate">سجلات مؤمنة</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-gradient-to-b from-[#221710] to-[#180f0a] border border-amber-600/30 shadow-md flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldCheck className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <p className="text-[10px] text-amber-300/70 font-semibold">بوابة الحماية</p>
              <p className="text-xs font-black text-amber-100 truncate">تشفير Firebase</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-gradient-to-b from-[#221710] to-[#180f0a] border border-amber-600/30 shadow-md flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Feather className="w-3.5 h-3.5" />
            </div>
            <div className="truncate">
              <p className="text-[10px] text-amber-300/70 font-semibold">المزامنة الفورية</p>
              <p className="text-xs font-black text-amber-100 truncate">نقاط البيع والمستودع</p>
            </div>
          </div>
        </div>

        {/* Dynamic Literary & Business Quote Ticker */}
        <div className="relative p-4 rounded-xl bg-[#1d130c]/70 border border-amber-700/30 backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-md bg-amber-500/20 text-amber-300 shrink-0 mt-0.5">
              <Feather className="w-4 h-4" />
            </div>
            <div className="overflow-hidden min-h-[38px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={quoteIndex}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.4 }}
                >
                  <p className="text-xs sm:text-sm text-amber-100/90 font-medium italic leading-relaxed">
                    "{LIBRARY_QUOTES[quoteIndex].text}"
                  </p>
                  <p className="text-[10px] text-amber-400 font-bold mt-1">
                    — {LIBRARY_QUOTES[quoteIndex].author}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Vintage Stamp */}
      <div className="relative z-10 pt-4 border-t border-amber-900/30 flex items-center justify-between text-[11px] text-amber-400/50">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>سجل المكتبة متصل وجاهز للخدمة</span>
        </div>
        <div className="font-mono text-[10px] text-amber-400/40">
          MK-LIB-SEC-2026
        </div>
      </div>
    </div>
  );
}
