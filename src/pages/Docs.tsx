import { useState } from 'react';
import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Search, BookOpen, MonitorPlay, Users, Package, Settings, CalendarClock, TrendingUp, HelpCircle, Library } from 'lucide-react';
import { motion } from 'framer-motion';

const docsData = [
  {
    id: 'getting-started',
    title: 'البداية السريعة',
    icon: <MonitorPlay className="w-5 h-5 text-primary" />,
    items: [
      { q: 'كيف أبدأ باستخدام نظام المكتبة؟', a: 'للبدء، قم بالذهاب إلى صفحة "الإعدادات" وأدخل بيانات المكتبة والفرع والرقم الضريبي، ثم انتقل إلى "إدارة الكتب والمخزون" لإضافة التصنيفات وفهارس الكتب والأسعار.' },
      { q: 'ما هي لوحة التحكم؟', a: 'لوحة التحكم هي الواجهة الرئيسية التي تلخص نشاط مكتبتك لحظة بلحظة، وتعرض إجمالي الإيرادات، فواتير البيع اليومية، والكتب الأكثر طلباً، وتنبيهات نواقص المخزون.' }
    ]
  },
  {
    id: 'pos',
    title: 'نقطة البيع والكاشير',
    icon: <MonitorPlay className="w-5 h-5 text-success" />,
    items: [
      { q: 'كيف أقوم بإنشاء فاتورة بيع جديدة؟', a: 'من صفحة "نقطة البيع"، ابحث عن الكتاب بالاسم أو عبر مسح الباركود، حدد الكمية، اختر طريقة الدفع (نقدي، بطاقة، أو آجل)، ثم اضغط "إتمام البيع" لطباعة الفاتورة.' },
      { q: 'كيف يمكنني تطبيق خصم على فاتورة كتب؟', a: 'في شاشة البيع، يمكنك إدخال نسبة مئوية للخصم أو خصم مبلغ محدد، أو تطبيق العروض الترويجية المفعلة للمشتركين والطلاب.' },
      { q: 'ماذا أفعل في نهاية الوردية؟', a: 'انتقل إلى "إدارة الورديات" واضغط على "إغلاق الوردية". يقوم النظام بجرد المبيعات النقدية والإلكترونية ومطابقة رصيد الدرج تلقائياً.' }
    ]
  },
  {
    id: 'catalog',
    title: 'فهرس الكتب والتصنيفات',
    icon: <Library className="w-5 h-5 text-amber-500" />,
    items: [
      { q: 'كيف أضيف كتاباً أو منتجاً جديداً؟', a: 'من صفحة "الكتب والمنتجات"، انقر على "إضافة كتاب جديد"، أدخل العنوان، اسم المؤلف، دار النشر، الباركود الدولي ISBN، وسعر البيع والتكلفة والكمية المتوفرة.' },
      { q: 'هل يمكنني إخفاء كتاب نفدت كميته؟', a: 'نعم، يمكنك تعديل حالة الكتاب إلى "غير متوفر" أو الاعتماد على التنبيه التلقائي عند وصول الرصيد إلى الصفر.' }
    ]
  },
  {
    id: 'inventory',
    title: 'المخزون وأوامر التوريد',
    icon: <Package className="w-5 h-5 text-blue-500" />,
    items: [
      { q: 'كيف أتابع نواقص الكتب والمستلزمات؟', a: 'صفحة "المخزون" تعرض لك جميع العناوين والأصناف. الكتب التي تقل عن حد الطلب الأدنى يتم تمييزها باللون الأحمر مع تنبيه فوري في لوحة التحكم.' },
      { q: 'كيف أسجل فاتورة توريد من دار نشر؟', a: 'من قائمة "المشتريات والتوريدات"، اضغط على "أمر شراء جديد"، حدد دار النشر أو المورد، وأضف الكتب والكميات وأسعار الشراء ليتم تزويد رصيد المستودع فوراً.' },
      { q: 'ما هي إدارة التوالف والمرتجعات؟', a: 'تتيح لك تسجيل أي نسخ تالفة أو مسترجعة للناشر لخصمها بدقة من رصيد المستودع دون التأثير على إحصائيات البيع الفعلي.' }
    ]
  },
  {
    id: 'borrowing',
    title: 'الاستعارات وقاعات القراءة',
    icon: <CalendarClock className="w-5 h-5 text-purple-500" />,
    items: [
      { q: 'كيف أسجل استعارة كتاب لأحد الأعضاء؟', a: 'من صفحة "الاستعارات والحجوزات"، اختر العضو أو المشترك، وحدد الكتاب المراد استعارته وتاريخ الإرجاع المتوقع، وسيقوم النظام بتتبع موعد الاستحقاق تلقائياً.' },
      { q: 'كيف أدير حجوزات مقاعد وقاعات القراءة؟', a: 'يمكنك تخصيص مقاعد أو طاولات مخصصة للدراسة والاطلاع، وحجزها لأوقات محددة برقم العضو أو الزائر.' }
    ]
  },
  {
    id: 'hr',
    title: 'الموظفون وفريق العمل',
    icon: <Users className="w-5 h-5 text-rose-500" />,
    items: [
      { q: 'كيف أضيف أمين مكتبة أو كاشير جديد؟', a: 'من صفحة "الموارد البشرية"، اضغط على "إضافة موظف"، وسجل بياناته والوظيفة ورمز الـ PIN المخصص لتسجيل الحضور.' },
      { q: 'كيف أتحكم في صلاحيات الموظفين؟', a: 'من صفحة "الأدوار والصلاحيات"، يمكنك تعيين أدوار مخصصة (مثل: مدير فرع، أمين مكتبة، كاشير)، وتحديد الشاشات المسموح بالوصول إليها.' }
    ]
  },
  {
    id: 'reports',
    title: 'التقارير والمؤشرات المالية',
    icon: <TrendingUp className="w-5 h-5 text-emerald-500" />,
    items: [
      { q: 'كيف أعرف صافي أرباح مبيعات الكتب؟', a: 'توفر صفحة "التقارير المالية" تحليلاً دقيقاً لحركة المبيعات الإجمالية، وتخصم منها تكلفة الكتب المباعة والمصروفات التشغيلية لحساب صافي الربح الحقيقي.' },
      { q: 'هل يمكن تصدير تقارير المبيعات إلى Excel؟', a: 'نعم، تحتوي صفحات المبيعات والمصروفات على زر "تصدير CSV" لتنزيل الجداول بصيغة إكسل ومشاركتها مع الإدارة المالية.' }
    ]
  },
  {
    id: 'settings',
    title: 'إعدادات النظام والطباعة',
    icon: <Settings className="w-5 h-5 text-gray-500" />,
    items: [
      { q: 'كيف أخصص الفاتورة المطبوعة وشعار المكتبة؟', a: 'من صفحة الإعدادات، يمكنك كتابة اسم المكتبة بالعربية والإنجليزية، والرقم الضريبي، ورسالة الشكر والترحيب أسفل الفاتورة.' },
      { q: 'هل يمكن استخدام النظام على الأجهزة اللوحية والهواتف؟', a: 'نعم، النظام متوافق تماماً ومزود بشريط تنقل سفلي سريع مخصص للهواتف المحمولة يسهل الوصول لجميع مهام المكتبة.' }
    ]
  }
];

export default function Docs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  // Filter content based on search and category
  const filteredDocs = docsData.map(category => {
    if (activeCategory !== 'all' && activeCategory !== category.id) return { ...category, items: [] };
    
    const filteredItems = category.items.filter(item => 
      item.q.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.a.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    return { ...category, items: filteredItems };
  }).filter(category => category.items.length > 0);

  return (
    <MainLayout title="دليل النظام المركز" subtitle="وثائق المساعدة الشاملة لإدارة المكتبة والمستودع">
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
