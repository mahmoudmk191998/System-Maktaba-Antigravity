/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '@/lib/store';
import { useFormatters } from '@/lib/formatters';
import { useNotificationsStore } from '@/lib/notifications.store';
import { useTenantBranch, useMenuCategories, useMenuItems, useTables, useOrders, usePOSShift, useCustomers, useDelivery, useBranchStock, useRecipes } from '@/hooks/useDatabase';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { Sidebar, SidebarContent } from '@/components/layout/Sidebar';
import { useTheme } from '@/hooks/useTheme';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  Search, Plus, Minus, Trash2, CreditCard, Banknote, Wallet, Receipt, UserPlus,
  Users, Utensils, Bike, ShoppingBag, MapPin, Clock, Percent, X, Printer, CheckCircle, Menu, Moon, Sun, LogOut, Shield, CircleUser, ChefHat, Package, Calculator, Settings2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, orderBy, addDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { notifyNewOrder } from '@/services/notifications.service';

type OrderType = 'dine_in' | 'takeaway' | 'delivery';

const orderTypes = [
  { id: 'dine_in' as const, label: 'صالة', icon: Utensils },
  { id: 'takeaway' as const, label: 'تيك أواي', icon: ShoppingBag },
  { id: 'delivery' as const, label: 'توصيل', icon: Bike },
];

export default function POS() {
  const { cart, addToCart, removeFromCart, updateCartItemQuantity, clearCart, settings } = useAppStore();
  const { addNotification } = useNotificationsStore();
  const { currency, number } = useFormatters();
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const { tenantId, branchId } = useTenantBranch();
  const { categories } = useMenuCategories(tenantId);
  const { items: menuItems } = useMenuItems(tenantId);
  const { tables } = useTables(branchId);
  const { createOrder } = useOrders(tenantId, branchId);
  const { customers, addCustomer, updateCustomer } = useCustomers(tenantId);
  const { drivers, deliveryZones } = useDelivery(tenantId);
  const { activeShift, loading: shiftLoading, startShift, closeShift } = usePOSShift(tenantId, branchId, user?.uid);
  const { stock } = useBranchStock(branchId);
  const { recipes } = useRecipes(tenantId);
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const roleDisplay = {
    admin: { label: 'مدير النظام', color: 'text-rose-500 bg-rose-500/10 border-rose-500/20', icon: Shield },
    cashier: { label: 'كاشير', color: 'text-blue-500 bg-blue-500/10 border-blue-500/20', icon: CreditCard },
    waiter: { label: 'نادل', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20', icon: CircleUser },
    chef: { label: 'شيف', color: 'text-orange-500 bg-orange-500/10 border-orange-500/20', icon: ChefHat },
    manager: { label: 'مدير الفرع', color: 'text-purple-500 bg-purple-500/10 border-purple-500/20', icon: Shield },
    inventory: { label: 'أمين مخزن', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20', icon: Package },
    hr: { label: 'موارد بشرية', color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20', icon: Users },
    accountant: { label: 'محاسب', color: 'text-teal-500 bg-teal-500/10 border-teal-500/20', icon: Calculator },
    default: { label: 'موظف', color: 'text-muted-foreground bg-muted border-muted-foreground/20', icon: CircleUser }
  };

  const userRole = profile?.role || 'default';
  const RoleIcon = roleDisplay[userRole as keyof typeof roleDisplay]?.icon || roleDisplay.default.icon;
  const roleColor = roleDisplay[userRole as keyof typeof roleDisplay]?.color || roleDisplay.default.color;
  const roleLabel = roleDisplay[userRole as keyof typeof roleDisplay]?.label || userRole;

  const displayName = user?.email ? user.email.split('@')[0] : profile?.full_name || 'موظف';



  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [showTableSelector, setShowTableSelector] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showDiscountDialog, setShowDiscountDialog] = useState(false);
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false);
  const [showShiftReport, setShowShiftReport] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [completedOrder, setCompletedOrder] = useState<any>(null);
  const [shiftOrders, setShiftOrders] = useState<any[]>([]);
  const [shiftExpenses, setShiftExpenses] = useState<any[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const isMobile = useIsMobile();

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');

  const [startingCashInput, setStartingCashInput] = useState('');
  const [actualCashInput, setActualCashInput] = useState('');
  const [shortageReason, setShortageReason] = useState('');
  const [isStartingShift, setIsStartingShift] = useState(false);
  const [isClosingShift, setIsClosingShift] = useState(false);

  // Drawer Security State
  const [showDrawerPasswordPrompt, setShowDrawerPasswordPrompt] = useState(false);
  const [drawerPasswordInput, setDrawerPasswordInput] = useState('');

  // Takeaway Customer Feature
  const [customerSearchText, setCustomerSearchText] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedDeliveryZoneId, setSelectedDeliveryZoneId] = useState<string | null>(null);
  const [isDeliveryFeeWaived, setIsDeliveryFeeWaived] = useState(false);

  // Cash Drawer Connection & Kicking State
  const [drawerConnectionType, setDrawerConnectionType] = useState<'driver' | 'serial'>(
    (localStorage.getItem('sys_drawer_type') as 'driver' | 'serial') || 'driver'
  );
  const [serialPort, setSerialPort] = useState<any>(null);
  const [showDrawerConfig, setShowDrawerConfig] = useState(false);

  useEffect(() => {
    if (drawerConnectionType === 'serial' && 'serial' in navigator) {
      navigator.serial.getPorts().then((ports) => {
        if (ports.length > 0) {
          setSerialPort(ports[0]);
        }
      }).catch(err => console.error("Error auto-fetching serial ports:", err));
    }
  }, [drawerConnectionType]);

  const handleConnectSerial = async () => {
    try {
      if (!('serial' in navigator)) {
        toast.error('متصفحك لا يدعم الاتصال المباشر (Web Serial API). يرجى استخدام متصفح Chrome أو Edge.');
        return;
      }
      const port = await navigator.serial.requestPort();
      setSerialPort(port);
      toast.success('تم ربط منفذ الكاشير التسلسلي بنجاح!');
    } catch (error: any) {
      console.error('Serial connection error:', error);
      toast.error('لم يتم اختيار منفذ أو حدث خطأ أثناء الاتصال.');
    }
  };

  const kickDrawerSerial = async () => {
    try {
      if (!('serial' in navigator)) {
        return false;
      }

      let port = serialPort;
      if (!port) {
        const ports = await navigator.serial.getPorts();
        if (ports.length > 0) {
          port = ports[0];
          setSerialPort(port);
        } else {
          return false;
        }
      }

      try {
        await port.open({ baudRate: 9600 });
      } catch (err: any) {
        if (!err.message.includes('already open')) {
          throw err;
        }
      }

      const writer = port.writable.getWriter();
      // ESC/POS drawer kick signals (Pin 2, Pin 5, and Star BEL)
      const data = new Uint8Array([27, 112, 0, 25, 250, 27, 112, 1, 25, 250, 7]);
      await writer.write(data);
      writer.releaseLock();
      return true;
    } catch (error: any) {
      console.error('Web Serial open drawer error:', error);
      return false;
    }
  };

  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const kickDrawer = async () => {
    if (drawerConnectionType === 'serial') {
      const success = await kickDrawerSerial();
      if (success) {
        return;
      }
    }

    // Standard Driver Print Fallback (using hidden iframe or popup)
    try {
      let iframe = document.getElementById('drawer-kick-iframe') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'drawer-kick-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = 'none';
        document.body.appendChild(iframe);
      }

      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(`
          <html>
            <head>
              <style>
                @media print {
                  body { margin: 0; padding: 0; }
                  @page { size: 58mm 10mm; margin: 0; }
                }
              </style>
            </head>
            <body>.</body>
          </html>
        `);
        doc.close();
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      }
    } catch (error) {
      console.error('Error kicking drawer via iframe:', error);
      const w = window.open('', '', 'width=100,height=100');
      if (!w) {
        toast.error('يرجى السماح بالنوافذ المنبثقة (Pop-ups) لفتح الدرج');
        return;
      }
      w.document.write('<html><body>.</body></html>');
      w.document.close();
      w.focus();
      setTimeout(() => {
        w.print();
        w.close();
      }, 200);
    }
  };

  const handleManualDrawerOpen = () => {
    if (settings.openDrawerPassword) {
      setShowDrawerPasswordPrompt(true);
      setDrawerPasswordInput('');
    } else {
      kickDrawer();
      toast.success('تم إرسال أمر فتح الدرج');
    }
  };

  const verifyAndOpenDrawer = () => {
    if (drawerPasswordInput === settings.openDrawerPassword) {
      setShowDrawerPasswordPrompt(false);
      setDrawerPasswordInput('');
      kickDrawer();
      toast.success('تم إرسال أمر فتح الدرج');
    } else {
      toast.error('كلمة المرور غير صحيحة');
    }
  };

  const handleSelectCustomer = (customer: any) => {
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone || '');
    const firstAddr = customer.addresses?.[0];
    setCustomerAddress(firstAddr ? firstAddr.address : (customer.address || ''));
    setSelectedCustomerId(customer.id);
    setSelectedDeliveryZoneId(firstAddr ? (firstAddr.delivery_zone_id || null) : (customer.delivery_zone_id || null));
    setCustomerSearchText('');
    setShowCustomerDropdown(false);
    toast.info(`تم اختيار العميل: ${customer.name}`);

    const currentTiers = settings?.loyaltyTiers || [];
    const sortedTiers = [...currentTiers].sort((a,b) => b.minPoints - a.minPoints);
    const pts = customer.points || 0;
    const tier = sortedTiers.find(t => pts >= t.minPoints);

    if (tier && tier.discount > 0) {
      setDiscountType('percent');
      setDiscountPercent(tier.discount);
      toast.success(`تم تطبيق خصم الفئة ${tier.name} بنسبة ${tier.discount}% تلقائياً`);
    } else {
      setDiscountPercent(0);
      setDiscountAmount(0);
    }
  };

  const handleClearCustomer = () => {
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setSelectedCustomerId(null);
    setSelectedDriverId(null);
    setSelectedDeliveryZoneId(null);
    setDiscountPercent(0);
    setDiscountAmount(0);
    setIsDeliveryFeeWaived(false);
  };

  const filteredItems = useMemo(() => {
    return menuItems.filter((item: any) => {
      const matchesSearch = searchQuery
        ? item.name.includes(searchQuery) || item.name_en?.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      const matchesCategory = selectedCategory ? item.category_id === selectedCategory : true;
      return matchesSearch && matchesCategory && item.is_available !== false;
    });
  }, [searchQuery, selectedCategory, menuItems]);

  const selectedZone = useMemo(() => {
    if (orderType !== 'delivery' || !selectedDeliveryZoneId) return null;
    return deliveryZones.find((z: any) => z.id === selectedDeliveryZoneId);
  }, [orderType, selectedDeliveryZoneId, deliveryZones]);

  const deliveryFee = (selectedZone && !isDeliveryFeeWaived) ? Number(selectedZone.fee || 0) : 0;

  const subtotal = cart.reduce((sum, item) => sum + item.menuItem.price * item.quantity, 0);
  const calcDiscount = discountType === 'percent' ? subtotal * (discountPercent / 100) : discountAmount;
  const total = Math.max(subtotal - calcDiscount + deliveryFee, 0);
  const selectedTableData = tables.find((t: any) => t.id === selectedTable);

  const handlePayment = async (method: string) => {
    const paymentMethodMap: Record<string, string> = { 'cash': 'cash', 'card': 'card', 'wallet': 'wallet' };

    let finalCustomerId = selectedCustomerId;
    let finalCustomerName = customerName || null;

    // Handle unregistered customer creation
    if (customerPhone && !finalCustomerId) {
      finalCustomerId = await addCustomer({
        name: customerName || 'عميل نقدي',
        phone: customerPhone,
        address: customerAddress || '',
        tier: 'none',
        points: 0,
        total_spent: 0,
        visits: 0,
        is_vip: false
      });
      if (finalCustomerId) toast.success('تم تسجيل العميل الجديد بنجاح');
    }

    // fallback for name to print it
    if (finalCustomerId && !finalCustomerName) {
      finalCustomerName = customers.find((c: any) => c.id === finalCustomerId)?.name || null;
    }

    const payload = {
      orderType,
      tableId: selectedTable,
      tableNumber: selectedTableData?.table_number,
      customerId: finalCustomerId,
      customerName: finalCustomerName,
      customerPhone: customerPhone || null,
      customerAddress: orderType === 'delivery' ? (customerAddress || null) : null,
      delivery_zone_id: orderType === 'delivery' ? (selectedDeliveryZoneId || null) : null,
      driver_id: orderType === 'delivery' ? (selectedDriverId || null) : null,
      subtotal,
      discount: calcDiscount,
      delivery_fee: deliveryFee,
      total,
      paymentMethod: paymentMethodMap[method],
      createdBy: user?.uid,
      shiftId: activeShift?.id,
      notes: orderNotes
    };

    const cartItemsData = cart.map(item => ({
      menuItemId: item.menuItem.id,
      categoryId: item.menuItem.categoryId || 'general',
      name: item.menuItem.name,
      quantity: item.quantity,
      unitPrice: item.menuItem.price,
      cost: item.menuItem.cost || 0
    }));

    const order = await createOrder(payload, cartItemsData);

    if (order) {
      // Update customer loyalty points and metrics
      if (finalCustomerId) {
         const existingCustomer = customers.find((c: any) => c.id === finalCustomerId);
         const newTotalSpent = (existingCustomer?.total_spent || 0) + total;
         const newPoints = (existingCustomer?.points || 0) + Math.floor(total);
         const newVisits = (existingCustomer?.visits || 0) + 1;
         
         const currentTiers = settings?.loyaltyTiers || [];
         const sortedTiers = [...currentTiers].sort((a,b) => b.minPoints - a.minPoints);
         const computedTierObj = sortedTiers.find(t => newPoints >= t.minPoints);
         const computedTierId = computedTierObj ? computedTierObj.id : 'none';

         updateCustomer(finalCustomerId, {
            total_spent: newTotalSpent,
            points: newPoints,
            visits: newVisits,
            tier: computedTierId,
            last_visit: new Date().toISOString()
         });
      }

      setCompletedOrder({
        orderNumber: order.order_number, date: new Date(), type: orderType, table: selectedTableData,
        customerName: finalCustomerName, customerAddress: payload.customerAddress,
        deliveryZoneId: payload.delivery_zone_id,
        items: [...cart], subtotal, discount: calcDiscount, deliveryFee,
        discountPercent: discountType === 'percent' ? discountPercent : 0,
        total, paymentMethod: method, notes: orderNotes
      });
      setShowPaymentDialog(false);
      setShowInvoiceDialog(true);
      clearCart(); // Auto clear the actual basket upon strict success
      
      // Automatically open the cash drawer for every successful sale
      kickDrawer();
      notifyNewOrder(branchId, order.id || `ord_${Date.now()}`, order.order_number, total);
    }
  };

  const handleCloseInvoice = () => {
    setShowInvoiceDialog(false);
    setDiscountPercent(0);
    setDiscountAmount(0);
    setSelectedTable(null);
    setCompletedOrder(null);
    setCustomerSearchText('');
    setOrderNotes('');
    handleClearCustomer();
  };

  const handleCloseShift = async () => {
    if (!tenantId) return;
    try {
      const ordersQ = query(
        collection(db, 'orders'),
        where('shift_id', '==', activeShift.id)
      );
      const ordersSnap = await getDocs(ordersQ);
      const ordersData = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() as any, payments: [], order_items: [] }));

      if (ordersData.length > 0) {
        await Promise.all(ordersData.map(async (o) => {
          const pQ = query(collection(db, 'payments'), where('order_id', '==', o.id));
          const pSnap = await getDocs(pQ);
          o.payments = pSnap.docs.map(d => d.data());

          const iQ = query(collection(db, 'order_items'), where('order_id', '==', o.id));
          const iSnap = await getDocs(iQ);
          o.order_items = iSnap.docs.map(d => d.data());
        }));
      }
      setShiftOrders(ordersData);

      const expensesQ = query(collection(db, 'expenses'), where('shift_id', '==', activeShift.id));
      const expSnap = await getDocs(expensesQ);
      setShiftExpenses(expSnap.docs.map(d => d.data()));
    } catch (e) {
      console.error('Error fetching shift details:', e);
    }
    setShowShiftReport(true);
  };

  const paymentMethodLabel = (method: string) => {
    switch (method) { case 'cash': return 'نقداً'; case 'card': return 'بطاقة ائتمان'; case 'wallet': return 'محفظة إلكترونية'; default: return method; }
  };

  const checkStockAvailability = (menuItemId: string, additionalQty: number) => {
    if (!stock || stock.length === 0 || !recipes || recipes.length === 0) return true;

    const requiredIngs = new Map<string, { name: string, qty: number }>();

    // 1. Calculate ingredients for the existing cart
    cart.forEach(cItem => {
      const r = recipes.find((x: any) => x.menu_item_id === cItem.id);
      if (r && r.recipe_ingredients) {
        r.recipe_ingredients.forEach((ri: any) => {
          const req = Number(ri.quantity) * cItem.quantity;
          const existing = requiredIngs.get(ri.item_id) || { name: ri.inventory_items?.name || 'مكون', qty: 0 };
          requiredIngs.set(ri.item_id, { name: existing.name, qty: existing.qty + req });
        });
      }
    });

    // 2. Add ingredients for the new item being requested
    const rNew = recipes.find((x: any) => x.menu_item_id === menuItemId);
    if (rNew && rNew.recipe_ingredients) {
      rNew.recipe_ingredients.forEach((ri: any) => {
        const req = Number(ri.quantity) * additionalQty;
        const existing = requiredIngs.get(ri.item_id) || { name: ri.inventory_items?.name || 'مكون', qty: 0 };
        requiredIngs.set(ri.item_id, { name: existing.name, qty: existing.qty + req });
      });
    }

    // 3. Verify against branch_stock
    for (const [itemId, req] of requiredIngs.entries()) {
      const currentStock = stock.find((s: any) => s.item_id === itemId);
      const available = currentStock ? Number(currentStock.quantity) : 0;
      if (req.qty > available) {
        toast.error(`المخزون غير كافٍ. المتوفر من ${req.name}: ${available} ومطلوب ${req.qty}`);
        return false;
      }
    }
    return true;
  };

  const handleIncreaseQuantity = (itemId: string, newQuantity: number) => {
    if (!checkStockAvailability(itemId, 1)) return;
    updateCartItemQuantity(itemId, newQuantity);
  };

  const addItemToCart = (dbItem: any) => {
    if (!checkStockAvailability(dbItem.id, 1)) return;

    addToCart({
      id: dbItem.id, categoryId: dbItem.category_id || '', name: dbItem.name, nameEn: dbItem.name_en,
      description: dbItem.description, price: Number(dbItem.price), cost: Number(dbItem.cost) || 0, image: dbItem.image_url,
      isAvailable: dbItem.is_available !== false, preparationTime: dbItem.preparation_time || 15,
      calories: dbItem.calories, allergens: dbItem.allergens,
    });
  };

  const confirmedShiftOrders = shiftOrders.filter(o => ['ready', 'completed', 'delivered'].includes(o.status));

  const shiftTotalSales = confirmedShiftOrders.reduce((sum, o) => sum + Math.max(0, Number(o.total || 0) - Number(o.delivery_fee || o.deliveryFee || 0)), 0);
  const shiftCash = confirmedShiftOrders.reduce((sum, o) => sum + (o.payments || []).filter((p: any) => p.method === 'cash').reduce((s: number, p: any) => s + Number(p.amount), 0), 0);
  const shiftCard = confirmedShiftOrders.reduce((sum, o) => sum + (o.payments || []).filter((p: any) => p.method === 'card').reduce((s: number, p: any) => s + Number(p.amount), 0), 0);
  const shiftWallet = confirmedShiftOrders.reduce((sum, o) => sum + (o.payments || []).filter((p: any) => p.method === 'wallet').reduce((s: number, p: any) => s + Number(p.amount), 0), 0);
  const shiftTotalExpenses = shiftExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const totalDeliveryFees = confirmedShiftOrders.reduce((sum, o) => sum + Number(o.delivery_fee || o.deliveryFee || 0), 0);

  const expectedCash = (activeShift?.starting_cash || 0) + shiftCash - shiftTotalExpenses - totalDeliveryFees;
  const actualCash = Number(actualCashInput) || 0;
  const discrepancy = actualCash - expectedCash;

  const printShiftReport = () => {
    const w = window.open('', '', 'width=400,height=600');
    if (!w) return;

    const employeeName = displayName;
    const deliveryCount = confirmedShiftOrders.filter(o => o.order_type === 'delivery').length;
    const takeawayCount = confirmedShiftOrders.filter(o => o.order_type === 'takeaway').length;
    const dineinCount = confirmedShiftOrders.filter(o => o.order_type === 'dine_in').length;

    const expensesHTML = shiftExpenses.length > 0
      ? shiftExpenses.map(e => `<div class="row"><span>${e.description || 'مصروف'}</span><span>${currency(Number(e.amount))}</span></div>`).join('')
      : `<div class="row text-center"><span style="color:#666; font-size: 11px;">لا توجد مصروفات</span></div>`;

    w.document.write(`
      <html dir="rtl">
        <head>
          <meta charset="utf-8">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Cairo', sans-serif; }
            @page { margin: 0; }
              body { width: 100%; max-width: 80mm; padding: 2mm; font-size: 12px; color: #000; background: #fff; margin: 0 auto; -webkit-print-color-adjust: exact; }
            .center { text-align: center; }
            .logo { max-width: 50mm; max-height: 25mm; object-fit: contain; margin-bottom: 8px; }
            h1 { font-size: 18px; margin-bottom: 4px; font-weight: 900; }
            h2 { font-size: 15px; margin-top: 10px; margin-bottom: 5px; font-weight: bold; background: #eee; padding: 2px 5px; border-radius: 4px; border: 1px solid #ccc; text-align: center; }
            .row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 1px dashed #ddd; font-weight: 600;}
            .row:last-child { border-bottom: none; }
            .row-bold { display: flex; justify-content: space-between; padding: 5px 0; font-weight: 900; font-size: 14px; border-bottom: 1px solid #000; margin-top: 2px; }
            .line { border-top: 1px dashed #000; margin: 8px 0; }
          </style>
        </head>
        <body>
          <div class="center">
            ${settings.invoiceLogo ? `<img src="${settings.invoiceLogo}" class="logo" />` : ''}
            <h1>${settings.invoiceCompanyName || 'MK'}</h1>
            <h1 style="border: 2px solid #000; padding: 4px; border-radius: 8px; margin: 8px 0; background: #f9f9f9; font-size: 16px;">تقرير تفصيلي لشيفت المبيعات</h1>
          </div>
          
          <div class="row"><span>وقت الفتح:</span> <span>${activeShift?.start_time ? new Date(activeShift.start_time).toLocaleString('ar-EG') : '-'}</span></div>
          <div class="row"><span>وقت الإغلاق:</span> <span>${new Date().toLocaleString('ar-EG')}</span></div>
          <div class="row"><span>الموظف:</span> <span>${employeeName} (${roleLabel})</span></div>
          <div class="row-bold"><span>إجمالي الطلبات المُنفذة:</span> <span>${confirmedShiftOrders.length} طلب</span></div>

          <h2>تفاصيل المبيعات (الدخل)</h2>
          <div class="row"><span>إجمالي قيمة المبيعات:</span> <span>${currency(shiftTotalSales)}</span></div>
          <div class="row"><span>مدفوعات الكاش:</span> <span>${currency(shiftCash)}</span></div>
          <div class="row"><span>مدفوعات الشبكة (بطاقة):</span> <span>${currency(shiftCard)}</span></div>
          <div class="row"><span>مدفوعات المحفظة:</span> <span>${currency(shiftWallet)}</span></div>

          <h2>أنواع الطلبات المبيعة</h2>
          <div class="row"><span>توصيل (دليفري):</span> <span>${deliveryCount}</span></div>
          <div class="row"><span>استلام (تيك أواي):</span> <span>${takeawayCount}</span></div>
          <div class="row"><span>محلي (صالة):</span> <span>${dineinCount}</span></div>
          
          <h2>المصروفات والسحوبات</h2>
          ${expensesHTML}
          <div class="row-bold"><span>إجمالي المصروفات المسحوبة:</span> <span>${currency(shiftTotalExpenses)}</span></div>

          <h2>تسوية الدرج والعهد</h2>
          <div class="row"><span>رصيد الدرج الافتتاحي:</span> <span>${currency(activeShift?.starting_cash || 0)}</span></div>
          ${totalDeliveryFees > 0 ? `<div class="row"><span>رسوم التوصيل المحصلة:</span> <span>${currency(totalDeliveryFees)}</span></div>` : ''}
          <div class="row-bold"><span>النقد المتوقع بالدرج:</span> <span>${currency(expectedCash)}</span></div>
          <div class="row" style="margin-top: 5px;"><span>المبلغ الفعلي المُدخل:</span> <span style="font-size: 16px; border: 1px solid #000; padding: 0 4px; border-radius: 4px; font-weight: 900;">${currency(actualCash)}</span></div>
          <div class="row-bold"><span style="color: ${discrepancy < 0 ? '#ff0000' : 'inherit'};">العجز / الزيادة:</span> <span style="color: ${discrepancy < 0 ? '#ff0000' : 'inherit'};">${discrepancy > 0 ? '+' : ''}${currency(discrepancy)}</span></div>
          ${discrepancy < 0 && shortageReason ? `<div class="row" style="color: #ff0000; border:1px solid #ff0000; padding:4px; margin-top:4px; border-radius:4px; flex-direction: column;">
            <span style="font-size: 10px;">سُجل عجز بالدرج بسبب:</span> 
            <span style="font-weight: normal; margin-top: 2px;">${shortageReason}</span>
          </div>` : ''}

          <div class="line"></div>
          <div class="center" style="margin-top: 25px; margin-bottom: 20px;">
            <p style="font-weight: 900; margin-bottom: 30px; font-size: 14px;">توقيع الكاشير المتسلم / المدير المراجع</p>
            <p style="border-bottom: 1px solid #000; width: 70%; margin: 0 auto;"></p>
          </div>
          <div class="center">
            <p style="margin-top: 10px; font-size: 10px; color: #555;">تم طباعة التقرير بواسطة النظام تلقائياً عند إغلاق الشيفت</p>
          </div>
        </body>
      </html>
    `);
    w.document.close();

    setTimeout(() => {
      w.print();
      w.close();
    }, 500);
  };

  const confirmCloseShift = async () => {
    setIsClosingShift(true);
    const totals = {
      total_sales: shiftTotalSales,
      cash_sales: shiftCash,
      card_sales: shiftCard,
      wallet_sales: shiftWallet,
      shift_expenses: shiftTotalExpenses,
      expected_cash: expectedCash,
      actual_cash: actualCash,
      discrepancy: discrepancy,
      shortage_reason: discrepancy < 0 ? shortageReason : null
    };

    // Print the detailed shift report automatically
    printShiftReport();

    const success = await closeShift(activeShift.id, totals);
    if (success) {
      setShowShiftReport(false);
      setActualCashInput('');
      setShortageReason('');
    }
    setIsClosingShift(false);
  };

  const printInvoice = () => {
    const printContent = document.getElementById('invoice-print-area');
    if (!printContent) return;
    const w = window.open('', '', 'width=400,height=600');
    if (!w) return;
    w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><style>
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap');
      * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Cairo', sans-serif; }
      @page { margin: 0; }
              body { width: 100%; max-width: 80mm; padding: 2mm; font-size: 12px; color: #000; background: #fff; margin: 0 auto; -webkit-print-color-adjust: exact; }
      .center { text-align: center; }
      .bold { font-weight: 700; }
      .black { font-weight: 900; }
      .line { border-top: 1px dashed #000; margin: 6px 0; }
      .solid-line { border-top: 2px solid #000; margin: 6px 0; }
      .row { display: flex; justify-content: space-between; padding: 3px 0; }
      .total { font-size: 16px; font-weight: 900; }
      h1 { font-size: 20px; margin-bottom: 4px; font-weight: 900; }
      p { margin-bottom: 3px; font-weight: 700; }
      table { width: 100%; border-collapse: collapse; margin: 8px 0; }
      th { border-bottom: 1px dashed #000; padding: 4px 0; text-align: center; font-weight: 700; }
      th:first-child { text-align: right; }
      th:last-child { text-align: left; }
      td { padding: 4px 0; text-align: center; font-weight: 700; }
      td:first-child { text-align: right; }
      td:last-child { text-align: left; }
      .text-xs { font-size: 10px; }
      .text-sm { font-size: 12px; }
      .text-base { font-size: 14px; }
      .logo { max-width: 60mm; max-height: 25mm; object-fit: contain; margin-bottom: 8px; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 8px 0; padding: 6px; border: 1px solid #000; border-radius: 4px; }
      .info-grid div { display: flex; flex-direction: column; }
      .info-grid span:first-child { color: #555; font-size: 10px; font-weight: normal; }
      .info-grid span:last-child { font-weight: 700; font-size: 12px; }
      .text-muted { color: #555; }
      .col-span-2 { grid-column: span 2 / span 2; }
      .invoice-container { width: 100%; }
      /* Print Overrides */
      .bg-muted\\/30 { background: transparent !important; border: 1px solid #000 !important; }
      .bg-card { background: transparent !important; }
      .shadow-sm { box-shadow: none !important; }
      .border-2 { border: none !important; }
      .rounded-xl { border-radius: 0 !important; }
      .text-muted-foreground { color: #555 !important; }
      .text-primary, .text-success { color: #000 !important; }
      .border-dashed { border-style: dashed !important; border-color: #000 !important; }
      .page-break { page-break-before: always; margin-top: 10mm; }
    </style></head><body>
      <div class="invoice-container">${printContent.innerHTML}</div>
      <div class="page-break"></div>
      <div class="invoice-container">
        <div style="text-align:center; font-weight:bold; padding: 5px; border-bottom: 2px dashed #000; margin-bottom: 5px;">نسخة العميل</div>
        ${printContent.innerHTML}
      </div>
    </body></html>`);
    w.document.close();

    // Wait for images to load before printing
    setTimeout(() => {
      w.print();
      w.close();
    }, 500);
  };

  const handleAddExpense = async () => {
    if (!expenseAmount || !expenseDescription || !tenantId || !branchId || !activeShift) return;
    try {
      await addDoc(collection(db, 'expenses'), {
        tenantId: tenantId,
        branchId: branchId,
        amount: Number(expenseAmount),
        description: expenseDescription,
        category: 'مصروفات وردية',
        date: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        createdBy: user?.uid,
        shift_id: activeShift.id
      });
      toast.success('تم تسجيل المصروف بنجاح');
      setShowAddExpense(false);
      setExpenseAmount('');
      setExpenseDescription('');
    } catch (e) {
      console.error('Error adding expense:', e);
      toast.error('حدث خطأ أثناء تسجيل المصروف');
    }
  };

  const renderCartBody = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border/30 bg-muted/10 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold flex items-center gap-2 text-foreground">
            <Receipt className="w-6 h-6 text-primary drop-shadow-sm" />
            الفاتورة
          </h2>
          {cart.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { clearCart(); setOrderNotes(''); }}
              className="text-destructive font-semibold text-xs hover:bg-destructive/10 rounded-xl h-8 px-3"
            >
              <Trash2 className="w-4 h-4 ml-1.5" />
              إفراغ السلة
            </Button>
          )}
        </div>
      </div>
      <ScrollArea className="flex-1">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground/60 min-h-[300px]">
            <ShoppingBag className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="font-bold text-lg mb-1">السلة فارغة</p>
            <p className="text-sm">أضف أصناف من القائمة لبدء الطلب</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            <AnimatePresence initial={false}>
              {cart.map((item) => (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20, scale: 0.95 }} key={item.id} className="flex items-center gap-2 p-2.5 bg-background border shadow-sm rounded-xl">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold truncate text-sm">{item.menuItem.name}</h4>
                    <p className="text-xs text-primary font-bold">{currency(item.menuItem.price * item.quantity)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 bg-muted rounded-lg p-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-background" onClick={() => updateCartItemQuantity(item.id, item.quantity - 1)}><Minus className="w-3 h-3" /></Button>
                    <span className="w-6 text-center font-bold text-sm">{item.quantity}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-background" onClick={() => handleIncreaseQuantity(item.id, item.quantity + 1)}><Plus className="w-3 h-3" /></Button>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg ml-1" onClick={() => removeFromCart(item.id)}><X className="w-4 h-4" /></Button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </ScrollArea>
      {cart.length > 0 && (
        <div className="bg-muted/30 p-4 space-y-3 shrink-0 rounded-t-2xl shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] safe-area-bottom">
          <div className="space-y-1">
            <div className="flex justify-between text-sm font-medium"><span className="text-muted-foreground">المجموع الفرعي</span><span>{currency(subtotal)}</span></div>
            {calcDiscount > 0 && <div className="flex justify-between text-sm font-medium text-success"><span>الخصم</span><span>- {currency(calcDiscount)}</span></div>}
            {selectedZone && Number(selectedZone.fee || 0) > 0 && (
              <div className="flex justify-between items-center text-sm font-medium text-muted-foreground">
                <span className="flex items-center gap-2">
                  رسوم التوصيل
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("h-5 px-1.5 text-[10px]", isDeliveryFeeWaived ? "bg-primary/10 text-primary border border-primary/20" : "hover:bg-muted border border-transparent")}
                    onClick={() => setIsDeliveryFeeWaived(!isDeliveryFeeWaived)}
                  >
                    {isDeliveryFeeWaived ? 'إلغاء الإعفاء' : 'إعفاء'}
                  </Button>
                </span>
                {isDeliveryFeeWaived ? (
                  <div className="flex items-center gap-2">
                    <span className="line-through text-xs opacity-50">{currency(Number(selectedZone.fee))}</span>
                    <span className="text-success text-xs font-bold">مجاناً</span>
                  </div>
                ) : (
                  <span>+ {currency(deliveryFee)}</span>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-between text-xl font-black pt-3 border-t"><span>الإجمالي</span><span className="text-primary">{currency(total)}</span></div>
          <div className="pt-2">
            <Input placeholder="ملاحظات الطلب (اختياري)..." value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} className="h-10 text-sm bg-background border-dashed focus-visible:ring-primary shadow-sm rounded-xl mb-1" />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="outline" className="h-10 gap-2 text-sm bg-background border-dashed" onClick={() => setShowDiscountDialog(true)}><Percent className="w-4 h-4" />خصم</Button>
            <Button variant="outline" className="h-10 gap-2 text-sm bg-background" onClick={printInvoice}><Printer className="w-4 h-4" />تبويب</Button>
          </div>
          <Button
            className="w-full h-16 text-xl font-black gap-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-[0_8px_30px_rgb(16,185,129,0.3)] hover:shadow-[0_8px_30px_rgb(16,185,129,0.5)] transition-all duration-300 transform hover:-translate-y-1 border-0 rounded-xl mt-2"
            onClick={() => {
              setCartOpen(false);
              setShowPaymentDialog(true);
            }}
          >
            <div className="flex items-center justify-center bg-white/20 p-2 rounded-lg">
              <CreditCard className="w-6 h-6 text-white" />
            </div>
            <span className="drop-shadow-sm">ادفع {currency(total)}</span>
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="h-[100dvh] flex flex-col md:flex-row bg-background overflow-hidden relative">
      {/* Bottom Dock toggle for POS */}
      {sidebarOpen && <Sidebar />}

      <div className="flex-1 flex flex-col p-2 md:p-4 pb-20 md:pb-4 overflow-hidden min-h-0 bg-secondary/10">
        {/* Top bar */}
        <div className="flex items-center gap-1.5 sm:gap-3 mb-4 bg-card/60 backdrop-blur-md rounded-2xl p-2 sm:p-2.5 shadow-sm border border-border/50 max-w-full overflow-x-auto no-scrollbar">
          {isMobile ? (
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0 rounded-xl hover:bg-primary/10 hover:text-primary transition-colors">
                  <Menu className="w-4 h-4 text-foreground" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="p-0 w-72 border-l border-border/40 font-cairo">
                <SheetTitle className="sr-only">قائمة التنقل</SheetTitle>
                <SheetDescription className="sr-only">عناصر التنقل للنظام</SheetDescription>
                <SidebarContent isMobile={true} />
              </SheetContent>
            </Sheet>
          ) : (
            <Button variant="ghost" size="icon" className={cn("h-9 w-9 md:h-10 md:w-10 shrink-0 rounded-xl hover:bg-primary/10 hover:text-primary transition-colors", sidebarOpen && "bg-primary/10 text-primary")} onClick={() => setSidebarOpen(!sidebarOpen)}>
              <Menu className="w-4 h-4 md:w-5 md:h-5" />
            </Button>
          )}
          <div className="flex flex-col ml-1 min-w-0">
            <span className="font-bold text-xs md:text-sm leading-tight text-foreground truncate">{displayName}</span>
            <Badge variant="outline" className={cn('mt-0.5 gap-1 text-[10px] px-1.5 py-0 border bg-background/50 whitespace-nowrap', roleColor)}>
              <RoleIcon className="w-3 h-3" />
              <span className="mb-[1px]">{roleLabel}</span>
            </Badge>
          </div>
          <div className="flex-1 min-w-0" />
          <Button variant="ghost" size="icon" className="h-9 w-9 md:h-10 md:w-10 shrink-0 rounded-xl bg-background/50 hover:bg-muted" onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="w-4 h-4 md:w-5 md:h-5" /> : <Moon className="w-4 h-4 md:w-5 md:h-5 text-slate-700" />}
          </Button>
          
          {/* Cash Drawer Control Button & Settings Icon */}
          <div className="flex items-center gap-1">
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-1.5 h-10 px-3 text-xs md:text-sm font-semibold rounded-xl text-primary border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors shadow-sm" 
              onClick={handleManualDrawerOpen} 
            >
              <Printer className="w-4 h-4" /> فتح الدرج
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-xl hover:bg-muted"
              onClick={() => setShowDrawerConfig(true)}
              title="إعدادات درج الكاشير"
            >
              <Settings2 className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>

          <Button variant="outline" size="sm" className="gap-1.5 h-10 px-3 text-xs md:text-sm font-semibold rounded-xl text-orange-500 border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10 transition-colors" onClick={() => setShowAddExpense(true)} disabled={!activeShift}>
            <Banknote className="w-4 h-4" /> مصروف
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-10 px-3 text-xs md:text-sm font-semibold rounded-xl border-border/50 bg-background/50 hover:bg-muted transition-colors" onClick={handleCloseShift} disabled={!activeShift}>
            🔒 قفل الشيفت
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors ml-1" onClick={async () => { await signOut(); navigate('/auth'); }}>
            <LogOut className="w-5 h-5" />
          </Button>
        </div>

        {shiftLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !activeShift ? (
          <div className="flex-1 flex items-center justify-center p-4">
            <Card className="w-full max-w-md border-primary/20 shadow-xl overflow-hidden">
              <div className="bg-primary/5 p-6 border-b border-primary/10 text-center">
                <h2 className="text-2xl font-black">فتح الدرج وبدء الشيفت</h2>
              </div>
              <CardContent className="space-y-6 pt-6">
                <div className="flex flex-col items-center gap-4 mb-4">
                  <Wallet className="w-16 h-16 text-primary/30" />
                  <Button
                    className="gap-2 w-full h-14 text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 border-none shadow-md hover:shadow-lg transition-all"
                    onClick={handleManualDrawerOpen}
                  >
                    <Printer className="w-6 h-6" />
                    فتح الدرج يدوياً
                  </Button>
                </div>
                <div className="relative mb-6">
                  <label className="text-sm font-bold mb-3 block text-right text-muted-foreground whitespace-pre-wrap">النقدية الافتتاحية للمناوبة الجديدة</label>
                  <Input type="number" min={0} placeholder="المبلغ الافتتاحي بالدرج..." value={startingCashInput} onChange={(e) => setStartingCashInput(e.target.value)} disabled={isStartingShift} className="text-center font-bold text-3xl h-16 border-2 border-primary/20 focus-visible:ring-primary/50 bg-background shadow-inner" />
                </div>
                <Button
                  className="w-full h-16 text-2xl font-bold bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 shadow-lg hover:shadow-xl transition-all"
                  disabled={!startingCashInput || isStartingShift}
                  onClick={async () => {
                    setIsStartingShift(true);
                    await startShift(Number(startingCashInput), displayName, profile?.role || 'كاشير');
                    setIsStartingShift(false);
                    setStartingCashInput('');
                  }}
                >
                  {isStartingShift ? 'جاري الفتح...' : 'بدء الشيفت'}
                </Button>
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 mb-4">
              <Tabs value={orderType} onValueChange={(v) => { setOrderType(v as OrderType); setSelectedTable(null); setIsDeliveryFeeWaived(false); }} className="w-full md:max-w-[500px]">
                <TabsList className="h-14 w-full bg-card/60 backdrop-blur-md border border-border/50 rounded-2xl p-1 shadow-sm">
                  {orderTypes.map((type) => {
                    const Icon = type.icon;
                    return (
                      <TabsTrigger key={type.id} value={type.id} className="flex-1 gap-2 h-full rounded-xl text-sm md:text-base font-bold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md transition-all">
                        <Icon className="w-4 h-4 md:w-5 md:h-5" />
                        <span>{type.label}</span>
                      </TabsTrigger>
                    );
                  })}
                </TabsList>
              </Tabs>

              {orderType === 'dine_in' && (
                <Button variant="outline" className="h-12 w-full md:w-fit gap-2 text-sm md:text-base font-bold rounded-xl animate-in fade-in zoom-in border-border/50 shadow-sm hover:bg-muted/50" onClick={() => setShowTableSelector(true)}>
                  <Users className="w-5 h-5 text-primary" />
                  {selectedTableData ? `طاولة ${selectedTableData.table_number}` : 'اختر طاولة'}
                </Button>
              )}

              {(orderType === 'takeaway' || orderType === 'delivery') && (
                <div ref={searchContainerRef} className="flex flex-col gap-3 p-4 bg-card/60 backdrop-blur-md rounded-2xl border border-border/50 shadow-sm relative z-40 animate-in fade-in slide-in-from-top-2">
                  <div className="flex flex-col sm:flex-row gap-3 items-center">
                    <div className="relative flex-1 w-full min-w-[200px]">
                      <Input
                        placeholder="ابحث عن عميل (بالاسم أو الهاتف)..."
                        value={customerSearchText}
                        onChange={(e) => {
                          setCustomerSearchText(e.target.value);
                          setShowCustomerDropdown(true);
                          if (selectedCustomerId) handleClearCustomer();
                        }}
                        onFocus={() => setShowCustomerDropdown(true)}
                        className={cn("h-12 text-base rounded-xl focus-visible:ring-primary shadow-inner border-border/50", selectedCustomerId && "border-success bg-success/5")}
                      />
                      {selectedCustomerId && <CheckCircle className="w-5 h-5 absolute left-3 top-3.5 text-success pointer-events-none" />}

                      {showCustomerDropdown && customerSearchText && !selectedCustomerId && (
                        <div className="absolute top-14 right-0 w-full min-w-[250px] bg-background border rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto">
                          {customers.filter((c: any) => c.name?.toLowerCase().includes(customerSearchText.toLowerCase()) || c.phone?.includes(customerSearchText)).map((c: any) => (
                            <div key={c.id} className="p-3 border-b border-border/40 hover:bg-muted/50 cursor-pointer flex justify-between items-center transition-colors" onClick={() => handleSelectCustomer(c)}>
                              <span className="font-bold text-sm">{c.name}</span>
                              <span className="text-muted-foreground text-xs font-mono">{c.phone}</span>
                            </div>
                          ))}
                          {customers.filter((c: any) => c.name?.toLowerCase().includes(customerSearchText.toLowerCase()) || c.phone?.includes(customerSearchText)).length === 0 && (
                            <div className="p-5 text-center text-sm text-muted-foreground flex flex-col gap-3">
                              لا يوجد عميل بهذا الاسم أو الرقم.
                              <Button size="sm" variant="outline" className="border-dashed h-10 rounded-lg hover:bg-primary/5" onClick={() => {
                                setCustomerName(customerSearchText);
                                setCustomerPhone(customerSearchText.replace(/\D/g, ''));
                                setShowCustomerDropdown(false);
                              }}>
                                إدخال كعميل جديد
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    
                    {(selectedCustomerId || customerName) && (
                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap w-full sm:w-auto">
                        <Badge variant="outline" className={cn("px-4 py-3 h-12 rounded-xl text-sm whitespace-nowrap", selectedCustomerId ? "bg-success/10 text-success border-success/30 font-bold" : "bg-primary/10 text-primary border-primary/30 font-bold")}>
                          <UserPlus className="w-4 h-4 ml-2" />
                          {selectedCustomerId ? customerName : `جديد: ${customerName}`}
                        </Badge>
                        {!selectedCustomerId && (
                          <Input
                            placeholder="رقم هاتف العميل (مطلوب)"
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            className="h-12 text-sm w-full sm:w-48 focus-visible:ring-primary border-primary/30 shadow-inner rounded-xl"
                          />
                        )}
                        <Button variant="ghost" size="icon" onClick={handleClearCustomer} className="h-12 w-12 rounded-xl text-destructive hover:bg-destructive/10 shrink-0">
                          <Trash2 className="w-5 h-5" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {orderType === 'delivery' && (
                    <div className="flex flex-col sm:flex-row gap-3 w-full border-t border-border/50 pt-3 mt-1">
                      {selectedCustomerId && customers.find((c: any) => c.id === selectedCustomerId)?.addresses?.length > 0 && (
                        <select
                          className="flex h-12 flex-1 min-w-[200px] rounded-xl border border-input bg-background/50 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === 'custom') {
                              setCustomerAddress('');
                              setSelectedDeliveryZoneId('');
                            } else {
                              const addr: any = customers.find((c: any) => c.id === selectedCustomerId)?.addresses?.find((a: any) => a.id === val);
                              if (addr) {
                                setCustomerAddress(addr.address);
                                setSelectedDeliveryZoneId(addr.delivery_zone_id || '');
                              }
                            }
                          }}
                        >
                          <option value="custom">-- عنوان جديد --</option>
                          {customers.find((c: any) => c.id === selectedCustomerId)?.addresses?.map((a: any) => (
                            <option key={a.id} value={a.id}>{a.name || 'عنوان'}: {a.address}</option>
                          ))}
                        </select>
                      )}
                      
                      <Input
                        placeholder="العنوان مفصل (مطلوب)"
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                        className="h-12 text-sm focus-visible:ring-primary shadow-inner rounded-xl flex-[2] min-w-[200px]"
                      />
                      
                      <select
                        value={selectedDeliveryZoneId || ''}
                        onChange={(e) => setSelectedDeliveryZoneId(e.target.value)}
                        className="flex h-12 flex-1 min-w-[150px] rounded-xl border border-input bg-background/50 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
                      >
                        <option value="">-- المنطقة --</option>
                        {deliveryZones.filter((z: any) => z.isActive !== false).map((z: any) => (
                          <option key={z.id} value={z.id}>{z.name} - {currency(z.fee)}</option>
                        ))}
                      </select>
                      
                      <select
                        value={selectedDriverId || ''}
                        onChange={(e) => setSelectedDriverId(e.target.value)}
                        className="flex h-12 flex-1 min-w-[150px] rounded-xl border border-input bg-background/50 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
                      >
                        <option value="">-- السائق --</option>
                        {drivers.filter((d: any) => d.status === 'active').map((d: any) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 mb-4">
              {/* Search */}
              <div className="relative w-full">
                <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/60" />
                <Input placeholder="بحث عن صنف..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-12 md:h-14 pr-12 text-base md:text-lg rounded-2xl border-border/50 bg-card/60 backdrop-blur-md shadow-sm focus-visible:ring-primary" />
              </div>
              {/* Categories - full-width horizontal scroll */}
              <div className="overflow-x-auto no-scrollbar w-full">
                <div className="flex gap-2 px-1 pb-1 w-max">
                  <Button variant={selectedCategory === null ? 'default' : 'outline'} onClick={() => setSelectedCategory(null)} className="flex-shrink-0 text-sm h-11 md:h-12 px-5 rounded-2xl font-bold shadow-sm transition-all hover:scale-[1.02]" size="default">الكل</Button>
                  {categories.map((cat: any) => (
                    <Button key={cat.id} variant={selectedCategory === cat.id ? 'default' : 'outline'} onClick={() => setSelectedCategory(cat.id)} className="flex-shrink-0 gap-2 text-sm h-11 md:h-12 px-4 rounded-2xl font-bold shadow-sm transition-all hover:scale-[1.02]" size="default">
                      {cat.icon && <span className="text-lg">{cat.icon}</span>}
                      <span>{cat.name}</span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 px-1">
              {menuItems.length === 0 ? (
                <div className="text-center py-20 text-muted-foreground">
                  <ShoppingBag className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p className="text-lg font-medium">لا توجد أصناف</p>
                  <p className="text-sm">أضف أصناف من صفحة إدارة القائمة</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4 pb-6 pr-3">
                  <AnimatePresence mode="popLayout">
                    {filteredItems.map((item: any) => {
                      const cartItem = cart.find((c) => c.menuItem.id === item.id);
                      const catIcon = categories.find((c: any) => c.id === item.category_id)?.icon || '🍽️';
                      return (
                        <motion.div key={item.id} layout initial={{ opacity: 0, scale: 0.9, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 10 }}>
                          <Card className={cn('relative overflow-hidden cursor-pointer h-full border-2 transition-all duration-300 rounded-3xl group hover:-translate-y-1', cartItem ? 'border-primary ring-4 ring-primary/20 shadow-xl shadow-primary/20' : 'border-border/40 hover:border-primary/50 hover:shadow-lg bg-card/60 backdrop-blur-sm')} onClick={() => addItemToCart(item)}>
                            {cartItem && <Badge className="absolute top-2 left-2 md:top-3 md:left-3 bg-primary text-sm h-7 w-7 flex items-center justify-center p-0 z-10 shadow-lg animate-in zoom-in">{cartItem.quantity}</Badge>}
                            <CardContent className="p-2 md:p-3 flex flex-col h-full">
                              {item.image_url ? (
                                <div className="aspect-[4/3] bg-muted/50 rounded-2xl mb-3 overflow-hidden shadow-inner group-hover:shadow-md transition-all">
                                  <img src={item.image_url} alt={item.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                </div>
                              ) : (
                                <div className="aspect-[4/3] bg-gradient-to-br from-muted/50 to-muted rounded-2xl mb-3 flex items-center justify-center text-5xl shadow-inner group-hover:shadow-md transition-all">{catIcon}</div>
                              )}
                              <div className="flex-1 flex flex-col justify-between px-1">
                                <h3 className="font-bold text-sm md:text-base line-clamp-2 leading-tight mb-2 text-foreground/90">{item.name}</h3>
                                <div className="flex items-end justify-between mt-auto">
                                  <span className="text-primary font-black text-sm md:text-lg tracking-tight bg-primary/10 px-2.5 py-1 rounded-xl">{currency(Number(item.price))}</span>
                                  <span className="text-[11px] md:text-xs text-muted-foreground/70 font-medium flex items-center gap-1 bg-muted/30 px-2 py-1 rounded-lg"><Clock className="w-3.5 h-3.5" />{item.preparation_time || 15}د</span>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </div>

      {/* Cart Sidebar Desktop */}
      {activeShift && !shiftLoading && (
        <div className="hidden md:flex w-full md:w-[400px] bg-card flex-col shadow-[-10px_0_40px_-15px_rgba(0,0,0,0.1)] z-10 h-full border-l border-border/30">
          {renderCartBody()}
        </div>
      )}

      {/* Floating Bottom Cart Summary on Mobile */}
      {activeShift && !shiftLoading && cart.length > 0 && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-3 bg-card/95 backdrop-blur-xl border-t border-border shadow-2xl z-40 safe-area-bottom">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
                {cart.reduce((s, i) => s + i.quantity, 0)}
              </div>
              <div>
                <span className="text-[11px] text-muted-foreground block">إجمالي السلة</span>
                <span className="text-base font-black text-primary">{currency(total)}</span>
              </div>
            </div>
            <Button
              onClick={() => setCartOpen(true)}
              className="h-11 px-5 font-bold gap-2 text-sm bg-primary hover:bg-primary/90 rounded-xl"
            >
              <Receipt className="w-4 h-4" />
              <span>عرض السلة ({currency(total)})</span>
            </Button>
          </div>
        </div>
      )}

      {/* Cart Drawer for Mobile */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="h-[88dvh] p-0 rounded-t-3xl overflow-hidden bg-card safe-area-bottom">
          <SheetTitle className="sr-only">سلة الطلب</SheetTitle>
          <SheetDescription className="sr-only">محتويات الطلب وتفاصيل الدفع</SheetDescription>
          {renderCartBody()}
        </SheetContent>
      </Sheet>

      {/* Table Selector */}
      <Dialog open={showTableSelector} onOpenChange={setShowTableSelector}>
        <DialogContent className="max-w-[95vw] md:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>اختر طاولة</DialogTitle><DialogDescription className="sr-only">اختر طاولة للطلب المقدم</DialogDescription></DialogHeader>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-2 py-4">
            {tables.length === 0 ? <p className="col-span-full text-center text-muted-foreground py-8">لا توجد طاولات</p> : tables.map((table: any) => (
              <button key={table.id} onClick={() => { if (table.status === 'available') { setSelectedTable(table.id); setShowTableSelector(false); } }} disabled={table.status !== 'available'}
                className={cn('p-3 text-center rounded-lg border', table.status === 'available' ? 'hover:border-primary cursor-pointer' : 'opacity-50 cursor-not-allowed', selectedTable === table.id && 'ring-2 ring-primary bg-primary/5')}>
                <span className="text-xl font-bold">{table.table_number}</span>
                <p className="text-xs text-muted-foreground mt-1">{table.seats} أشخاص</p>
                <Badge variant="outline" className={cn('mt-1 text-xs', table.status === 'available' ? 'border-success text-success bg-success/10' : 'border-destructive text-destructive bg-destructive/10')}>
                  {table.status === 'available' ? 'متاحة' : 'مشغولة'}
                </Badge>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Discount Dialog */}
      <Dialog open={showDiscountDialog} onOpenChange={setShowDiscountDialog}>
        <DialogContent className="max-w-sm max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>تطبيق خصم</DialogTitle><DialogDescription className="sr-only">تطبيق خصم على الطلب الحالي</DialogDescription></DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex gap-2">
              <Button variant={discountType === 'percent' ? 'default' : 'outline'} onClick={() => setDiscountType('percent')} className="flex-1">نسبة %</Button>
              <Button variant={discountType === 'amount' ? 'default' : 'outline'} onClick={() => setDiscountType('amount')} className="flex-1">مبلغ ثابت</Button>
            </div>
            {discountType === 'percent' ? (
              <div className="space-y-2">
                <Input type="number" min={0} max={100} value={discountPercent} onChange={(e) => setDiscountPercent(Number(e.target.value))} placeholder="0" />
                <div className="flex gap-2">{[5, 10, 15, 20, 25].map((p) => (<Button key={p} variant="outline" size="sm" onClick={() => setDiscountPercent(p)}>{p}%</Button>))}</div>
              </div>
            ) : (
              <Input type="number" min={0} value={discountAmount} onChange={(e) => setDiscountAmount(Number(e.target.value))} placeholder="0" />
            )}
            <div className="p-3 bg-muted rounded-lg text-center"><p className="text-sm text-muted-foreground">قيمة الخصم</p><p className="text-2xl font-bold text-success">{currency(calcDiscount)}</p></div>
            <Button className="w-full" onClick={() => { setShowDiscountDialog(false); toast.success('تم تطبيق الخصم'); }}>تطبيق</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle>اختر طريقة الدفع لإنهاء الطلب</DialogTitle><DialogDescription className="sr-only">اختر طريقة دفع مناسبة</DialogDescription></DialogHeader>
          <div className="py-4 space-y-3">
            <div className="text-center mb-6"><p className="text-4xl font-black text-primary mb-1">{currency(total)}</p><p className="text-sm font-medium text-muted-foreground">المبلغ المستحق النهائي</p></div>
            {[{ id: 'cash', label: 'نقداً', icon: Banknote, color: 'text-emerald-500 bg-emerald-500/10' },
            { id: 'card', label: 'بطاقة ائتمان', icon: CreditCard, color: 'text-blue-500 bg-blue-500/10' },
            { id: 'wallet', label: 'محفظة', icon: Wallet, color: 'text-purple-500 bg-purple-500/10' }].map(m => (
              <Button key={m.id} variant="outline" className="w-full h-16 justify-start gap-4 text-lg font-bold border-2 hover:border-primary transition-all group" onClick={() => handlePayment(m.id)}>
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110", m.color)}><m.icon className="w-6 h-6" /></div>
                {m.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Invoice Dialog */}
      <Dialog open={showInvoiceDialog} onOpenChange={setShowInvoiceDialog}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-success justify-center text-xl"><CheckCircle className="w-6 h-6" />تمت عملية البيع بنجاح</DialogTitle><DialogDescription className="sr-only">تفاصيل الفاتورة</DialogDescription></DialogHeader>
          {completedOrder && (
            <div className="py-2">
              <div id="invoice-print-area" className="border-2 rounded-xl p-4 sm:p-5 space-y-4 bg-white shadow-sm w-full max-w-sm mx-auto text-black print:p-0 print:border-none print:shadow-none">
                <div className="center text-center pb-2">
                  {settings.invoiceLogo ? (
                    <img src={settings.invoiceLogo} alt="Logo" className="logo mx-auto block max-w-32 max-h-16 object-contain mb-2" />
                  ) : (
                    <h1 className="text-3xl font-black mb-1">{settings.invoiceCompanyName || 'MK'}</h1>
                  )}
                  {settings.invoiceLogo && settings.invoiceCompanyName && (
                    <h1 className="text-xl font-black mb-1 text-black">{settings.invoiceCompanyName}</h1>
                  )}

                  {settings.invoiceAddress && <p className="text-sm font-bold mb-1 text-black">{settings.invoiceAddress}</p>}
                  {settings.invoicePhone && <p className="text-sm font-bold mb-1 text-black">هاتف: {settings.invoicePhone}</p>}
                  {settings.invoiceTaxNumber && <p className="text-sm font-bold mb-1 text-black">الرقم الضريبي: {settings.invoiceTaxNumber}</p>}

                  <div className="line border-t border-dashed border-gray-400 my-3" />

                  <p className="text-base font-bold mb-1 text-black">فاتورة ضريبية مبسطة</p>
                  <p className="text-xs text-gray-600">
                    {completedOrder.date.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
                    {' - '}
                    {completedOrder.date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </p>
                </div>

                <div className="info-grid grid grid-cols-2 gap-y-2 text-sm bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <div><span className="text-gray-500 text-xs block">رقم الطلب</span><span className="font-bold text-base text-black">{completedOrder.orderNumber}</span></div>
                  <div><span className="text-gray-500 text-xs block">طريقة الدفع</span><span className="font-bold text-base text-black">{paymentMethodLabel(completedOrder.paymentMethod)}</span></div>
                  <div><span className="text-gray-500 text-xs block">نوع الطلب</span><span className="font-bold text-base text-black">{completedOrder.type === 'dine_in' ? 'صالة' : completedOrder.type === 'takeaway' ? 'تيك أواي' : 'توصيل'}</span></div>
                  {completedOrder.type === 'dine_in' && completedOrder.table && <div><span className="text-gray-500 text-xs block">رقم الطاولة</span><span className="font-bold text-base text-black">{completedOrder.table.table_number}</span></div>}
                  {completedOrder.customerName && <div className="col-span-2"><span className="text-gray-500 text-xs block">العميل</span><span className="font-bold text-base text-black">{completedOrder.customerName}</span></div>}
                  {completedOrder.type === 'delivery' && completedOrder.customerAddress && <div className="col-span-2"><span className="text-gray-500 text-xs block">العنوان</span><span className="font-bold text-base text-black">{completedOrder.customerAddress}</span></div>}
                  {completedOrder.notes && <div className="col-span-2"><span className="text-gray-500 text-xs block">ملاحظات الطلب</span><span className="font-bold text-base text-black whitespace-pre-wrap">{completedOrder.notes}</span></div>}
                </div>

                <table className="w-full text-sm mt-3 text-black">
                  <thead><tr className="border-b-2 border-dashed border-gray-300"><th className="text-right py-2 font-bold">الصنف</th><th className="text-center py-2 font-bold">الكمية</th><th className="text-center py-2 font-bold">السعر</th><th className="text-left py-2 font-bold">الصافي</th></tr></thead>
                  <tbody>
                    {completedOrder.items.map((item: any, i: number) => (
                      <tr key={i} className="border-b border-dashed border-gray-200"><td className="py-2 font-bold">{item.menuItem.name}</td><td className="text-center py-2">{item.quantity}</td><td className="text-center py-2">{currency(item.menuItem.price)}</td><td className="text-left py-2 font-bold">{currency(item.menuItem.price * item.quantity)}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div className="solid-line border-t-2 border-black mt-2 mb-2" />
                <div className="space-y-2 text-black">
                  <div className="row flex justify-between font-bold text-base"><span className="text-gray-700">المجموع الفرعي</span><span>{currency(completedOrder.subtotal)}</span></div>
                  {completedOrder.discount > 0 && <div className="row flex justify-between font-bold text-base text-red-600"><span>الخصم الممنوح {completedOrder.discountPercent > 0 ? `(${completedOrder.discountPercent}%)` : ''}</span><span>- {currency(completedOrder.discount)}</span></div>}
                  {completedOrder.deliveryFee > 0 && <div className="row flex justify-between font-bold text-base text-gray-700"><span>رسوم التوصيل</span><span>+ {currency(completedOrder.deliveryFee)}</span></div>}
                  <div className="row flex justify-between text-xl font-black total pt-3 border-t-2 border-black mt-2"><span>الإجمالي المستحق</span><span className="text-black">{currency(completedOrder.total)}</span></div>
                </div>
                <div className="line border-t-2 border-dashed border-gray-400 my-4" />
                <div className="text-center pt-2 pb-1">
                  <p className="text-base font-bold mb-1 text-black">{settings.receiptWelcomeMessage || 'شكراً لزيارتكم 🍽️'}</p>
                  <p className="text-[11px] text-gray-500 mt-2">Powered by MK System</p>
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <Button variant="outline" className="flex-1 gap-2 h-12 shadow-sm" onClick={printInvoice}><Printer className="w-5 h-5" />طباعة الإيصال</Button>
                <Button className="flex-1 gap-2 h-12 shadow-md" onClick={handleCloseInvoice}><CheckCircle className="w-5 h-5" />الطلب التالي</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Shift Close Report */}
      <Dialog open={showShiftReport} onOpenChange={setShowShiftReport}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>📊 تقرير إقفال الشيفت</DialogTitle><DialogDescription className="sr-only">عرض تفاصيل الشيفت الحالي لغرض الاقفال</DialogDescription></DialogHeader>
          <div id="shift-report-print" className="py-4 space-y-4">
            <div className="space-y-3 bg-muted/30 p-4 rounded-xl">
              <div className="flex justify-between font-bold">
                <span>إجمالي المبيعات</span>
                <span className="text-primary">{currency(shiftTotalSales)}</span>
              </div>
              <div className="line border-t border-dashed my-2" />
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">مبيعات الكاش</span>
                <span>{currency(shiftCash)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">مبيعات البطاقة</span>
                <span>{currency(shiftCard)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">مبيعات المحفظة</span>
                <span>{currency(shiftWallet)}</span>
              </div>
              <div className="line border-t border-dashed my-2" />
              <div className="flex justify-between text-sm text-destructive font-bold">
                <span>المصروفات والسحوبات</span>
                <span>- {currency(shiftTotalExpenses)}</span>
              </div>
              <div className="line border-t border-dashed my-2" />
              <div className="flex justify-between font-bold text-lg bg-primary/5 p-2 rounded-lg">
                <span>النقدية المتوقعة بالدرج</span>
                <span className="text-primary">{currency(expectedCash)}</span>
              </div>

              {actualCashInput !== '' && (
                <>
                  <div className="flex justify-between font-bold text-lg bg-primary/5 p-2 rounded-lg mt-2">
                    <span>العجز / الزيادة</span>
                    <span className={discrepancy < 0 ? 'text-destructive' : discrepancy > 0 ? 'text-success' : 'text-primary'}>
                      {discrepancy > 0 ? '+' : ''}{currency(discrepancy)}
                    </span>
                  </div>
                  {discrepancy < 0 && (
                    <div className="mt-3 animate-in fade-in slide-in-from-top-1">
                      <label className="text-xs font-bold mb-1 block text-destructive">سبب العجز (مطلوب لتسوية العهدة)</label>
                      <Input value={shortageReason} onChange={(e) => setShortageReason(e.target.value)} placeholder="مثال: فاتورة لم تسجل، خطأ في الحساب..." className="border-destructive focus-visible:ring-destructive" />
                    </div>
                  )}
                </>
              )}
            </div>

            <p className="text-center font-bold text-sm text-muted-foreground">يرجى إدخال مبلغ الدرج الفعلي لتسوية العهدة</p>
            <div className="pt-2">
              <label className="text-xs font-bold mb-1 block">النقدية الفعلية بالدرج</label>
              <Input type="number" min={0} value={actualCashInput} onChange={(e) => setActualCashInput(e.target.value)} placeholder="0" className="font-bold text-center text-lg h-12 border-primary" />
            </div>
          </div>
          <div className="flex gap-2">
            <Button className="flex-1 gap-2" variant="destructive" disabled={actualCashInput === '' || isClosingShift || (discrepancy < 0 && !shortageReason.trim())} onClick={confirmCloseShift}>
              {isClosingShift ? 'جاري...' : 'إغلاق الشيفت واعتماد النقدية'}
            </Button>
            <Button variant="ghost" onClick={() => setShowShiftReport(false)}>إلغاء</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Drawer Password Verification Dialog */}
      <Dialog open={showDrawerPasswordPrompt} onOpenChange={setShowDrawerPasswordPrompt}>
        <DialogContent className="max-w-sm sm:max-w-sm bg-card">
          <DialogHeader><DialogTitle>حماية درج الكاشير</DialogTitle><DialogDescription className="sr-only">إدخال كلمة المرور لحماية وفتح الدرج</DialogDescription></DialogHeader>
          <div className="py-4 space-y-4 text-center">
            <Shield className="w-12 h-12 mx-auto text-primary opacity-80" />
            <p className="text-sm text-muted-foreground">الرجاء إدخال كلمة المرور لفتح الدرج يدوياً</p>
            <Input
              type="password"
              placeholder="كلمة المرور..."
              value={drawerPasswordInput}
              onChange={(e) => setDrawerPasswordInput(e.target.value)}
              className="text-center font-bold text-2xl h-14 tracking-widest direction-ltr"
              dir="ltr"
              onKeyDown={(e) => e.key === 'Enter' && verifyAndOpenDrawer()}
              autoFocus
            />
            <Button className="w-full h-12 text-lg" disabled={!drawerPasswordInput} onClick={verifyAndOpenDrawer}>
              تأكيد وفتح الدرج
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cash Drawer Configuration Dialog */}
      <Dialog open={showDrawerConfig} onOpenChange={setShowDrawerConfig}>
        <DialogContent className="max-w-md bg-card font-cairo">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Printer className="w-5 h-5 text-primary" />
              إعدادات اتصال درج الكاشير
            </DialogTitle>
            <DialogDescription className="sr-only">تحديد طريقة فتح درج الكاشير الموصول بالجهاز واختبارها</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-6">
            <div className="space-y-3">
              <label className="text-sm font-bold text-muted-foreground block text-right">طريقة الاتصال بالدرج</label>
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  variant={drawerConnectionType === 'driver' ? 'default' : 'outline'} 
                  onClick={() => {
                    setDrawerConnectionType('driver');
                    localStorage.setItem('sys_drawer_type', 'driver');
                    toast.success('تم التغيير إلى اتصال تعريف الطابعة (نظام التشغيل)');
                  }} 
                  className="h-16 flex flex-col items-center justify-center gap-1 rounded-xl text-center"
                >
                  <span className="font-bold">تعريف الطابعة</span>
                  <span className="text-[10px] opacity-75">عبر نافذة الطباعة</span>
                </Button>
                <Button 
                  variant={drawerConnectionType === 'serial' ? 'default' : 'outline'} 
                  onClick={() => {
                    setDrawerConnectionType('serial');
                    localStorage.setItem('sys_drawer_type', 'serial');
                    toast.success('تم التغيير إلى الاتصال المباشر (Serial/USB)');
                  }} 
                  className="h-16 flex flex-col items-center justify-center gap-1 rounded-xl text-center"
                >
                  <span className="font-bold">اتصال مباشر (Serial)</span>
                  <span className="text-[10px] opacity-75">فوري وبدون نوافذ</span>
                </Button>
              </div>
            </div>

            {drawerConnectionType === 'serial' && (
              <div className="p-4 bg-muted/30 rounded-2xl border border-border/50 space-y-4 animate-fade-in">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">حالة الاتصال بالمنفذ:</span>
                  <Badge variant={serialPort ? "success" : "destructive"}>
                    {serialPort ? "متصل" : "غير متصل"}
                  </Badge>
                </div>
                
                <p className="text-xs text-muted-foreground leading-relaxed text-right">
                  يتيح هذا الوضع إرسال نبضات كهربائية فوراً للدرج. يلزم ربط المتصفح بالمنفذ التسلسلي الافتراضي للطابعة أو جهاز الـ USB Trigger.
                </p>

                <Button 
                  onClick={handleConnectSerial} 
                  variant="outline" 
                  className="w-full h-11 font-bold border-primary/20 hover:bg-primary/5 text-primary gap-2"
                >
                  <Settings2 className="w-4 h-4" />
                  {serialPort ? "تغيير المنفذ التسلسلي المربوط..." : "ربط المنفذ التسلسلي للدرج..."}
                </Button>
              </div>
            )}

            <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10 space-y-3">
              <h4 className="font-bold text-sm text-primary flex items-center gap-1.5 justify-start">
                <Shield className="w-4 h-4" /> دليل إعداد الأدراج الحرارية (ESC/POS)
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed text-right">
                في حال استخدام <strong>طريقة تعريف الطابعة</strong>، يرجى الدخول إلى لوحة التحكم بالويندوز (Control Panel) ثم خصائص الطابعة الحرارية وتفعيل خيار فتح الدرج (Cash Drawer {"->"} Open Before Printing). ولفتحه <strong>تلقائياً بدون نوافذ</strong>، يُنصح بتشغيل وضع الكشك في المتصفح عبر الاختصار:
              </p>
              <div className="p-2 bg-background rounded-lg border text-left font-mono text-[10px] select-all overflow-x-auto direction-ltr" dir="ltr">
                chrome.exe --kiosk --kiosk-printing
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button 
                onClick={kickDrawer} 
                variant="secondary" 
                className="flex-1 h-12 font-bold gap-2"
              >
                <Printer className="w-4 h-4" />
                اختبار فتح الدرج
              </Button>
              <Button 
                onClick={() => setShowDrawerConfig(false)} 
                className="flex-1 h-12 font-bold"
              >
                موافق
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddExpense} onOpenChange={setShowAddExpense}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>تسجيل مصروف</DialogTitle><DialogDescription className="sr-only">تسجيل وسحب المصروفات من الصندوق</DialogDescription></DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <label className="text-sm font-medium mb-1 block">المبلغ</label>
              <Input type="number" min={0} value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} placeholder="0" className="font-bold text-lg h-12" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">البيان</label>
              <Input value={expenseDescription} onChange={(e) => setExpenseDescription(e.target.value)} placeholder="مثال: مشتريات خضار" className="h-12" />
            </div>
            <Button className="w-full h-12 text-lg mt-2 font-bold" disabled={!expenseAmount || !expenseDescription} onClick={handleAddExpense}>سحب وتأكيد</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mobile Cart Floating Action Button */}
      {isMobile && activeShift && !shiftLoading && cart.length > 0 && (
        <div className="fixed bottom-20 left-4 z-[90]">
          <Button
            onClick={() => setCartOpen(true)}
            className="h-14 px-5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-2xl flex items-center gap-2 border border-white/10 animate-bounce"
          >
            <div className="relative">
              <ShoppingBag className="w-5 h-5 text-white" />
              <Badge className="absolute -top-3.5 -right-3.5 bg-red-500 hover:bg-red-600 text-white font-bold h-5 w-5 flex items-center justify-center p-0 rounded-full text-[10px]">
                {cart.reduce((total, item) => total + item.quantity, 0)}
              </Badge>
            </div>
            <span className="font-bold text-sm">عرض الطلب</span>
            <span className="font-black text-sm bg-white/20 px-2 py-0.5 rounded-lg">{currency(total)}</span>
          </Button>
        </div>
      )}

      {/* Mobile Cart Sheet Drawer */}
      {isMobile && (
        <Sheet open={cartOpen} onOpenChange={setCartOpen}>
          <SheetContent side="bottom" className="h-[80vh] p-0 rounded-t-[32px] border-t border-border/40 font-cairo flex flex-col bg-card overflow-hidden">
            <SheetTitle className="sr-only">سلة المشتريات</SheetTitle>
            <SheetDescription className="sr-only">محتويات الفاتورة الحالية وتأكيد الطلب</SheetDescription>
            
            <div className="p-4 border-b border-border/30 bg-muted/10 shrink-0 flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
                <Receipt className="w-5 h-5 text-primary" />
                سلة المشتريات ({cart.reduce((total, item) => total + item.quantity, 0)} أصناف)
              </h2>
              {cart.length > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => { clearCart(); setOrderNotes(''); setCartOpen(false); }} 
                  className="text-destructive font-semibold text-xs hover:bg-destructive/10 rounded-xl"
                >
                  <Trash2 className="w-4 h-4 ml-1.5" />
                  إفراغ السلة
                </Button>
              )}
            </div>

            <ScrollArea className="flex-1">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground/60 min-h-[250px]">
                  <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="font-bold text-base mb-1">السلة فارغة</p>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {cart.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 p-2.5 bg-background border shadow-sm rounded-xl">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold truncate text-sm">{item.menuItem.name}</h4>
                        <p className="text-xs text-primary font-bold">{currency(item.menuItem.price * item.quantity)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 bg-muted rounded-lg p-0.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-background" onClick={() => updateCartItemQuantity(item.id, item.quantity - 1)}><Minus className="w-3 h-3" /></Button>
                        <span className="w-6 text-center font-bold text-sm">{item.quantity}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md hover:bg-background" onClick={() => handleIncreaseQuantity(item.id, item.quantity + 1)}><Plus className="w-3 h-3" /></Button>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg ml-1" onClick={() => removeFromCart(item.id)}><X className="w-4 h-4" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {cart.length > 0 && (
              <div className="bg-muted/30 p-4 space-y-3 shrink-0 rounded-t-2xl shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] border-t border-border/20">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium"><span className="text-muted-foreground">المجموع الفرعي</span><span>{currency(subtotal)}</span></div>
                  {calcDiscount > 0 && <div className="flex justify-between text-xs font-medium text-success"><span>الخصم</span><span>- {currency(calcDiscount)}</span></div>}
                  {selectedZone && Number(selectedZone.fee || 0) > 0 && (
                    <div className="flex justify-between items-center text-xs font-medium text-muted-foreground">
                      <span className="flex items-center gap-2">
                        رسوم التوصيل
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn("h-5 px-1.5 text-[10px]", isDeliveryFeeWaived ? "bg-primary/10 text-primary border border-primary/20" : "hover:bg-muted border border-transparent")}
                          onClick={() => setIsDeliveryFeeWaived(!isDeliveryFeeWaived)}
                        >
                          {isDeliveryFeeWaived ? 'إلغاء الإعفاء' : 'إعفاء'}
                        </Button>
                      </span>
                      {isDeliveryFeeWaived ? (
                        <div className="flex items-center gap-2">
                          <span className="line-through text-[10px] opacity-50">{currency(Number(selectedZone.fee))}</span>
                          <span className="text-success text-[10px] font-bold">مجاناً</span>
                        </div>
                      ) : (
                        <span>+ {currency(deliveryFee)}</span>
                      )}
                    </div>
                  )}
                  <div className="flex justify-between items-center pt-2 border-t border-border/50 text-base font-black text-foreground">
                    <span>الإجمالي</span>
                    <span className="text-lg text-primary">{currency(total)}</span>
                  </div>
                </div>

                <div className="pt-1">
                  <Input placeholder="ملاحظات الطلب (اختياري)..." value={orderNotes} onChange={(e) => setOrderNotes(e.target.value)} className="h-10 text-sm bg-background border-dashed focus-visible:ring-primary shadow-sm rounded-xl mb-1" />
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <Button variant="outline" className="h-10 gap-1.5 text-xs bg-background border-dashed" onClick={() => { setShowDiscountDialog(true); setCartOpen(false); }}><Percent className="w-3.5 h-3.5" />خصم</Button>
                  <Button variant="outline" className="h-10 gap-1.5 text-xs bg-background" onClick={printInvoice}><Printer className="w-3.5 h-3.5" />تبويب</Button>
                  <Button className="h-10 gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-md" onClick={() => { setShowPaymentDialog(true); setCartOpen(false); }}>
                    <CreditCard className="w-3.5 h-3.5" /> ادفع
                  </Button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      )}

    </div>
  );
}
