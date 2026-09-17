-- ======================================
-- نظام إدارة المطاعم - مخطط قاعدة البيانات
-- Restaurant Management System Schema
-- Version: 2.0.0
-- ======================================

-- 1. ENUMS (الأنواع المعددة)
-- ======================================

CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'manager', 'cashier', 'waiter', 'kitchen', 'delivery');
CREATE TYPE public.order_type AS ENUM ('dine_in', 'takeaway', 'delivery', 'curbside', 'catering');
CREATE TYPE public.order_status AS ENUM ('pending', 'confirmed', 'preparing', 'ready', 'served', 'completed', 'cancelled');
CREATE TYPE public.payment_status AS ENUM ('pending', 'partial', 'paid', 'refunded');
CREATE TYPE public.payment_method AS ENUM ('cash', 'card', 'wallet', 'mixed', 'credit');
CREATE TYPE public.table_status AS ENUM ('available', 'occupied', 'reserved', 'maintenance');
CREATE TYPE public.reservation_status AS ENUM ('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show');
CREATE TYPE public.purchase_order_status AS ENUM ('draft', 'pending_approval', 'approved', 'ordered', 'partial_received', 'received', 'cancelled');
CREATE TYPE public.stock_movement_type AS ENUM ('purchase', 'sale', 'transfer', 'adjustment', 'waste', 'production', 'return');
CREATE TYPE public.delivery_status AS ENUM ('pending', 'assigned', 'picked_up', 'on_way', 'delivered', 'failed', 'returned');

-- 2. FUNCTIONS
-- ======================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. CORE TABLES
-- ======================================

CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    name_en TEXT,
    logo_url TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    tax_number TEXT,
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    name_en TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    opening_time TIME DEFAULT '08:00',
    closing_time TIME DEFAULT '23:00',
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    full_name TEXT NOT NULL,
    avatar_url TEXT,
    phone TEXT,
    email TEXT,
    pin_code TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, role, branch_id)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_tenant(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  RETURN NEW;
END;
$$;

-- 4. MENU TABLES
-- ======================================

CREATE TABLE public.menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    name_en TEXT,
    description TEXT,
    icon TEXT,
    image_url TEXT,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES public.menu_categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    name_en TEXT,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    cost DECIMAL(10, 2) DEFAULT 0,
    image_url TEXT,
    preparation_time INTEGER DEFAULT 15,
    calories INTEGER,
    allergens TEXT[],
    tags TEXT[],
    is_available BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.menu_item_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    is_available BOOLEAN DEFAULT true,
    price_override DECIMAL(10, 2),
    UNIQUE(menu_item_id, branch_id)
);

CREATE TABLE public.modifier_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    name_en TEXT,
    min_selections INTEGER DEFAULT 0,
    max_selections INTEGER DEFAULT 1,
    is_required BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.modifiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID REFERENCES public.modifier_groups(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    name_en TEXT,
    price DECIMAL(10, 2) DEFAULT 0,
    is_default BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.menu_item_modifier_groups (
    menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE CASCADE,
    modifier_group_id UUID REFERENCES public.modifier_groups(id) ON DELETE CASCADE,
    PRIMARY KEY (menu_item_id, modifier_group_id)
);

-- 5. ORDERS TABLES
-- ======================================

CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    order_number TEXT NOT NULL,
    order_type order_type NOT NULL DEFAULT 'dine_in',
    table_id UUID,
    customer_id UUID,
    waiter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    subtotal DECIMAL(10, 2) DEFAULT 0,
    tax_amount DECIMAL(10, 2) DEFAULT 0,
    service_charge DECIMAL(10, 2) DEFAULT 0,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) DEFAULT 0,
    status order_status DEFAULT 'pending',
    payment_status payment_status DEFAULT 'pending',
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price DECIMAL(10, 2) NOT NULL,
    modifiers JSONB DEFAULT '[]',
    notes TEXT,
    status order_status DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    method payment_method NOT NULL,
    reference_number TEXT,
    received_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. TABLES & RESERVATIONS
-- ======================================

CREATE TABLE public.floor_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    zone_id UUID REFERENCES public.floor_zones(id) ON DELETE SET NULL,
    table_number INTEGER NOT NULL,
    seats INTEGER NOT NULL DEFAULT 4,
    status table_status DEFAULT 'available',
    position_x INTEGER DEFAULT 0,
    position_y INTEGER DEFAULT 0,
    shape TEXT DEFAULT 'rectangle',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(branch_id, table_number)
);

CREATE TABLE public.reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    table_id UUID REFERENCES public.tables(id) ON DELETE SET NULL,
    customer_id UUID,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    guests_count INTEGER NOT NULL DEFAULT 2,
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,
    duration_minutes INTEGER DEFAULT 90,
    status reservation_status DEFAULT 'pending',
    notes TEXT,
    deposit_amount DECIMAL(10, 2) DEFAULT 0,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 7. INVENTORY TABLES
-- ======================================

CREATE TABLE public.units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    abbreviation TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.unit_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE NOT NULL,
    to_unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE NOT NULL,
    conversion_factor DECIMAL(10, 6) NOT NULL,
    UNIQUE(from_unit_id, to_unit_id)
);

CREATE TABLE public.inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    name_en TEXT,
    sku TEXT,
    unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
    category TEXT,
    min_stock_level DECIMAL(10, 3) DEFAULT 0,
    max_stock_level DECIMAL(10, 3),
    reorder_point DECIMAL(10, 3),
    cost_per_unit DECIMAL(10, 4) DEFAULT 0,
    shelf_life_days INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.branch_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE NOT NULL,
    quantity DECIMAL(10, 3) DEFAULT 0,
    last_count_date TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(branch_id, item_id)
);

CREATE TABLE public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE NOT NULL,
    movement_type stock_movement_type NOT NULL,
    quantity DECIMAL(10, 3) NOT NULL,
    unit_cost DECIMAL(10, 4),
    reference_id UUID,
    reference_type TEXT,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. RECIPES
-- ======================================

CREATE TABLE public.recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    yield_quantity DECIMAL(10, 3) DEFAULT 1,
    yield_unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
    instructions TEXT,
    prep_time_minutes INTEGER,
    cook_time_minutes INTEGER,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.recipe_ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID REFERENCES public.recipes(id) ON DELETE CASCADE NOT NULL,
    item_id UUID REFERENCES public.inventory_items(id) ON DELETE CASCADE NOT NULL,
    quantity DECIMAL(10, 3) NOT NULL,
    unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
    waste_percentage DECIMAL(5, 2) DEFAULT 0,
    notes TEXT
);

-- 9. SUPPLIERS & PURCHASING
-- ======================================

CREATE TABLE public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    contact_name TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    tax_number TEXT,
    payment_terms_days INTEGER DEFAULT 30,
    rating DECIMAL(3, 2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL NOT NULL,
    order_number TEXT NOT NULL,
    status purchase_order_status DEFAULT 'draft',
    subtotal DECIMAL(12, 2) DEFAULT 0,
    tax_amount DECIMAL(12, 2) DEFAULT 0,
    total DECIMAL(12, 2) DEFAULT 0,
    expected_date DATE,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.purchase_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.purchase_orders(id) ON DELETE CASCADE NOT NULL,
    item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL NOT NULL,
    quantity DECIMAL(10, 3) NOT NULL,
    unit_price DECIMAL(10, 4) NOT NULL,
    received_quantity DECIMAL(10, 3) DEFAULT 0,
    notes TEXT
);

-- 10. CUSTOMERS & LOYALTY
-- ======================================

CREATE TABLE public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    birth_date DATE,
    preferences JSONB DEFAULT '{}',
    allergies TEXT[],
    tags TEXT[],
    notes TEXT,
    is_vip BOOLEAN DEFAULT false,
    marketing_consent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.loyalty_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
    points_balance INTEGER DEFAULT 0,
    wallet_balance DECIMAL(10, 2) DEFAULT 0,
    tier TEXT DEFAULT 'bronze',
    total_spent DECIMAL(12, 2) DEFAULT 0,
    visits_count INTEGER DEFAULT 0,
    last_visit_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(customer_id)
);

-- 11. PROMOTIONS
-- ======================================

CREATE TABLE public.promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    discount_type TEXT NOT NULL,
    discount_value DECIMAL(10, 2) NOT NULL,
    min_order_amount DECIMAL(10, 2),
    max_discount_amount DECIMAL(10, 2),
    applicable_items UUID[],
    applicable_categories UUID[],
    applicable_branches UUID[],
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ,
    usage_limit INTEGER,
    usage_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promotion_id UUID REFERENCES public.promotions(id) ON DELETE CASCADE,
    code TEXT NOT NULL UNIQUE,
    usage_limit INTEGER DEFAULT 1,
    usage_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. HR & SHIFTS
-- ======================================

CREATE TABLE public.employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    employee_number TEXT,
    position TEXT,
    hire_date DATE,
    salary DECIMAL(10, 2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    days_of_week INTEGER[],
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.cashier_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    cashier_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL NOT NULL,
    opening_balance DECIMAL(10, 2) NOT NULL,
    closing_balance DECIMAL(10, 2),
    expected_balance DECIMAL(10, 2),
    variance DECIMAL(10, 2),
    status TEXT DEFAULT 'open',
    opened_at TIMESTAMPTZ DEFAULT now(),
    closed_at TIMESTAMPTZ,
    notes TEXT
);

-- 13. DELIVERY
-- ======================================

CREATE TABLE public.delivery_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    delivery_fee DECIMAL(10, 2) DEFAULT 0,
    min_order_amount DECIMAL(10, 2) DEFAULT 0,
    estimated_time_minutes INTEGER DEFAULT 45,
    polygon JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    vehicle_type TEXT,
    license_number TEXT,
    is_available BOOLEAN DEFAULT true,
    current_latitude DECIMAL(10, 8),
    current_longitude DECIMAL(11, 8),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.delivery_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
    driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
    zone_id UUID REFERENCES public.delivery_zones(id) ON DELETE SET NULL,
    delivery_address TEXT NOT NULL,
    delivery_latitude DECIMAL(10, 8),
    delivery_longitude DECIMAL(11, 8),
    delivery_fee DECIMAL(10, 2) DEFAULT 0,
    status delivery_status DEFAULT 'pending',
    estimated_time TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    delivery_notes TEXT,
    proof_image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 14. KDS
-- ======================================

CREATE TABLE public.kds_stations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    station_type TEXT,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.kds_routing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    station_id UUID REFERENCES public.kds_stations(id) ON DELETE CASCADE NOT NULL,
    category_id UUID REFERENCES public.menu_categories(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE CASCADE
);

-- 15. AUDIT LOG
-- ======================================

CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 16. SYSTEM SETTINGS
-- ======================================

CREATE TABLE public.system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
    setting_key TEXT NOT NULL,
    setting_value JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, branch_id, setting_key)
);

-- ======================================
-- INDEXES
-- ======================================

CREATE INDEX idx_branches_tenant ON public.branches(tenant_id);
CREATE INDEX idx_profiles_tenant ON public.profiles(tenant_id);
CREATE INDEX idx_profiles_branch ON public.profiles(branch_id);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_menu_items_tenant ON public.menu_items(tenant_id);
CREATE INDEX idx_menu_items_category ON public.menu_items(category_id);
CREATE INDEX idx_orders_tenant ON public.orders(tenant_id);
CREATE INDEX idx_orders_branch ON public.orders(branch_id);
CREATE INDEX idx_orders_created_at ON public.orders(created_at);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_reservations_branch_date ON public.reservations(branch_id, reservation_date);
CREATE INDEX idx_stock_movements_branch_item ON public.stock_movements(branch_id, item_id);
CREATE INDEX idx_audit_logs_tenant ON public.audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at);
CREATE INDEX idx_customers_tenant ON public.customers(tenant_id);
CREATE INDEX idx_inventory_items_tenant ON public.inventory_items(tenant_id);
CREATE INDEX idx_employees_tenant ON public.employees(tenant_id);
CREATE INDEX idx_suppliers_tenant ON public.suppliers(tenant_id);
CREATE INDEX idx_purchase_orders_tenant ON public.purchase_orders(tenant_id);
CREATE INDEX idx_delivery_orders_order ON public.delivery_orders(order_id);
CREATE INDEX idx_payments_order ON public.payments(order_id);

-- ======================================
-- TRIGGERS
-- ======================================

-- Auto-update updated_at timestamps
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON public.branches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_menu_categories_updated_at BEFORE UPDATE ON public.menu_categories FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_menu_items_updated_at BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON public.reservations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_inventory_items_updated_at BEFORE UPDATE ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_delivery_orders_updated_at BEFORE UPDATE ON public.delivery_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create profile on signup
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ======================================
-- ROW LEVEL SECURITY (RLS)
-- ======================================

-- Enable RLS on all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floor_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashier_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kds_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kds_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Tenant isolation

-- Tenants
CREATE POLICY "Users can view their tenant" ON public.tenants FOR SELECT USING (id = get_user_tenant(auth.uid()));

-- Branches
CREATE POLICY "Users can view branches in their tenant" ON public.branches FOR SELECT USING (tenant_id = get_user_tenant(auth.uid()));

-- Profiles
CREATE POLICY "Users can view profiles in their tenant" ON public.profiles FOR SELECT USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (id = auth.uid());

-- User Roles
CREATE POLICY "Users can view their roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid());

-- Menu Categories
CREATE POLICY "Users can view menu categories" ON public.menu_categories FOR SELECT USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Admins can insert menu categories" ON public.menu_categories FOR INSERT WITH CHECK (tenant_id = get_user_tenant(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')));
CREATE POLICY "Admins can update menu categories" ON public.menu_categories FOR UPDATE USING (tenant_id = get_user_tenant(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))) WITH CHECK (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Admins can delete menu categories" ON public.menu_categories FOR DELETE USING (tenant_id = get_user_tenant(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')));

-- Menu Items
CREATE POLICY "Users can view menu items in their tenant" ON public.menu_items FOR SELECT USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Admins can insert menu items" ON public.menu_items FOR INSERT WITH CHECK (tenant_id = get_user_tenant(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')));
CREATE POLICY "Admins can update menu items" ON public.menu_items FOR UPDATE USING (tenant_id = get_user_tenant(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager'))) WITH CHECK (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Admins can delete menu items" ON public.menu_items FOR DELETE USING (tenant_id = get_user_tenant(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'manager')));

-- Menu Item Availability
CREATE POLICY "Users can view menu item availability" ON public.menu_item_availability FOR SELECT USING (EXISTS (SELECT 1 FROM menu_items WHERE menu_items.id = menu_item_availability.menu_item_id AND menu_items.tenant_id = get_user_tenant(auth.uid())));

-- Modifier Groups
CREATE POLICY "Users can view modifier groups" ON public.modifier_groups FOR SELECT USING (tenant_id = get_user_tenant(auth.uid()));

-- Modifiers
CREATE POLICY "Users can view modifiers" ON public.modifiers FOR SELECT USING (EXISTS (SELECT 1 FROM modifier_groups WHERE modifier_groups.id = modifiers.group_id AND modifier_groups.tenant_id = get_user_tenant(auth.uid())));

-- Menu Item Modifier Groups
CREATE POLICY "Users can view menu item modifier groups" ON public.menu_item_modifier_groups FOR SELECT USING (EXISTS (SELECT 1 FROM menu_items WHERE menu_items.id = menu_item_modifier_groups.menu_item_id AND menu_items.tenant_id = get_user_tenant(auth.uid())));

-- Orders
CREATE POLICY "Users can view orders in their tenant" ON public.orders FOR SELECT USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can create orders" ON public.orders FOR INSERT WITH CHECK (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can update orders in their tenant" ON public.orders FOR UPDATE USING (tenant_id = get_user_tenant(auth.uid()));

-- Order Items
CREATE POLICY "Users can view order items" ON public.order_items FOR SELECT USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can insert order items" ON public.order_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can update order items" ON public.order_items FOR UPDATE USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.tenant_id = get_user_tenant(auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can delete order items" ON public.order_items FOR DELETE USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.tenant_id = get_user_tenant(auth.uid())));

-- Payments
CREATE POLICY "Users can view payments in their tenant" ON public.payments FOR SELECT USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = payments.order_id AND orders.tenant_id = get_user_tenant(auth.uid())));

-- Floor Zones
CREATE POLICY "Users can view floor zones" ON public.floor_zones FOR SELECT USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = floor_zones.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- Tables
CREATE POLICY "Users can view tables in their tenant" ON public.tables FOR SELECT USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = tables.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- Reservations
CREATE POLICY "Users can view reservations in their tenant" ON public.reservations FOR SELECT USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = reservations.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- Units
CREATE POLICY "Users can view units" ON public.units FOR SELECT USING (tenant_id = get_user_tenant(auth.uid()));

-- Unit Conversions
CREATE POLICY "Users can view unit conversions" ON public.unit_conversions FOR SELECT USING (EXISTS (SELECT 1 FROM units WHERE units.id = unit_conversions.from_unit_id AND units.tenant_id = get_user_tenant(auth.uid())));

-- Inventory Items
CREATE POLICY "Users can view inventory in their tenant" ON public.inventory_items FOR SELECT USING (tenant_id = get_user_tenant(auth.uid()));

-- Branch Stock
CREATE POLICY "Users can view stock in their tenant" ON public.branch_stock FOR SELECT USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = branch_stock.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- Stock Movements
CREATE POLICY "Users can view stock movements in their tenant" ON public.stock_movements FOR SELECT USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = stock_movements.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- Recipes
CREATE POLICY "Users can view recipes" ON public.recipes FOR SELECT USING (tenant_id = get_user_tenant(auth.uid()));

-- Recipe Ingredients
CREATE POLICY "Users can view recipe ingredients" ON public.recipe_ingredients FOR SELECT USING (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.tenant_id = get_user_tenant(auth.uid())));

-- Suppliers
CREATE POLICY "Users can view suppliers in their tenant" ON public.suppliers FOR SELECT USING (tenant_id = get_user_tenant(auth.uid()));

-- Purchase Orders
CREATE POLICY "Users can view purchase orders in their tenant" ON public.purchase_orders FOR SELECT USING (tenant_id = get_user_tenant(auth.uid()));

-- Purchase Order Items (via join)
CREATE POLICY "Users can view purchase order items" ON public.purchase_order_items FOR SELECT USING (EXISTS (SELECT 1 FROM purchase_orders WHERE purchase_orders.id = purchase_order_items.order_id AND purchase_orders.tenant_id = get_user_tenant(auth.uid())));

-- Customers
CREATE POLICY "Users can view customers in their tenant" ON public.customers FOR SELECT USING (tenant_id = get_user_tenant(auth.uid()));

-- Loyalty Accounts
CREATE POLICY "Users can view loyalty accounts" ON public.loyalty_accounts FOR SELECT USING (EXISTS (SELECT 1 FROM customers WHERE customers.id = loyalty_accounts.customer_id AND customers.tenant_id = get_user_tenant(auth.uid())));

-- Promotions
CREATE POLICY "Users can view promotions in their tenant" ON public.promotions FOR SELECT USING (tenant_id = get_user_tenant(auth.uid()));

-- Coupons
CREATE POLICY "Users can view coupons" ON public.coupons FOR SELECT USING (EXISTS (SELECT 1 FROM promotions WHERE promotions.id = coupons.promotion_id AND promotions.tenant_id = get_user_tenant(auth.uid())));

-- Employees
CREATE POLICY "Users can view employees in their tenant" ON public.employees FOR SELECT USING (tenant_id = get_user_tenant(auth.uid()));

-- Shifts
CREATE POLICY "Users can view shifts" ON public.shifts FOR SELECT USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = shifts.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- Cashier Sessions
CREATE POLICY "Users can view cashier sessions" ON public.cashier_sessions FOR SELECT USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = cashier_sessions.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- Delivery Zones
CREATE POLICY "Users can view delivery zones" ON public.delivery_zones FOR SELECT USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = delivery_zones.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- Drivers
CREATE POLICY "Users can view drivers" ON public.drivers FOR SELECT USING (tenant_id = get_user_tenant(auth.uid()));

-- Delivery Orders (via orders join)
CREATE POLICY "Users can view delivery orders" ON public.delivery_orders FOR SELECT USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = delivery_orders.order_id AND orders.tenant_id = get_user_tenant(auth.uid())));

-- KDS Stations
CREATE POLICY "Users can view KDS stations" ON public.kds_stations FOR SELECT USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = kds_stations.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- KDS Routing Rules
CREATE POLICY "Users can view KDS routing rules" ON public.kds_routing_rules FOR SELECT USING (EXISTS (SELECT 1 FROM kds_stations JOIN branches ON branches.id = kds_stations.branch_id WHERE kds_stations.id = kds_routing_rules.station_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- Audit Logs
CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT USING (tenant_id = get_user_tenant(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')));

-- System Settings
CREATE POLICY "Users can view system settings" ON public.system_settings FOR SELECT USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Admins can insert system settings" ON public.system_settings FOR INSERT WITH CHECK (tenant_id = get_user_tenant(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')));
CREATE POLICY "Admins can update system settings" ON public.system_settings FOR UPDATE USING (tenant_id = get_user_tenant(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))) WITH CHECK (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Admins can delete system settings" ON public.system_settings FOR DELETE USING (tenant_id = get_user_tenant(auth.uid()) AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin')));
