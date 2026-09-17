import { useState, useEffect, useCallback } from 'react';
import { MainLayout } from '@/components/layout';
import { cn } from '@/lib/utils';
import * as Icons from 'lucide-react';
import {
  Plus, Search, CheckCircle, XCircle, Settings, RefreshCw, Key, Shield, Copy, AlertTriangle, Trash2, Power, RotateCcw, Loader2, Globe
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useIntegrations, useTenantBranch } from '@/hooks/useDatabase';
import { useToast } from '@/hooks/use-toast';
import { apiClientsService, ApiClientItem } from '@/services/apiClients';

const DEFAULT_INTEGRATIONS = [
  { id: 'stripe', name: 'Stripe', category: 'payment', description: 'بوابة دفع إلكتروني', iconName: 'CreditCard', status: 'disconnected', color: 'bg-purple-500' },
  { id: 'whatsapp', name: 'WhatsApp Business', category: 'messaging', description: 'إشعارات وتواصل العملاء', iconName: 'MessageSquare', status: 'disconnected', color: 'bg-green-500' },
  { id: 'talabat', name: 'طلبات', category: 'aggregator', description: 'منصة توصيل الطعام', iconName: 'Truck', status: 'disconnected', color: 'bg-orange-500' },
  { id: 'analytics', name: 'Google Analytics', category: 'analytics', description: 'تحليلات الموقع', iconName: 'BarChart3', status: 'disconnected', color: 'bg-blue-500' },
  { id: 'epson', name: 'طابعات Epson', category: 'hardware', description: 'طابعات الإيصالات', iconName: 'Printer', status: 'disconnected', color: 'bg-gray-600' },
  { id: 'paymob', name: 'Paymob', category: 'payment', description: 'بوابة دفع محلية', iconName: 'CreditCard', status: 'disconnected', color: 'bg-blue-600' },
];

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  connected: { label: 'متصل', color: 'bg-success/10 text-success', icon: CheckCircle },
  pending: { label: 'قيد التفعيل', color: 'bg-warning/10 text-warning', icon: RefreshCw },
  disconnected: { label: 'غير متصل', color: 'bg-muted text-muted-foreground', icon: XCircle },
};

export default function Integrations() {
  const [searchQuery, setSearchQuery] = useState('');
  const [hardwareDevices, setHardwareDevices] = useState<{name: string, type: string, status: string}[]>([]);
  const { tenantId } = useTenantBranch();
  const { integrations: dbIntegrations, updateIntegration, addIntegration } = useIntegrations(tenantId);
  const { toast } = useToast();

  // API Clients State
  const [apiClients, setApiClients] = useState<ApiClientItem[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientDesc, setNewClientDesc] = useState('');
  const [newClientOrigins, setNewClientOrigins] = useState('');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);
  const [generatedSecretData, setGeneratedSecretData] = useState<{ clientId: string; secret: string } | null>(null);

  const loadApiClients = useCallback(async () => {
    setLoadingClients(true);
    try {
      const clients = await apiClientsService.listClients(tenantId);
      setApiClients(clients);
    } catch (err: any) {
      console.warn('Failed to load API clients from backend:', err.message);
      // If unauthorized or network error, keep empty list
      setApiClients([]);
    } finally {
      setLoadingClients(false);
    }
  }, [tenantId]);

  const getConnectedHardware = async () => {
    if ('usb' in navigator) {
      try {
        const devices = await (navigator as any).usb.getDevices();
        const mapped = devices.map((d: any) => ({
          name: d.productName || 'طابعة إيصالات',
          type: 'طابعة إيصالات ودرج كاشير',
          status: 'connected'
        }));
        setHardwareDevices(mapped);
      } catch (e) {
        console.error(e);
      }
    }
  };

  useEffect(() => {
    getConnectedHardware();
    loadApiClients();
  }, [loadApiClients]);

  const scanForHardware = async () => {
    try {
      if (!('usb' in navigator)) {
        toast({ title: 'غير مدعوم', description: 'متصفحك لا يدعم اكتشاف أجهزة USB المباشر', variant: 'destructive' });
        return;
      }
      
      const device = await (navigator as any).usb.requestDevice({ filters: [] });
      
      if (device) {
        const deviceName = device.productName || 'طابعة غير معروفة';
        const newDevice = {
          name: deviceName,
          type: 'طابعة إيصالات ودرج كاشير',
          status: 'connected'
        };
        
        setHardwareDevices(prev => {
          if (!prev.find(d => d.name === newDevice.name)) {
             toast({ title: 'نجاح', description: `تم اكتشاف ${deviceName} بنجاح` });
             return [...prev, newDevice];
          }
          return prev;
        });
      }
    } catch (e: any) {
      console.log('User cancelled device selection', e);
    }
  };

  const toggleIntegration = async (integration: any, connect: boolean) => {
    const newStatus = connect ? 'connected' : 'disconnected';
    if (integration.dbId) {
      await updateIntegration(integration.dbId, { status: newStatus });
    } else {
      await addIntegration({ integration_id: integration.id, status: newStatus, name: integration.name });
    }
  };

  const handleCreateClient = async () => {
    if (!newClientName) return;
    setIsSubmittingCreate(true);

    try {
      const parsedOrigins = newClientOrigins
        ? newClientOrigins.split(',').map(o => o.trim()).filter(Boolean)
        : [];

      const result = await apiClientsService.createClient({
        name: newClientName,
        description: newClientDesc || undefined,
        permissions: ['menu:read', 'orders:create', 'orders:read', 'branches:read', 'delivery:read', 'offers:read'],
        allowed_origins: parsedOrigins,
        allowed_branch_ids: [],
        rate_limit_tier: 'standard',
      }, tenantId);

      // Open one-time secret modal with exact backend credentials
      setGeneratedSecretData({
        clientId: result.client_id,
        secret: result.credential_header,
      });

      // Optimistically update local state immediately so client appears in UI
      if (result.client) {
        setApiClients(prev => [result.client, ...prev.filter(c => c.client_id !== result.client.client_id)]);
      }

      setIsCreateModalOpen(false);
      setNewClientName('');
      setNewClientDesc('');
      setNewClientOrigins('');
      toast({ title: 'تم إنشاء المفتاح بنجاح', description: 'تم حفظ المفتاح في قاعدة البيانات وتوليد المفتاح السري' });
      await loadApiClients();
    } catch (err: any) {
      toast({
        title: 'فشل في إنشاء المفتاح',
        description: err.message || 'حدث خطأ أثناء الاتصال بالخادم',
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const handleRotateSecret = async (clientId: string) => {
    setActionLoadingId(clientId);
    try {
      const result = await apiClientsService.rotateSecret(clientId, tenantId);
      setGeneratedSecretData({
        clientId: result.client_id,
        secret: result.credential_header,
      });
      // Optimistically update secret_last4 and updated_at
      setApiClients(prev => prev.map(c => c.client_id === clientId ? { ...c, secret_last4: result.client_secret.slice(-4), updated_at: result.rotated_at } : c));
      toast({ title: 'تم تدوير المفتاح', description: 'تم إبطال المفتاح القديم وتوليد مفتاح سري جديد' });
      await loadApiClients();
    } catch (err: any) {
      toast({
        title: 'فشل تدوير المفتاح',
        description: err.message || 'حدث خطأ أثناء الاتصال بالخادم',
        variant: 'destructive',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleStatus = async (client: ApiClientItem) => {
    setActionLoadingId(client.client_id);
    try {
      if (client.status === 'active') {
        const updated = await apiClientsService.disableClient(client.client_id, tenantId);
        setApiClients(prev => prev.map(c => c.client_id === client.client_id ? (updated || { ...c, status: 'disabled' }) : c));
        toast({ title: 'تم التعطيل', description: `تم تعطيل المفتاح ${client.client_id}` });
      } else {
        const updated = await apiClientsService.enableClient(client.client_id, tenantId);
        setApiClients(prev => prev.map(c => c.client_id === client.client_id ? (updated || { ...c, status: 'active' }) : c));
        toast({ title: 'تم التفعيل', description: `تم تفعيل المفتاح ${client.client_id}` });
      }
      await loadApiClients();
    } catch (err: any) {
      toast({
        title: 'فشل تعديل الحالة',
        description: err.message || 'حدث خطأ أثناء الاتصال بالخادم',
        variant: 'destructive',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRevokeClient = async (clientId: string) => {
    setActionLoadingId(clientId);
    try {
      const updated = await apiClientsService.revokeClient(clientId, tenantId);
      setApiClients(prev => prev.map(c => c.client_id === clientId ? (updated || { ...c, status: 'revoked' }) : c));
      toast({ title: 'تم إلغاء المفتاح', description: `تم إلغاء المفتاح ${clientId} نهائياً` });
      await loadApiClients();
    } catch (err: any) {
      toast({
        title: 'فشل إلغاء المفتاح',
        description: err.message || 'حدث خطأ أثناء الاتصال بالخادم',
        variant: 'destructive',
      });
    } finally {
      setActionLoadingId(null);
    }
  };

  const copyToClipboard = (text: string, message: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'تم النسخ', description: message });
  };

  const integrations = DEFAULT_INTEGRATIONS.map(def => {
    const dbInt = dbIntegrations.find(i => i.integration_id === def.id);
    return {
      ...def,
      dbId: dbInt?.id,
      status: dbInt ? dbInt.status : def.status,
      icon: (Icons as any)[def.iconName] || Icons.Puzzle
    };
  });

  const filteredIntegrations = integrations.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()) || i.description.includes(searchQuery));
  const connectedCount = integrations.filter(i => i.status === 'connected').length;

  return (
    <MainLayout title="مركز التكاملات ومفاتيح الربط" subtitle="إدارة المنصات الخارجية ومفاتيح الـ REST API"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadApiClients} disabled={loadingClients} className="gap-1 text-xs">
            <RefreshCw className={cn('w-3.5 h-3.5', loadingClients && 'animate-spin')} />
            <span>تحديث</span>
          </Button>
          <Button onClick={() => setIsCreateModalOpen(true)} className="gap-2 text-xs md:text-sm">
            <Key className="w-4 h-4" />
            <span>إنشاء مفتاح API جديد</span>
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <Card><CardContent className="p-3 md:p-4 text-center"><p className="text-2xl md:text-3xl font-bold text-primary">{integrations.length}</p><p className="text-xs md:text-sm text-muted-foreground">إجمالي التكاملات</p></CardContent></Card>
        <Card><CardContent className="p-3 md:p-4 text-center"><p className="text-2xl md:text-3xl font-bold text-success">{connectedCount}</p><p className="text-xs md:text-sm text-muted-foreground">متصل</p></CardContent></Card>
        <Card><CardContent className="p-3 md:p-4 text-center"><p className="text-2xl md:text-3xl font-bold text-warning">{apiClients.length}</p><p className="text-xs md:text-sm text-muted-foreground">مفاتيح API مسجلة</p></CardContent></Card>
        <Card><CardContent className="p-3 md:p-4 text-center"><p className="text-2xl md:text-3xl font-bold text-info">3</p><p className="text-xs md:text-sm text-muted-foreground">Webhooks نشطة</p></CardContent></Card>
      </div>

      <Tabs defaultValue="apikeys" className="space-y-6">
        <TabsList>
          <TabsTrigger value="apikeys" className="gap-2"><Key className="w-4 h-4" />مفاتيح الـ REST API</TabsTrigger>
          <TabsTrigger value="software">البرامج والمنصات</TabsTrigger>
          <TabsTrigger value="hardware">أجهزة الكاشير (طابعات - درج)</TabsTrigger>
        </TabsList>

        {/* Tab 1: API Clients & Keys Management */}
        <TabsContent value="apikeys" className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-muted/30 p-4 rounded-xl border">
            <div>
              <h3 className="font-bold text-base md:text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                مفاتيح ربط التطبيقات الخارجية (REST API Clients)
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground mt-1">
                تتيح لمواقع المطاعم وتطبيقات التوصيل الوصول الآمن إلى المنيو وإنشاء الطلبات وتتبعها عبر بروتوكول HTTPS المشفر.
              </p>
            </div>
            <Button onClick={() => setIsCreateModalOpen(true)} className="gap-2 text-xs md:text-sm">
              <Plus className="w-4 h-4" />
              <span>مفتاح جديد</span>
            </Button>
          </div>

          {loadingClients ? (
            <Card className="p-12 text-center text-muted-foreground border-dashed">
              <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-primary" />
              <p className="text-sm font-medium">جاري تحميل مفاتيح الـ REST API من الخادم...</p>
            </Card>
          ) : apiClients.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground border-dashed">
              <Key className="w-12 h-12 mx-auto mb-3 opacity-40 text-muted-foreground" />
              <h4 className="font-bold text-base text-foreground mb-1">لا توجد مفاتيح API مسجلة حالياً</h4>
              <p className="text-xs md:text-sm mb-4">قم بإنشاء مفتاح API لربط موقعك الخارجي أو تطبيق التوصيل بنظام المطعم.</p>
              <Button onClick={() => setIsCreateModalOpen(true)} size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                إنشاء أول مفتاح
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {apiClients.map((client) => {
                const isLoadingThis = actionLoadingId === client.client_id;
                return (
                  <Card key={client.id || client.client_id} className="border hover:shadow-sm transition-shadow">
                    <CardContent className="p-4 md:p-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <h4 className="font-bold text-base md:text-lg">{client.name}</h4>
                            <Badge variant={client.status === 'active' ? 'default' : client.status === 'disabled' ? 'secondary' : 'destructive'} className="text-xs">
                              {client.status === 'active' ? 'نشط' : client.status === 'disabled' ? 'معطل' : 'ملغي'}
                            </Badge>
                          </div>
                          {client.description && (
                            <p className="text-xs text-muted-foreground">{client.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-muted-foreground">
                            <span dir="ltr" className="bg-muted px-2 py-1 rounded font-mono select-all">Client ID: {client.client_id}</span>
                            <span dir="ltr" className="bg-muted px-2 py-1 rounded font-mono">Secret: ••••••••••••••••{client.secret_last4}</span>
                            {client.allowed_origins && client.allowed_origins.length > 0 && (
                              <span dir="ltr" className="bg-muted/80 px-2 py-1 rounded flex items-center gap-1 font-mono">
                                <Globe className="w-3 h-3" />
                                {client.allowed_origins.join(', ')}
                              </span>
                            )}
                            <span className="font-sans">أنشئ: {new Date(client.created_at).toLocaleDateString('ar-EG')}</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs"
                            disabled={isLoadingThis}
                            onClick={() => copyToClipboard(client.client_id, 'تم نسخ Client ID إلى الحافظة')}
                          >
                            <Copy className="w-3.5 h-3.5" />
                            نسخ المعرف
                          </Button>
                          
                          {client.status !== 'revoked' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1 text-xs"
                                disabled={isLoadingThis}
                                onClick={() => handleRotateSecret(client.client_id)}
                              >
                                <RotateCcw className={cn('w-3.5 h-3.5', isLoadingThis && 'animate-spin')} />
                                تدوير المفتاح
                              </Button>
                              <Button
                                variant={client.status === 'active' ? 'secondary' : 'default'}
                                size="sm"
                                className="gap-1 text-xs"
                                disabled={isLoadingThis}
                                onClick={() => handleToggleStatus(client)}
                              >
                                <Power className="w-3.5 h-3.5" />
                                {client.status === 'active' ? 'تعطيل' : 'تفعيل'}
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="gap-1 text-xs"
                                disabled={isLoadingThis}
                                onClick={() => handleRevokeClient(client.client_id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                إلغاء
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Software Integrations */}
        <TabsContent value="software" className="space-y-4">
          <div className="relative w-full md:w-80 mb-6"><Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="بحث عن تكامل..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pr-10" /></div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredIntegrations.map((integration) => {
              const status = statusConfig[integration.status];
              const StatusIcon = status.icon;
              const IntegrationIcon = integration.icon;
              return (
                <Card key={integration.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-3 md:p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn('w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-white flex-shrink-0', integration.color)}><IntegrationIcon className="w-5 h-5 md:w-6 md:h-6" /></div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1"><h4 className="font-bold text-sm md:text-base">{integration.name}</h4><Badge className={cn('text-[10px] md:text-xs', status.color)}><StatusIcon className="w-3 h-3 ml-1" />{status.label}</Badge></div>
                        <p className="text-xs text-muted-foreground mb-3">{integration.description}</p>
                        <div className="flex items-center gap-2">
                          {integration.status === 'connected' ? <><Button variant="outline" size="sm" className="gap-1 text-xs"><Settings className="w-4 h-4" />إعدادات</Button><Switch checked={true} onCheckedChange={(v) => toggleIntegration(integration, v)} /></> : <Button onClick={() => toggleIntegration(integration, true)} size="sm" className="gap-1 text-xs"><Plus className="w-4 h-4" />ربط</Button>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
        
        {/* Tab 3: Hardware Devices */}
        <TabsContent value="hardware" className="space-y-4">
           <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
             <div>
               <h3 className="text-lg font-bold">الأجهزة المتصلة بالنظام</h3>
               <p className="text-sm text-muted-foreground">قم بإدارة طابعات الإيصالات وأدراج الكاشير المتصلة بجهازك محلياً</p>
             </div>
             <Button onClick={scanForHardware} className="gap-2"><RefreshCw className="w-4 h-4" /> اكتشاف أجهزة USB</Button>
           </div>
           
           {hardwareDevices.length === 0 ? (
             <Card className="p-8 text-center text-muted-foreground border-dashed">
                <Icons.Printer className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>لا توجد أجهزة متصلة حالياً</p>
                <p className="text-sm mt-1">انقر على الزر أعلاه لاكتشاف الطابعات وأدراج الكاشير</p>
             </Card>
           ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {hardwareDevices.map((dev, idx) => (
                 <Card key={idx} className="border-success/20 bg-success/5">
                   <CardContent className="p-4 flex items-center justify-between">
                     <div className="flex items-center gap-3">
                       <div className="w-12 h-12 rounded-full bg-success/20 text-success flex items-center justify-center">
                         <Icons.Printer className="w-6 h-6" />
                       </div>
                       <div>
                         <h4 className="font-bold">{dev.name}</h4>
                         <p className="text-sm text-muted-foreground">{dev.type}</p>
                       </div>
                     </div>
                     <Badge className="bg-success text-success-foreground border-transparent">متصل ونشط</Badge>
                   </CardContent>
                 </Card>
               ))}
               
               <Card className="border-dashed flex items-center justify-center min-h-[100px] cursor-pointer hover:bg-muted/50 transition-colors" onClick={scanForHardware}>
                 <div className="text-center text-muted-foreground">
                   <Plus className="w-8 h-8 mx-auto mb-2 opacity-50" />
                   <p className="text-sm font-medium">إضافة جهاز آخر</p>
                 </div>
               </Card>
             </div>
           )}
        </TabsContent>
      </Tabs>

      {/* Modal 1: Create API Client Modal */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="w-5 h-5 text-primary" />
              إنشاء مفتاح API جديد
            </DialogTitle>
            <DialogDescription>
              قم بإنشاء بيانات اعتماد لتطبيق أو موقع خارجي للاتصال بالنظام عبر REST API المشفر.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <Label htmlFor="client-name">اسم التطبيق / العميل *</Label>
              <Input
                id="client-name"
                placeholder="مثال: موقع سوشي بار الخارجي"
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-desc">الوصف (اختياري)</Label>
              <Input
                id="client-desc"
                placeholder="مثال: مخصص لطلبات التوصيل للموقع الخارجي"
                value={newClientDesc}
                onChange={(e) => setNewClientDesc(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="client-origins">النطاقات المسموحة (Origins) (اختياري)</Label>
              <Input
                id="client-origins"
                placeholder="مثال: https://sushi-bar.pages.dev"
                value={newClientOrigins}
                onChange={(e) => setNewClientOrigins(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                افصل بين النطاقات بفاصلة. يمنع الهجمات عبر المتصفح (CORS).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateModalOpen(false)} disabled={isSubmittingCreate}>
              إلغاء
            </Button>
            <Button onClick={handleCreateClient} disabled={!newClientName || isSubmittingCreate} className="gap-2">
              {isSubmittingCreate && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>إنشاء المفتاح وحفظه</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal 2: One-Time Secret Reveal Modal */}
      <Dialog open={!!generatedSecretData} onOpenChange={(open) => !open && setGeneratedSecretData(null)}>
        <DialogContent className="sm:max-w-[620px] max-w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning text-lg">
              <AlertTriangle className="w-5 h-5 text-warning" />
              احفظ المفتاح السري الآن!
            </DialogTitle>
            <DialogDescription className="text-sm">
              لن تتمكن من رؤية هذا المفتاح السري مرة أخرى بعد إغلاق هذه النافذة لأسباب أمنية مشددة. يتم حفظ بصمة تشفيرية فقط على الخادم.
            </DialogDescription>
          </DialogHeader>
          {generatedSecretData && (
            <div className="space-y-4 py-3">
              {/* Client ID */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium">Client ID (معرف العميل)</Label>
                <div className="flex items-center gap-2" dir="ltr">
                  <div className="flex-1 min-w-0 bg-muted border rounded-lg px-3 py-2 font-mono text-xs text-left overflow-x-auto select-all whitespace-nowrap">
                    {generatedSecretData.clientId}
                  </div>
                  <Button size="icon" variant="outline" className="flex-shrink-0" onClick={() => copyToClipboard(generatedSecretData.clientId, 'تم نسخ Client ID')}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Complete Ready-to-Use Bearer Token */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium">رمز الاعتماد الكامل (Bearer Token / API Key)</Label>
                <div className="flex items-center gap-2" dir="ltr">
                  <div className="flex-1 min-w-0 bg-muted/90 border border-primary/30 rounded-lg px-3 py-2.5 font-mono text-xs text-primary font-bold text-left overflow-x-auto select-all whitespace-nowrap">
                    {generatedSecretData.secret}
                  </div>
                  <Button size="icon" variant="outline" className="flex-shrink-0 border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground" onClick={() => copyToClipboard(generatedSecretData.secret, 'تم نسخ رمز الاعتماد الكامل')}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Usage Guide */}
              <div className="p-3.5 bg-warning/10 border border-warning/30 rounded-xl text-xs space-y-2 text-warning-foreground">
                <p className="font-bold flex items-center gap-1.5 text-warning">
                  <Shield className="w-4 h-4" />
                  طريقة الاستخدام في موقعك أو تطبيقك:
                </p>
                <div dir="ltr" className="bg-background/80 border border-warning/20 rounded-lg p-2.5 font-mono text-[11px] text-left overflow-x-auto whitespace-nowrap">
                  Authorization: Bearer {generatedSecretData.secret}
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  قم بنسخ هذا الرمز كاملاً وضعه في متغيرات البيئة (مثل <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">RMS_API_KEY</code>) لموقعك الخارجي (مثل Cloudflare Pages أو Vercel).
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button className="w-full sm:w-auto" onClick={() => setGeneratedSecretData(null)}>تم نسخ وحفظ المفتاح بأمان</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
