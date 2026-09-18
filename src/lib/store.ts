import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// أنواع البيانات الأساسية
export interface Tenant {
  id: string;
  name: string;
  nameEn?: string;
  taxNumber?: string;
  logo?: string;
}

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  phone: string;
  isActive: boolean;
  openingTime?: string;
  closingTime?: string;
}

export interface User {
  id: string;
  tenantId: string;
  branchId?: string;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  avatar?: string;
}

export interface AppSettings {
  useArabicNumerals: boolean;
  useHijriCalendar: boolean;
  currency: string;
  locale: string;
  timezone: string;
  taxEnabled: boolean;
  taxRate: number;
  serviceChargeEnabled: boolean;
  serviceChargeRate: number;

  // POS Settings
  autoPrintReceipt: boolean;
  printKitchenTicket: boolean;
  openDrawerPassword?: string;
  receiptWelcomeMessage: string;
  invoiceCompanyName: string;
  invoiceAddress: string;
  invoicePhone: string;
  invoiceTaxNumber: string;
  invoiceLogo: string;

  // Taxes Settings
  taxIncluded: boolean;
  serviceChargeIncluded: boolean;

  // Notifications Settings
  newOrderAlerts: boolean;
  lowStockAlerts: boolean;
  reservationAlerts: boolean;
  notificationSound: boolean;

  // Security Settings
  autoLogout: boolean;
  requirePin: boolean;
  logAllOperations: boolean;

  // Appearance Settings
  darkMode: boolean;
  primaryColor: string;

  // Azkar Settings
  azkarEnabled: boolean;
  azkarInterval: number;

  // Loyalty Settings
  loyaltyTiers?: { id: string; name: string; minPoints: number; discount: number; color: string; }[];
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  nameEn?: string;
  description?: string;
  price: number;
  cost?: number;
  image?: string;
  isAvailable: boolean;
  preparationTime: number; // بالدقائق
  calories?: number;
  allergens?: string[];
  modifierGroups?: string[];
}

export interface MenuCategory {
  id: string;
  name: string;
  nameEn?: string;
  icon?: string;
  sortOrder: number;
  isActive: boolean;
}

export interface OrderItem {
  id: string;
  menuItem: MenuItem;
  quantity: number;
  modifiers?: { name: string; price: number }[];
  notes?: string;
  status: 'pending' | 'preparing' | 'ready' | 'served';
}

export interface Order {
  id: string;
  orderNumber: string;
  type: 'dine-in' | 'takeaway' | 'delivery' | 'curbside';
  tableId?: string;
  customerId?: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  serviceCharge: number;
  discount: number;
  total: number;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  paymentStatus: 'pending' | 'partial' | 'paid' | 'refunded';
  createdAt: Date;
  createdBy: string;
}

interface AppState {
  // المستأجر والفرع الحالي
  currentTenant: Tenant | null;
  currentBranch: Branch | null;
  currentUser: User | null;

  // الإعدادات
  settings: AppSettings;

  // حالة POS
  currentOrder: Order | null;
  cart: OrderItem[];

  // الأحداث
  setCurrentTenant: (tenant: Tenant) => void;
  setCurrentBranch: (branch: Branch) => void;
  setCurrentUser: (user: User) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;

  // عمليات السلة
  addToCart: (item: MenuItem, quantity?: number) => void;
  removeFromCart: (itemId: string) => void;
  updateCartItemQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;

  // Sidebar state
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Bottom Navigation state
  bottomNavVisible: boolean;
  setBottomNavVisible: (visible: boolean) => void;
  toggleBottomNav: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentTenant: null,
      currentBranch: null,
      currentUser: null,

      settings: {
        useArabicNumerals: false,
        useHijriCalendar: false,
        currency: 'EGP',
        locale: 'ar-EG',
        timezone: 'Africa/Cairo',
        taxEnabled: false,
        taxRate: 14,
        serviceChargeEnabled: false,
        serviceChargeRate: 12,

        autoPrintReceipt: true,
        printKitchenTicket: false,
        openDrawerPassword: "",
        receiptWelcomeMessage: "شكراً لزيارتكم - نسعد بخدمتكم دائماً",
        invoiceCompanyName: "مكتبة ألوان التجارية",
        invoiceAddress: "القاهرة، مصر",
        invoicePhone: "01000000000",
        invoiceTaxNumber: "",
        invoiceLogo: "",
        taxIncluded: false,
        serviceChargeIncluded: false,
        newOrderAlerts: true,
        lowStockAlerts: true,
        reservationAlerts: true,
        notificationSound: true,
        autoLogout: true,
        requirePin: true,
        logAllOperations: true,
        darkMode: true,
        primaryColor: '#ea580c',
        azkarEnabled: true,
        azkarInterval: 30, // 30 minutes
        loyaltyTiers: [
          { id: 'bronze', name: 'برونزي', minPoints: 0, discount: 5, color: 'bg-amber-600' },
          { id: 'silver', name: 'فضي', minPoints: 500, discount: 10, color: 'bg-slate-400' },
          { id: 'gold', name: 'ذهبي', minPoints: 1500, discount: 15, color: 'bg-yellow-500' },
          { id: 'platinum', name: 'بلاتيني', minPoints: 5000, discount: 20, color: 'bg-slate-700' },
        ],
      },

      currentOrder: null,
      cart: [],

      sidebarCollapsed: false,

      setCurrentTenant: (tenant) => set({ currentTenant: tenant }),
      setCurrentBranch: (branch) => set({ currentBranch: branch }),
      setCurrentUser: (user) => set({ currentUser: user }),

      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),

      addToCart: (item, quantity = 1) =>
        set((state) => {
          const existingItem = state.cart.find((i) => i.menuItem.id === item.id);
          if (existingItem) {
            return {
              cart: state.cart.map((i) =>
                i.menuItem.id === item.id
                  ? { ...i, quantity: i.quantity + quantity }
                  : i
              ),
            };
          }
          return {
            cart: [
              ...state.cart,
              {
                id: `cart-${Date.now()}`,
                menuItem: item,
                quantity,
                status: 'pending',
              },
            ],
          };
        }),

      removeFromCart: (itemId) =>
        set((state) => ({
          cart: state.cart.filter((i) => i.id !== itemId),
        })),

      updateCartItemQuantity: (itemId, quantity) =>
        set((state) => ({
          cart: quantity <= 0
            ? state.cart.filter((i) => i.id !== itemId)
            : state.cart.map((i) =>
              i.id === itemId ? { ...i, quantity } : i
            ),
        })),

      clearCart: () => set({ cart: [] }),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      bottomNavVisible: true,
      setBottomNavVisible: (visible) => set({ bottomNavVisible: visible }),
      toggleBottomNav: () => set((state) => ({ bottomNavVisible: !state.bottomNavVisible })),
    }),
    {
      name: 'rms-storage',
      partialize: (state) => ({
        settings: state.settings,
        sidebarCollapsed: state.sidebarCollapsed,
        bottomNavVisible: state.bottomNavVisible,
      }),
    }
  )
);
