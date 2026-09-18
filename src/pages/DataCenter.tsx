import React, { useState } from 'react';
import { MainLayout } from '@/components/layout';
import { useTenantBranch } from '@/hooks/useDatabase';
import { useAuth } from '@/hooks/useAuth';
import { useFormatters } from '@/lib/formatters';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  FileText,
  RefreshCw,
  Eye,
  ArrowUpDown,
  DollarSign,
  Package,
  Users,
  Truck,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

import {
  parseCsvText,
  validateProductImport,
  commitProductImport,
  commitCustomerImport,
  commitSupplierImport,
  ProductImportRow,
  ImportValidationResult,
} from '@/services/dataCenter/importExport.service';

export default function DataCenter() {
  const { tenantId, branchId } = useTenantBranch();
  const { user } = useAuth();
  const { currency, number } = useFormatters();

  const [activeTab, setActiveTab] = useState<string>('products_import');

  // Product Import State
  const [productCsvText, setProductCsvText] = useState<string>('');
  const [validationResult, setValidationResult] = useState<ImportValidationResult<ProductImportRow> | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);

  // Parse and Validate Products CSV
  const handleValidateProducts = async () => {
    if (!tenantId || !productCsvText.trim()) return;
    setIsValidating(true);
    try {
      const rawRows = parseCsvText(productCsvText);
      if (rawRows.length === 0) {
        toast.error('الملف فارغ أو لا يحتوي على صفوف بيانات صالحة');
        return;
      }
      const res = await validateProductImport(tenantId, rawRows);
      setValidationResult(res);
      if (res.isValid) {
        toast.success(`تم فحص البيانات بنجاح: ${res.validRows.length} صنف جاهز للاستيراد`);
      } else {
        toast.warning(`تم العثور على ملاحظات أو أخطاء: ${res.invalidRows.length} صف به أخطاء، و ${res.duplicateSkus.length} SKU مكرر`);
      }
    } catch (err: any) {
      toast.error(err.message || 'فشل فحص الملف');
    } finally {
      setIsValidating(false);
    }
  };

  // Commit Products
  const handleCommitProducts = async () => {
    if (!tenantId || !branchId || !validationResult || !user) return;
    if (validationResult.validRows.length === 0) {
      toast.error('لا توجد صفوف صالحة للاستيراد');
      return;
    }
    setIsCommitting(true);
    try {
      const res = await commitProductImport(
        tenantId,
        branchId,
        validationResult.validRows,
        user.uid
      );
      toast.success(
        `تم استيراد ${res.importedCount} منتج بنجاح، وتسجيل ${res.stockMovementsCreated} حركة رصيد افتتاحي في دفتر المخزون`
      );
      setValidationResult(null);
      setProductCsvText('');
    } catch (err: any) {
      toast.error(err.message || 'فشل استيراد المنتجات');
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 pb-12" dir="rtl">
        {/* Header */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl">
              <FileSpreadsheet className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-foreground">مركز إدارة واستيراد البيانات (Data Center)</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                استيراد وتحديث المنتجات والعملاء والمخزون مع فحص التكرارات وضمان سلامة قيود دفاتر الأستاذ
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="bg-card p-1.5 border border-border rounded-xl shadow-sm">
            <TabsList className="bg-transparent flex flex-wrap gap-1">
              <TabsTrigger
                value="products_import"
                className="text-xs font-semibold py-2 px-3 gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
              >
                <Upload className="w-3.5 h-3.5" />
                استيراد الأصناف والكتب
              </TabsTrigger>
              <TabsTrigger
                value="partners_import"
                className="text-xs font-semibold py-2 px-3 gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
              >
                <Users className="w-3.5 h-3.5" />
                استيراد العملاء والموردين
              </TabsTrigger>
              <TabsTrigger
                value="export_center"
                className="text-xs font-semibold py-2 px-3 gap-1.5 data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
              >
                <Download className="w-3.5 h-3.5" />
                مركز التصدير الموحد
              </TabsTrigger>
            </TabsList>
          </div>

          {/* TAB 1: PRODUCT IMPORT */}
          <TabsContent value="products_import" className="space-y-6">
            <Card className="border border-border bg-card shadow-sm">
              <CardHeader className="p-5 border-b border-border">
                <CardTitle className="text-base font-bold text-foreground">
                  استيراد الأصناف مع التحقق المسبق (Pre-Import Validation)
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  الصيغة المطلوبة (CSV): اسم الصنف، SKU، باركود، سعر التكلفة، سعر البيع، التصنيف، العلامة التجارية، الرصيد الافتتاحي
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">
                    الصق محتوى ملف CSV هنا (أو رؤوس الأعمدة مع البيانات):
                  </label>
                  <Textarea
                    placeholder={`name,sku,barcode,costPrice,retailPrice,category,initialStock\nكشكول سلك 100 ورقة,NB-100,622123456789,15,25,أدوات مدرسية,50\nقلم جاف أزرق بايلوت,PEN-PILOT-BL,622987654321,8,15,أقلام ومحايات,100`}
                    value={productCsvText}
                    onChange={(e) => setProductCsvText(e.target.value)}
                    className="font-mono text-xs h-36 bg-background border-border text-foreground"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    onClick={handleValidateProducts}
                    disabled={isValidating || !productCsvText.trim()}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {isValidating ? 'جارٍ الفحص والتحقق...' : 'معاينة وفحص الملف'}
                  </Button>

                  {validationResult && validationResult.validRows.length > 0 && (
                    <Button
                      onClick={handleCommitProducts}
                      disabled={isCommitting}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {isCommitting
                        ? 'جارٍ الحفظ والترحيل...'
                        : `تأكيد استيراد ${validationResult.validRows.length} صنف`}
                    </Button>
                  )}
                </div>

                {/* Validation Summary & Errors */}
                {validationResult && (
                  <div className="space-y-4 pt-4 border-t border-border">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="p-3 bg-muted/50 border border-border rounded-xl text-xs">
                        <span className="text-muted-foreground block">إجمالي الصفوف:</span>
                        <span className="text-base font-bold text-foreground">{validationResult.totalRows}</span>
                      </div>
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-950 dark:text-emerald-200">
                        <span className="block">صفوف صالحة:</span>
                        <span className="text-base font-bold">{validationResult.validRows.length}</span>
                      </div>
                      <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-950 dark:text-rose-200">
                        <span className="block">صفوف بها أخطاء:</span>
                        <span className="text-base font-bold">
                          {validationResult.invalidRows.length + validationResult.duplicateSkus.length}
                        </span>
                      </div>
                    </div>

                    {/* Duplicate SKU Warnings */}
                    {validationResult.duplicateSkus.length > 0 && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-1 text-xs text-amber-950 dark:text-amber-200">
                        <div className="font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          تنبيهات الباركود والـ SKU المكرر (Duplicate Detected):
                        </div>
                        <ul className="list-disc list-inside space-y-0.5 text-[11px] opacity-90">
                          {validationResult.duplicateSkus.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Preview Table */}
                    {validationResult.validRows.length > 0 && (
                      <div className="border border-border rounded-xl overflow-hidden bg-card">
                        <div className="p-3 bg-muted/50 font-bold text-xs text-foreground border-b border-border">
                          معاينة الأصناف الجاهزة للاستيراد:
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow className="border-border">
                              <TableHead>اسم الصنف</TableHead>
                              <TableHead>كود الصنف (SKU)</TableHead>
                              <TableHead>سعر التكلفة</TableHead>
                              <TableHead>سعر البيع</TableHead>
                              <TableHead>التصنيف</TableHead>
                              <TableHead>الرصيد الافتتاحي</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {validationResult.validRows.slice(0, 10).map((row, i) => (
                              <TableRow key={i} className="border-border">
                                <TableCell className="font-semibold text-xs text-foreground">{row.name}</TableCell>
                                <TableCell className="font-mono text-xs">{row.sku}</TableCell>
                                <TableCell className="text-xs">{currency(row.costPrice)}</TableCell>
                                <TableCell className="text-xs font-bold text-foreground">{currency(row.retailPrice)}</TableCell>
                                <TableCell className="text-xs">{row.category}</TableCell>
                                <TableCell className="text-xs">
                                  {row.initialStock ? (
                                    <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800">
                                      {row.initialStock} قطعة (حركة مخزنية)
                                    </Badge>
                                  ) : (
                                    '0'
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 2: PARTNERS IMPORT */}
          <TabsContent value="partners_import" className="space-y-6">
            <Card className="border border-border bg-card shadow-sm">
              <CardHeader className="p-5 border-b border-border">
                <CardTitle className="text-base font-bold text-foreground">
                  استيراد العملاء والموردين المحمي محاسبياً (Ledger-Safe Opening Balances)
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  الأرصدة السابقة تُرحل تلقائياً إلى قيود افتتاحية في دفاتر الأستاذ (Customer/Supplier Ledger) لمنع تفاوت الأرصدة.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl flex items-center gap-3 text-xs text-blue-950 dark:text-blue-200">
                  <ShieldCheck className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                  <div>
                    <span className="font-bold block">مبدأ سلامة الحسابات:</span>
                    لا يتم تعديل أرصدة العملاء أو الموردين بالكتابة المباشرة، بل يقوم النظام بتسجيل حركة رصيد افتتاحي موثقة برقم مرجعي لكل طرف.
                  </div>
                </div>

                <div className="text-xs text-muted-foreground leading-relaxed">
                  يمكنك استيراد جهات التعامل بصيغة CSV تحتوي الأعمدة التالية:
                  <code className="block bg-muted p-2 rounded mt-1 font-mono text-[11px] text-foreground">
                    name, phone, customerType, initialBalance
                  </code>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB 3: EXPORT HUB */}
          <TabsContent value="export_center" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="p-5 border border-border bg-card shadow-sm flex flex-col justify-between">
                <div>
                  <div className="p-2.5 bg-blue-500/10 text-blue-500 rounded-xl w-fit mb-3">
                    <Package className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm text-foreground">تصدير دليل المنتجات والأصناف</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    يشمل الأسعار، الباركود، التصنيفات، وحدات القياس، وبيانات الكتب.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.info('جاري إعداد ملف المنتجات للتنزيل')}
                  className="text-xs mt-4 gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  تصدير المنتجات (CSV)
                </Button>
              </Card>

              <Card className="p-5 border border-border bg-card shadow-sm flex flex-col justify-between">
                <div>
                  <div className="p-2.5 bg-emerald-500/10 text-emerald-500 rounded-xl w-fit mb-3">
                    <Users className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm text-foreground">تصدير العملاء والأرصدة</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    يشمل أرقام الهواتف، الأرصدة الحالية، الأسقف الائتمانية، وشرائح العملاء.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.info('جاري إعداد ملف العملاء للتنزيل')}
                  className="text-xs mt-4 gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  تصدير العملاء (CSV)
                </Button>
              </Card>

              <Card className="p-5 border border-border bg-card shadow-sm flex flex-col justify-between">
                <div>
                  <div className="p-2.5 bg-amber-500/10 text-amber-500 rounded-xl w-fit mb-3">
                    <Truck className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm text-foreground">تصدير الموردين ودور النشر</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    يشمل بيانات التواصل، الأرصدة المستحقة، وشروط السداد وفترات التوريد.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toast.info('جاري إعداد ملف الموردين للتنزيل')}
                  className="text-xs mt-4 gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  تصدير الموردين (CSV)
                </Button>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
