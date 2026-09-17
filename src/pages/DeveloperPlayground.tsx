import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useTenantBranch } from '@/hooks/useDatabase';
import { useToast } from '@/hooks/use-toast';
import { 
  Play, Terminal, Code2, Copy, Check, ShieldAlert, Sparkles, Layers, RefreshCw, KeyRound, AlertTriangle, Clock, ArrowRight, BookOpen, Radio, Wifi, WifiOff, Zap, Trash2
} from 'lucide-react';

const generateUuid = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

interface IntegrationOption {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'disabled' | 'revoked';
  allowed_branch_ids: string[];
  permissions: string[];
  rate_limit_tier: string;
}

interface EndpointDefinition {
  id: string;
  group: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  title: string;
  description: string;
  permission: string | null;
  defaultBody?: any;
  pathParams?: string[];
  isDestructive?: boolean;
}

interface LiveEventItem {
  id: string;
  type: string;
  timestamp: string;
  request_id: string;
  data: any;
  received_at: string;
}

const PLAYGROUND_ENDPOINTS: EndpointDefinition[] = [
  { id: 'health', group: 'System', method: 'GET', path: '/health', title: 'System Health Check', description: 'Inspect API gateway, realtime event bus, and worker status', permission: null },
  { id: 'settings', group: 'Settings', method: 'GET', path: '/settings', title: 'Restaurant Settings', description: 'Fetch branding, currency, tax rates, and locale', permission: 'menu:read' },
  { id: 'branches', group: 'Branches', method: 'GET', path: '/branches', title: 'List Active Branches', description: 'Retrieve branches authorized for this tenant', permission: 'branches:read' },
  { id: 'menu', group: 'Catalog', method: 'GET', path: '/menu', title: 'Full Menu Catalog', description: 'Fetch categories with nested products and addons', permission: 'menu:read' },
  { id: 'categories', group: 'Catalog', method: 'GET', path: '/categories', title: 'List Categories', description: 'Fetch all active menu categories', permission: 'menu:read' },
  { id: 'products', group: 'Catalog', method: 'GET', path: '/products', title: 'List Products', description: 'Fetch products with optional category filtering', permission: 'menu:read' },
  { id: 'delivery_zones', group: 'Delivery', method: 'GET', path: '/delivery-zones', title: 'Delivery Zones', description: 'Inspect branch delivery coverage and fees', permission: 'delivery:read' },
  { id: 'offers', group: 'Promotions', method: 'GET', path: '/offers', title: 'Active Offers & Discounts', description: 'Retrieve active coupons and promotions', permission: 'offers:read' },
  { 
    id: 'pricing_preview', 
    group: 'Pricing', 
    method: 'POST', 
    path: '/pricing/preview', 
    title: 'Authoritative Pricing Preview', 
    description: 'Server-side price calculation with subtotal, tax, and fees', 
    permission: 'menu:read',
    defaultBody: {
      branch_id: 'branch_1',
      order_type: 'delivery',
      items: [{ product_id: 'prod_1', quantity: 2 }],
      coupon_code: 'WELCOME10'
    }
  },
  { 
    id: 'create_order', 
    group: 'Orders', 
    method: 'POST', 
    path: '/orders', 
    title: 'Create Customer Order', 
    description: 'Submit order with idempotent pricing snapshot and emit realtime event', 
    permission: 'orders:create',
    isDestructive: true,
    defaultBody: {
      branch_id: 'branch_1',
      order_type: 'takeaway',
      items: [{ product_id: 'prod_1', quantity: 1 }],
      customer: { name: 'Demo Customer', phone: '+1234567890' },
      payment_method: 'cash'
    }
  },
  { id: 'track_order', group: 'Orders', method: 'GET', path: '/orders/{id}/track', title: 'Live Order Tracking', description: 'Customer-safe tracking with state history', permission: 'orders:read', pathParams: ['id'] },
  { 
    id: 'update_order_status', 
    group: 'Orders', 
    method: 'PATCH', 
    path: '/orders/{id}/status', 
    title: 'Update Order Status', 
    description: 'Advance order state and emit order.status_changed event', 
    permission: 'orders:update_status',
    isDestructive: true,
    pathParams: ['id'],
    defaultBody: { status: 'preparing', notes: 'Kitchen started preparation' }
  },
];

export default function DeveloperPlayground() {
  const { tenantId } = useTenantBranch();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'rest' | 'realtime'>('rest');
  const [apiVersion, setApiVersion] = useState<'v1' | 'v2'>('v1');
  const [integrations, setIntegrations] = useState<IntegrationOption[]>([]);
  const [selectedIntegrationId, setSelectedIntegrationId] = useState<string>('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointDefinition>(PLAYGROUND_ENDPOINTS[0]);
  
  // Request parameters
  const [pathParamValues, setPathParamValues] = useState<Record<string, string>>({ id: 'ord_demo123' });
  const [branchHeader, setBranchHeader] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [requestBodyText, setRequestBodyText] = useState('');
  const [isDestructiveModalOpen, setIsDestructiveModalOpen] = useState(false);
  
  // Execution state
  const [loading, setLoading] = useState(false);
  const [executionResult, setExecutionResult] = useState<any>(null);
  const [copiedTab, setCopiedTab] = useState<string | null>(null);

  // Real-Time Events State
  const [rtProtocol, setRtProtocol] = useState<'sse' | 'ws'>('sse');
  const [rtConnected, setRtConnected] = useState(false);
  const [rtConnecting, setRtConnecting] = useState(false);
  const [rtEventTypeFilter, setRtEventTypeFilter] = useState('all');
  const [liveEvents, setLiveEvents] = useState<LiveEventItem[]>([]);

  // Initialize demo/mock integrations for tenant
  useEffect(() => {
    const mockList: IntegrationOption[] = [
      {
        id: 'int_website_live',
        name: 'Online Ordering Website',
        type: 'custom_website',
        status: 'active',
        allowed_branch_ids: [],
        permissions: ['menu:read', 'orders:create', 'orders:read', 'branches:read', 'delivery:read', 'offers:read'],
        rate_limit_tier: 'standard',
      },
      {
        id: 'int_kiosk_pos',
        name: 'Dine-In Kiosk #1',
        type: 'kiosk',
        status: 'active',
        allowed_branch_ids: ['branch_1'],
        permissions: ['menu:read', 'orders:create', 'branches:read'],
        rate_limit_tier: 'free',
      },
    ];
    setIntegrations(mockList);
    setSelectedIntegrationId(mockList[0].id);
  }, [tenantId]);

  // Update request body when selecting endpoint
  useEffect(() => {
    if (selectedEndpoint.defaultBody) {
      setRequestBodyText(JSON.stringify(selectedEndpoint.defaultBody, null, 2));
    } else {
      setRequestBodyText('');
    }
    if (selectedEndpoint.id === 'create_order') {
      setIdempotencyKey(`play_${generateUuid().slice(0, 16)}`);
    } else {
      setIdempotencyKey('');
    }
  }, [selectedEndpoint]);

  const selectedIntegration = integrations.find((i) => i.id === selectedIntegrationId);
  const hasPermission = !selectedEndpoint.permission || (selectedIntegration?.permissions.includes(selectedEndpoint.permission) ?? false);

  const handleCopy = (text: string, tabName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedTab(tabName);
    toast({ title: 'تم النسخ بنجاح' });
    setTimeout(() => setCopiedTab(null), 2000);
  };

  const handleExecute = async () => {
    if (selectedEndpoint.isDestructive && !isDestructiveModalOpen) {
      setIsDestructiveModalOpen(true);
      return;
    }
    setIsDestructiveModalOpen(false);
    setLoading(true);

    let resolvedPath = selectedEndpoint.path;
    if (selectedEndpoint.pathParams) {
      for (const p of selectedEndpoint.pathParams) {
        resolvedPath = resolvedPath.replace(`{${p}}`, pathParamValues[p] || 'demo');
      }
    }

    let parsedBody: any = undefined;
    if (requestBodyText && ['POST', 'PATCH', 'PUT'].includes(selectedEndpoint.method)) {
      try {
        parsedBody = JSON.parse(requestBodyText);
      } catch (err: any) {
        toast({ title: 'خطأ في صياغة JSON', description: err.message, variant: 'destructive' });
        setLoading(false);
        return;
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-ID': `req_play_${generateUuid().slice(0, 12)}`,
    };
    if (branchHeader) headers['X-Branch-ID'] = branchHeader;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

    const fullUrl = `https://api.example-restaurant.com/api/${apiVersion}${resolvedPath}`;

    // Simulate safe execution & trigger real-time event if applicable
    setTimeout(() => {
      setLoading(false);
      const isSuccess = hasPermission;
      const statusCode = isSuccess ? (selectedEndpoint.method === 'POST' ? 201 : 200) : 403;
      
      let mockBody: any = {
        success: isSuccess,
        data: isSuccess
          ? {
              status: 'healthy',
              message: `Executed ${selectedEndpoint.method} /api/${apiVersion}${resolvedPath} successfully on tenant: ${tenantId || 'tenant_main'}`,
              payload: parsedBody || { items_count: 1 },
              timestamp: new Date().toISOString(),
            }
          : {
              error: {
                code: 'FORBIDDEN',
                message: `Permission denied: Missing required permission '${selectedEndpoint.permission}'`,
              },
            },
      };

      setExecutionResult({
        status_code: statusCode,
        duration_ms: Math.floor(Math.random() * 40) + 15,
        request_id: headers['X-Request-ID'],
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'x-request-id': headers['X-Request-ID'],
          'x-ratelimit-limit': '500',
          'x-ratelimit-remaining': '498',
          'x-ratelimit-reset': '52',
        },
        body: mockBody,
        code_examples: {
          curl: `curl -X ${selectedEndpoint.method} \\\n  '${fullUrl}' \\\n  -H 'Authorization: Bearer <YOUR_API_KEY>' \\\n  -H 'X-Request-ID: ${headers['X-Request-ID']}'${branchHeader ? ` \\\n  -H 'X-Branch-ID: ${branchHeader}'` : ''}${idempotencyKey ? ` \\\n  -H 'Idempotency-Key: ${idempotencyKey}'` : ''}${parsedBody ? ` \\\n  -d '${JSON.stringify(parsedBody, null, 2)}'` : ''}`,
          javascript: `const response = await fetch('${fullUrl}', {\n  method: '${selectedEndpoint.method}',\n  headers: {\n    'Authorization': 'Bearer ' + process.env.RMS_API_KEY,\n    'X-Request-ID': '${headers['X-Request-ID']}'\n  }${parsedBody ? `,\n  body: JSON.stringify(${JSON.stringify(parsedBody, null, 4)})` : ''}\n});\nconst data = await response.json();`,
          sdk: `import { RmsApiClient } from '@rms/sdk';\n\nconst rms = new RmsApiClient({\n  baseUrl: 'https://api.example-restaurant.com/api/${apiVersion}',\n  apiKey: process.env.RMS_API_KEY!,\n});\n\n// Call official SDK method\nconst result = await rms.${selectedEndpoint.id === 'menu' ? 'getMenu()' : selectedEndpoint.id === 'create_order' ? 'createOrder(input, { idempotencyKey })' : 'getHealth()'};\nconsole.log(result);`,
        },
      });

      // If order was created or updated and real-time is active, feed event to live console
      if (isSuccess && rtConnected && (selectedEndpoint.id === 'create_order' || selectedEndpoint.id === 'update_order_status')) {
        const evtType = selectedEndpoint.id === 'create_order' ? 'order.created' : 'order.status_changed';
        const newEvt: LiveEventItem = {
          id: `evt_${generateUuid().replace(/-/g, '').slice(0, 16)}`,
          type: evtType,
          timestamp: new Date().toISOString(),
          request_id: headers['X-Request-ID'],
          data: parsedBody || { status: 'created' },
          received_at: new Date().toLocaleTimeString(),
        };
        setLiveEvents((prev) => [newEvt, ...prev]);
      }

      toast({ title: isSuccess ? 'تم تنفيذ الطلب بنجاح' : 'تم رفض الطلب: نقص الصلاحية' });
    }, 400);
  };

  const toggleRealtimeConnect = () => {
    if (rtConnected) {
      setRtConnected(false);
      toast({ title: 'تم قطع اتصال الأحداث المباشرة' });
    } else {
      setRtConnecting(true);
      setTimeout(() => {
        setRtConnecting(false);
        setRtConnected(true);
        toast({ title: `تم الاتصال عبر ${rtProtocol.toUpperCase()} بنجاح` });
        
        // Initial connected event simulation
        const initialEvt: LiveEventItem = {
          id: `evt_${generateUuid().replace(/-/g, '').slice(0, 16)}`,
          type: 'tenant.updated',
          timestamp: new Date().toISOString(),
          request_id: `req_stream_${generateUuid().slice(0, 8)}`,
          data: { status: 'connected', protocol: rtProtocol, tenant: tenantId || 'tenant_main' },
          received_at: new Date().toLocaleTimeString(),
        };
        setLiveEvents([initialEvt]);
      }, 500);
    }
  };

  const handleSimulateEvent = (type: string) => {
    if (!rtConnected) {
      toast({ title: 'يرجى الاتصال بالبث أولاً', variant: 'destructive' });
      return;
    }
    const simulatedEvt: LiveEventItem = {
      id: `evt_${generateUuid().replace(/-/g, '').slice(0, 16)}`,
      type,
      timestamp: new Date().toISOString(),
      request_id: `req_sim_${generateUuid().slice(0, 8)}`,
      data: type.startsWith('order.')
        ? { order_id: 'ord_987', order_number: '#105', status: type === 'order.created' ? 'pending' : 'preparing' }
        : { category_id: 'cat_1', name: 'Updated Specials' },
      received_at: new Date().toLocaleTimeString(),
    };
    setLiveEvents((prev) => [simulatedEvt, ...prev]);
    toast({ title: `تم استقبال حدث جديد: ${type}` });
  };

  const getMethodBadgeColor = (method: string) => {
    switch (method) {
      case 'GET': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'POST': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'PATCH': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'DELETE': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <Terminal className="w-7 h-7 text-primary" />
              <h1 className="text-2xl font-bold text-foreground">Interactive Developer Playground</h1>
              <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/20">Universal Platform</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              بيئة تفاعلية لاختبار واجهات الـ REST API واستعراض الأحداث المباشرة (Real-Time Events) دون تسريب أي أسرار
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Top Navigation Mode Tabs */}
            <div className="flex items-center bg-muted/60 p-1 rounded-lg border border-border/40">
              <button
                onClick={() => setActiveTab('rest')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === 'rest' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                REST API Explorer
              </button>
              <button
                onClick={() => setActiveTab('realtime')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                  activeTab === 'realtime' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Radio className="w-3.5 h-3.5 animate-pulse text-amber-400" />
                Live Real-Time Events
              </button>
            </div>

            {/* Integration Selector */}
            <div className="w-64">
              <Select value={selectedIntegrationId} onValueChange={setSelectedIntegrationId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="اختر القناة / Integration" />
                </SelectTrigger>
                <SelectContent>
                  {integrations.map((int) => (
                    <SelectItem key={int.id} value={int.id}>
                      <div className="flex items-center justify-between gap-2">
                        <span>{int.name}</span>
                        <Badge variant="secondary" className="text-[10px] uppercase">{int.type}</Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* REST API Explorer TAB */}
        {activeTab === 'rest' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Endpoints Browser (4 cols) */}
            <div className="lg:col-span-4 space-y-4">
              <Card className="border-border/60 shadow-sm">
                <CardHeader className="p-4 pb-3 border-b border-border/40">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    نقاط الاتصال (Endpoints)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 space-y-1 max-h-[680px] overflow-y-auto">
                  {PLAYGROUND_ENDPOINTS.map((ep) => {
                    const isSelected = selectedEndpoint.id === ep.id;
                    return (
                      <button
                        key={ep.id}
                        onClick={() => {
                          setSelectedEndpoint(ep);
                          setExecutionResult(null);
                        }}
                        className={`w-full text-right p-2.5 rounded-lg text-xs font-medium transition-all flex items-center justify-between border ${
                          isSelected
                            ? 'bg-primary/10 border-primary/40 text-primary shadow-xs'
                            : 'border-transparent hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge className={`text-[10px] font-mono px-1.5 py-0 border ${getMethodBadgeColor(ep.method)}`}>
                            {ep.method}
                          </Badge>
                          <span className="truncate">{ep.title}</span>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground/60">{ep.path}</span>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Integration Details Info Box */}
              {selectedIntegration && (
                <Card className="border-border/60 bg-muted/20">
                  <CardContent className="p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between font-semibold">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <KeyRound className="w-3.5 h-3.5 text-primary" />
                        معرف القناة
                      </span>
                      <span className="font-mono text-[11px]">{selectedIntegration.id}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">نوع التكامل</span>
                      <Badge variant="outline" className="text-[10px]">{selectedIntegration.type}</Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">باقة الاستخدام</span>
                      <Badge variant="secondary" className="text-[10px] uppercase">{selectedIntegration.rate_limit_tier}</Badge>
                    </div>
                    <div className="pt-2 border-t border-border/40">
                      <span className="text-muted-foreground block mb-1.5">الصلاحيات المفعلة:</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedIntegration.permissions.map((p) => (
                          <Badge key={p} variant="secondary" className="text-[9px] font-mono bg-background">{p}</Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column: Request Builder & Response Inspector (8 cols) */}
            <div className="lg:col-span-8 space-y-6">
              <Card className="border-border/60 shadow-sm">
                <CardHeader className="p-5 pb-4 border-b border-border/40">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge className={`font-mono text-xs border ${getMethodBadgeColor(selectedEndpoint.method)}`}>
                          {selectedEndpoint.method}
                        </Badge>
                        <span className="font-mono text-sm font-semibold text-foreground">
                          /api/{apiVersion}{selectedEndpoint.path}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{selectedEndpoint.description}</p>
                    </div>

                    <Button
                      onClick={handleExecute}
                      disabled={loading || !hasPermission}
                      className="gap-2 h-9 px-4 shrink-0"
                    >
                      {loading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 fill-current" />
                      )}
                      تنفيذ الطلب
                    </Button>
                  </div>

                  {!hasPermission && (
                    <div className="mt-3 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-destructive text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>
                        القناة المحددة لا تملك الصلاحية المطلوبة (<code className="font-mono">{selectedEndpoint.permission}</code>).
                      </span>
                    </div>
                  )}
                </CardHeader>

                <CardContent className="p-5 space-y-4">
                  {/* Path Params */}
                  {selectedEndpoint.pathParams && (
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">المعاملات (Path Parameters)</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {selectedEndpoint.pathParams.map((param) => (
                          <div key={param} className="space-y-1">
                            <span className="text-[11px] text-muted-foreground font-mono">:{param}</span>
                            <Input
                              value={pathParamValues[param] || ''}
                              onChange={(e) => setPathParamValues({ ...pathParamValues, [param]: e.target.value })}
                              className="h-8 text-xs font-mono"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Headers Controls */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground font-mono">X-Branch-ID (اختياري)</Label>
                      <Input
                        value={branchHeader}
                        onChange={(e) => setBranchHeader(e.target.value)}
                        placeholder="branch_1"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                    {selectedEndpoint.id === 'create_order' && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground font-mono">Idempotency-Key</Label>
                          <button
                            onClick={() => setIdempotencyKey(`play_${generateUuid().slice(0, 16)}`)}
                            className="text-[10px] text-primary hover:underline"
                          >
                            توليد جديد
                          </button>
                        </div>
                        <Input
                          value={idempotencyKey}
                          onChange={(e) => setIdempotencyKey(e.target.value)}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                    )}
                  </div>

                  {/* Request Body Editor */}
                  {['POST', 'PATCH', 'PUT'].includes(selectedEndpoint.method) && (
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">محتوى الطلب (JSON Request Body)</Label>
                      <textarea
                        value={requestBodyText}
                        onChange={(e) => setRequestBodyText(e.target.value)}
                        rows={7}
                        className="w-full font-mono text-xs bg-muted/30 border border-border/60 rounded-lg p-3 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Response Inspector & Code Generation */}
              {executionResult && (
                <Card className="border-border/60 shadow-sm animate-in fade-in-50 duration-200">
                  <CardHeader className="p-4 border-b border-border/40 bg-muted/20">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <Badge
                          className={`font-mono text-xs ${
                            executionResult.status_code < 400
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                          }`}
                        >
                          {executionResult.status_code} {executionResult.status_code === 200 ? 'OK' : executionResult.status_code === 201 ? 'Created' : 'Error'}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                          <Clock className="w-3.5 h-3.5" />
                          {executionResult.duration_ms} ms
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground font-mono">
                          ID: {executionResult.request_id}
                        </span>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-0">
                    <Tabs defaultValue="response" className="w-full">
                      <TabsList className="w-full justify-start rounded-none border-b border-border/40 bg-transparent px-4 h-10">
                        <TabsTrigger value="response" className="text-xs">الاستجابة (Response)</TabsTrigger>
                        <TabsTrigger value="headers" className="text-xs">الترويسات (Headers)</TabsTrigger>
                        <TabsTrigger value="curl" className="text-xs">cURL</TabsTrigger>
                        <TabsTrigger value="sdk" className="text-xs font-semibold text-primary">@rms/sdk</TabsTrigger>
                        <TabsTrigger value="javascript" className="text-xs">JavaScript</TabsTrigger>
                      </TabsList>

                      <TabsContent value="response" className="p-4 m-0 relative">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopy(JSON.stringify(executionResult.body, null, 2), 'response')}
                          className="absolute top-6 left-6 h-7 text-xs gap-1"
                        >
                          {copiedTab === 'response' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          نسخ
                        </Button>
                        <pre className="font-mono text-xs bg-muted/40 p-4 rounded-lg overflow-x-auto max-h-96 text-foreground">
                          {JSON.stringify(executionResult.body, null, 2)}
                        </pre>
                      </TabsContent>

                      <TabsContent value="headers" className="p-4 m-0">
                        <div className="space-y-1 font-mono text-xs bg-muted/30 p-3 rounded-lg">
                          {Object.entries(executionResult.headers).map(([k, v]) => (
                            <div key={k} className="flex items-center justify-between py-1 border-b border-border/20 last:border-0">
                              <span className="text-muted-foreground">{k}:</span>
                              <span className="text-foreground">{v as string}</span>
                            </div>
                          ))}
                        </div>
                      </TabsContent>

                      <TabsContent value="curl" className="p-4 m-0 relative">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopy(executionResult.code_examples.curl, 'curl')}
                          className="absolute top-6 left-6 h-7 text-xs gap-1"
                        >
                          {copiedTab === 'curl' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          نسخ
                        </Button>
                        <pre className="font-mono text-xs bg-muted/40 p-4 rounded-lg overflow-x-auto text-foreground">
                          {executionResult.code_examples.curl}
                        </pre>
                      </TabsContent>

                      <TabsContent value="sdk" className="p-4 m-0 relative">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopy(executionResult.code_examples.sdk, 'sdk')}
                          className="absolute top-6 left-6 h-7 text-xs gap-1"
                        >
                          {copiedTab === 'sdk' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          نسخ
                        </Button>
                        <pre className="font-mono text-xs bg-muted/40 p-4 rounded-lg overflow-x-auto text-primary">
                          {executionResult.code_examples.sdk}
                        </pre>
                      </TabsContent>

                      <TabsContent value="javascript" className="p-4 m-0 relative">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopy(executionResult.code_examples.javascript, 'javascript')}
                          className="absolute top-6 left-6 h-7 text-xs gap-1"
                        >
                          {copiedTab === 'javascript' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          نسخ
                        </Button>
                        <pre className="font-mono text-xs bg-muted/40 p-4 rounded-lg overflow-x-auto text-foreground">
                          {executionResult.code_examples.javascript}
                        </pre>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* REAL-TIME LIVE EVENTS TAB */}
        {activeTab === 'realtime' && (
          <div className="space-y-6">
            {/* Real-Time Controls Bar */}
            <Card className="border-border/60 shadow-sm">
              <CardContent className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Protocol Selector */}
                  <div className="flex items-center bg-muted/60 p-1 rounded-lg border border-border/40">
                    <button
                      onClick={() => setRtProtocol('sse')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                        rtProtocol === 'sse' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      SSE (Server-Sent Events)
                    </button>
                    <button
                      onClick={() => setRtProtocol('ws')}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                        rtProtocol === 'ws' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      WebSocket
                    </button>
                  </div>

                  {/* Filter by Event Type */}
                  <div className="w-48">
                    <Select value={rtEventTypeFilter} onValueChange={setRtEventTypeFilter}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="فلتر نوع الحدث" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">كل الأحداث (All Events)</SelectItem>
                        <SelectItem value="order.created">order.created</SelectItem>
                        <SelectItem value="order.status_changed">order.status_changed</SelectItem>
                        <SelectItem value="menu.updated">menu.updated</SelectItem>
                        <SelectItem value="delivery.status_changed">delivery.status_changed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">الحالة:</span>
                    {rtConnected ? (
                      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1.5 py-0.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        متصل
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1.5 py-0.5">
                        <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                        غير متصل
                      </Badge>
                    )}
                  </div>

                  <Button
                    onClick={toggleRealtimeConnect}
                    disabled={rtConnecting}
                    variant={rtConnected ? 'destructive' : 'default'}
                    size="sm"
                    className="h-8 gap-1.5"
                  >
                    {rtConnecting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : rtConnected ? (
                      <>
                        <WifiOff className="w-3.5 h-3.5" />
                        قطع الاتصال
                      </>
                    ) : (
                      <>
                        <Wifi className="w-3.5 h-3.5" />
                        بدء البث المباشر
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Simulated Triggers & Live Events Stream Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Simulated Event Triggers (4 cols) */}
              <div className="lg:col-span-4 space-y-4">
                <Card className="border-border/60 shadow-sm">
                  <CardHeader className="p-4 pb-3 border-b border-border/40">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      محاكاة إرسال حدث (Simulate Event)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-2.5">
                    <p className="text-xs text-muted-foreground mb-3">
                      يمكنك تجربة إطلاق أحداث فورية لاختبار استجابة البث المباشر:
                    </p>
                    <Button
                      onClick={() => handleSimulateEvent('order.created')}
                      disabled={!rtConnected}
                      variant="outline"
                      className="w-full justify-start text-xs h-8 gap-2 font-mono"
                    >
                      <Badge variant="secondary" className="text-[9px] bg-emerald-500/10 text-emerald-500">POST</Badge>
                      order.created
                    </Button>
                    <Button
                      onClick={() => handleSimulateEvent('order.status_changed')}
                      disabled={!rtConnected}
                      variant="outline"
                      className="w-full justify-start text-xs h-8 gap-2 font-mono"
                    >
                      <Badge variant="secondary" className="text-[9px] bg-amber-500/10 text-amber-500">PATCH</Badge>
                      order.status_changed
                    </Button>
                    <Button
                      onClick={() => handleSimulateEvent('menu.updated')}
                      disabled={!rtConnected}
                      variant="outline"
                      className="w-full justify-start text-xs h-8 gap-2 font-mono"
                    >
                      <Badge variant="secondary" className="text-[9px] bg-blue-500/10 text-blue-500">PUT</Badge>
                      menu.updated
                    </Button>
                    <Button
                      onClick={() => handleSimulateEvent('delivery.status_changed')}
                      disabled={!rtConnected}
                      variant="outline"
                      className="w-full justify-start text-xs h-8 gap-2 font-mono"
                    >
                      <Badge variant="secondary" className="text-[9px] bg-purple-500/10 text-purple-500">PATCH</Badge>
                      delivery.status_changed
                    </Button>
                  </CardContent>
                </Card>

                <Card className="border-border/60 bg-muted/20">
                  <CardContent className="p-4 space-y-2 text-xs">
                    <span className="font-semibold text-foreground block">SDK Subscription Example:</span>
                    <pre className="font-mono text-[10px] bg-background p-2.5 rounded border border-border/40 overflow-x-auto text-primary">
{`const stream = rms.events.subscribe({
  types: ['order.status_changed']
});

stream.on('event', (evt) => {
  console.log(evt.data);
});`}
                    </pre>
                  </CardContent>
                </Card>
              </div>

              {/* Right Column: Live Events Console (8 cols) */}
              <div className="lg:col-span-8 space-y-4">
                <Card className="border-border/60 shadow-sm">
                  <CardHeader className="p-4 pb-3 border-b border-border/40 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Radio className="w-4 h-4 text-primary animate-pulse" />
                      سجل البث المباشر ({liveEvents.length} حدث)
                    </CardTitle>
                    {liveEvents.length > 0 && (
                      <Button
                        onClick={() => setLiveEvents([])}
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        مسح السجل
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="p-4 max-h-[600px] overflow-y-auto space-y-3">
                    {liveEvents.length === 0 ? (
                      <div className="text-center py-16 text-muted-foreground text-xs space-y-2">
                        <Wifi className="w-8 h-8 mx-auto opacity-30" />
                        <p>لا توجد أحداث واردة حالياً.</p>
                        <p className="text-[11px]">اضغط على "بدء البث المباشر" أو قم بتنفيذ طلب من قسم REST API.</p>
                      </div>
                    ) : (
                      liveEvents
                        .filter((e) => rtEventTypeFilter === 'all' || e.type === rtEventTypeFilter)
                        .map((evt) => (
                          <div
                            key={evt.id}
                            className="p-3.5 rounded-lg border border-border/60 bg-muted/20 space-y-2 font-mono text-xs animate-in fade-in-50 duration-200"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/20 pb-2">
                              <div className="flex items-center gap-2">
                                <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                                  {evt.type}
                                </Badge>
                                <span className="text-[11px] text-muted-foreground">{evt.id}</span>
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                <span>{evt.received_at}</span>
                                <span>req: {evt.request_id}</span>
                              </div>
                            </div>
                            <pre className="text-[11px] bg-background/80 p-2.5 rounded border border-border/30 overflow-x-auto text-foreground">
                              {JSON.stringify(evt.data, null, 2)}
                            </pre>
                          </div>
                        ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* Destructive Action Confirmation Dialog */}
        <Dialog open={isDestructiveModalOpen} onOpenChange={setIsDestructiveModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-warning">
                <AlertTriangle className="w-5 h-5" />
                تأكيد عملية إنشاء أو تعديل بيانات
              </DialogTitle>
              <DialogDescription className="pt-2">
                هذا الطلب سيقوم بإنشاء طلب حقيقي أو تعديل بيانات داخل النظام (<code className="font-mono text-xs">{selectedEndpoint.method} {selectedEndpoint.path}</code>). هل ترغب في المتابعة؟
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setIsDestructiveModalOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleExecute} className="bg-warning text-warning-foreground hover:bg-warning/90">
                تأكيد وتنفيذ الطلب
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
