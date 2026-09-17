import { useState } from 'react';
import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Search, BookOpen, MonitorPlay, Users, Package, Settings, UtensilsCrossed, CalendarClock, TrendingUp, HelpCircle } from 'lucide-react';
import { motion } from 'framer-motion';

const docsData = [
  {
    id: 'getting-started',
    title: 'البداية السريعة',
    icon: <MonitorPlay className="w-5 h-5 text-primary" />,
    items: [
      { q: 'كيف أبدأ باستخدام النظام؟', a: 'للبدء، قم بالذهاب إلى صفحة "الإعدادات" وأضف معلومات مطعمك الأساسية، ثم انتقل إلى "إدارة القائمة" لإضافة الأقسام والأصناف.' },
      { q: 'ما هي لوحة التحكم؟', a: 'لوحة التحكم هي الواجهة الرئيسية التي تلخص أداء مطعمك، وتعرض إحصائيات المبيعات، الطلبات الحالية، وأهم التنبيهات.' }
    ]
  },
  {
    id: 'pos',
    title: 'نقاط البيع (الكاشير)',
    icon: <MonitorPlay className="w-5 h-5 text-success" />,
    items: [
      { q: 'كيف أقوم بإنشاء طلب جديد؟', a: 'من صفحة "الكاشير"، اختر نوع الطلب (داخلي، تيك أوي، دليفري)، ثم قم بالنقر على الأصناف من القائمة الجانبية لإضافتها إلى الفاتورة، وأخيراً اضغط على "دفع".' },
      { q: 'كيف يمكنني تطبيق خصم على فاتورة؟', a: 'في شاشة الكاشير، يمكنك إما تطبيق نسبة خصم مئوية، أو خصم مبلغ ثابت، أو اختيار أحد العروض الترويجية المفعلة مسبقاً.' },
      { q: 'ماذا أفعل في نهاية الوردية؟', a: 'يجب عليك الذهاب إلى "إدارة الورديات" والنقر على "إغلاق الوردية". سيقوم النظام بحساب إجمالي المبيعات، المرتجعات، والمصروفات لمطابقتها مع الدرج.' }
    ]
  },
  {
    id: 'menu',
    title: 'القائمة والأصناف',
    icon: <UtensilsCrossed className="w-5 h-5 text-warning" />,
    items: [
      { q: 'كيف أضيف صنف جديد؟', a: 'من "إدارة القائمة"، انقر على "إضافة صنف"، أدخل الاسم، السعر، القسم، واربط الصنف بالمواد الخام من المخزون لحساب التكلفة تلقائياً.' },
      { q: 'هل يمكنني إخفاء صنف نفد من المخزون؟', a: 'نعم، يمكنك تغيير حالة الصنف إلى "غير متاح" ولن يظهر في شاشة الكاشير أو شاشة المطبخ.' }
    ]
  },
  {
    id: 'inventory',
    title: 'المخزون والمشتريات',
    icon: <Package className="w-5 h-5 text-info" />,
    items: [
      { q: 'كيف أتابع نقص المخزون؟', a: 'صفحة "المخزون" تعرض لك جميع المواد الخام. المواد التي تقترب من الحد الأدنى سيتم تمييزها بلون مختلف وإظهار تنبيه في الداشبورد.' },
      { q: 'كيف أسجل فاتورة مشتريات؟', a: 'من قائمة "المشتريات"، انقر على "أمر شراء جديد"، اختر المورد، وأضف المواد الخام والكميات والأسعار. ستتم إضافة هذه الكميات تلقائياً إلى المخزون.' },
      { q: 'ما هي إدارة الهالك؟', a: 'هي صفحة لتسجيل أي مواد خام أو أصناف تالفة لخصمها من المخزون بشكل صحيح دون التأثير على حسابات المبيعات.' }
    ]
  },
  {
    id: 'hr',
    title: 'الموظفين والصلاحيات',
    icon: <Users className="w-5 h-5 text-destructive" />,
    items: [
      { q: 'كيف أضيف موظف جديد؟', a: 'من صفحة "الموارد البشرية"، انقر على "إضافة موظف"، أدخل بياناته وحدد راتبه ودوره الوظيفي.' },
      { q: 'كيف أتحكم في صلاحيات الموظفين؟', a: 'من صفحة "الصلاحيات المتطورة"، يمكنك إنشاء "أدوار وظيفية" مخصصة بأسماء واضحة (مثل: كاشير، مدير مبنى)، وتفعيل الصلاحيات الدقيقة لكل دور، ثم إسناد هذا الدور للموظف.' }
    ]
  },
  {
    id: 'tables',
    title: 'الطاولات والحجوزات',
    icon: <CalendarClock className="w-5 h-5 text-purple-500" />,
    items: [
      { q: 'كيف أصمم مخطط الطاولات؟', a: 'من صفحة "الطاولات والحجوزات"، يمكنك إضافة طاولات لأجنحة مختلفة (مثل التراس، القاعة الرئيسية)، وتحديد عدد مقاعد كل طاولة لتسهيل رؤيتها للكاشير والويتر.' },
      { q: 'كيف أدير حجوزات المطعم؟', a: 'يمكنك تسجيل حجوزات مسبقة للعملاء، موضحاً بها وقت الحجز، عدد الأشخاص، وأي ملاحظات. ويمكنك تغيير حالة الحجز من "في الانتظار" إلى "مؤكد" أو "منتهي".' }
    ]
  },
  {
    id: 'reports',
    title: 'التقارير والمبيعات',
    icon: <TrendingUp className="w-5 h-5 text-emerald-500" />,
    items: [
      { q: 'كيف أعرف أرباحي الصافية؟', a: 'توفر صفحة "التقارير" رسوماً بيانية تحليلية للمبيعات، وتخصم منها المصروفات وتكلفة البضاعة المباعة (المرتبطة بالمخزون) لتعطيك صافي الربح الحقيقي.' },
      { q: 'هل يمكنني تصدير التقارير لإرسالها للمحاسب؟', a: 'نعم، في أعلى صفحة التقارير، وكذلك في صفحة المصروفات، يوجد زر "تصدير CSV" لتحميل البيانات في ملف إكسل.' }
    ]
  },
  {
    id: 'settings',
    title: 'إعدادات النظام',
    icon: <Settings className="w-5 h-5 text-gray-500" />,
    items: [
      { q: 'كيف أعدل بيانات الفاتورة المطبوعة؟', a: 'اذهب إلى الإعدادات > إعدادات النظام، وهناك ستتمكن من تعديل رسالة الترحيب التي تظهر أسفل الفاتورة، ورقم التليفون، واسم الفرع والضريبة المطبقة.' },
      { q: 'هل يمكنني التبديل للوضع الفاتح؟', a: 'نعم، النظام يدعم الوضعين المظلم (الافتراضي) والفاتح، يمكنك التبديل بينهما من قائمة المستخدم في الشريط العلوي.' }
    ]
  }
];

export default function Docs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  // Filter content based on search and category
  const filteredDocs = docsData.map(category => {
    // If not matching category, return empty
    if (activeCategory !== 'all' && activeCategory !== category.id) return { ...category, items: [] };
    
    // Filter items by search query
    const filteredItems = category.items.filter(item => 
      item.q.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.a.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    return { ...category, items: filteredItems };
  }).filter(category => category.items.length > 0);

  return (
    <MainLayout title="دليل النظام المركز" subtitle="وثائق المساعدة الشاملة لإدارة المطعم">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Sidebar / Filters */}
        <div className="md:col-span-1 space-y-6">
          <Card className="sticky top-6">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg flex items-center gap-2">
                <Search className="w-4 h-4 text-muted-foreground" />
                البحث في الدليل
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <Input
                placeholder="ابحث عن سؤال أو معلومة..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-background"
              />
              <div className="space-y-1">
                <Button 
                  variant={activeCategory === 'all' ? 'default' : 'ghost'} 
                  className="w-full justify-start text-sm"
                  onClick={() => setActiveCategory('all')}
                >
                  <BookOpen className="w-4 h-4 ml-2" /> جميع الأقسام
                </Button>
                {docsData.map(cat => (
                  <Button 
                    key={cat.id}
                    variant={activeCategory === cat.id ? 'default' : 'ghost'} 
                    className="w-full justify-start text-sm"
                    onClick={() => setActiveCategory(cat.id)}
                  >
                    <span className="ml-2">{cat.icon}</span> {cat.title}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="p-4 flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full">
                <HelpCircle className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h4 className="font-bold text-base mb-1">تحتاج مساعدة إضافية؟</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">إذا لم تجد إجابتك هنا، يمكنك التواصل مع فريق الدعم الفني الخاص بالشركة المبرمجة لتقديم المساعدة الفورية.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Content Area */}
        <div className="md:col-span-3">
          {filteredDocs.length === 0 ? (
            <Card className="border-dashed h-64 flex flex-col items-center justify-center text-muted-foreground bg-card/40">
              <Search className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-xl font-bold">لا توجد نتائج</p>
              <p className="text-sm mt-2">حاول البحث بكلمات مختلفة أو تصفح الأقسام من القائمة الجانبية.</p>
              <Button variant="outline" className="mt-4" onClick={() => { setSearchQuery(''); setActiveCategory('all'); }}>عرض كل الأقسام</Button>
            </Card>
          ) : (
            <ScrollArea className="h-[calc(100vh-140px)] pr-4 pb-12">
              <div className="space-y-8 pb-10">
                {filteredDocs.map((category, index) => (
                  <motion.div 
                    key={category.id} 
                    initial={{ opacity: 0, y: 10 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    transition={{ delay: index * 0.1 }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2.5 bg-background rounded-full border shadow-sm">
                        {category.icon}
                      </div>
                      <h2 className="text-2xl font-black">{category.title}</h2>
                      <Badge variant="secondary" className="mr-auto">{category.items.length} أسئلة</Badge>
                    </div>
                    
                    <Card className="overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      <Accordion type="single" collapsible className="w-full mb-0">
                        {category.items.map((item, i) => (
                          <AccordionItem key={i} value={`item-${category.id}-${i}`} className={i === category.items.length - 1 ? 'border-b-0' : ''}>
                            <AccordionTrigger className="px-5 py-4 hover:bg-muted/50 transition-colors text-right text-base font-bold text-foreground/90">
                              {item.q}
                            </AccordionTrigger>
                            <AccordionContent className="px-5 pb-5 pt-2 text-muted-foreground leading-relaxed text-sm md:text-base border-t bg-muted/10">
                              <p>{item.a}</p>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
