
-- Fix profiles RLS: allow users to read and update their own profile
DO $$ BEGIN
  -- Drop existing policies if any to avoid conflicts
  DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
  DROP POLICY IF EXISTS "Users can view profiles in tenant" ON public.profiles;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can view profiles in tenant" ON public.profiles FOR SELECT TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- Create user_permissions table for granular page/feature access
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL,
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, permission)
);

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own permissions" ON public.user_permissions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users can view permissions in tenant" ON public.user_permissions FOR SELECT TO authenticated 
  USING (EXISTS (SELECT 1 FROM profiles p1 JOIN profiles p2 ON p1.tenant_id = p2.tenant_id WHERE p1.id = auth.uid() AND p2.id = user_permissions.user_id));
CREATE POLICY "Admins can manage permissions" ON public.user_permissions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'));

-- Create storage bucket for menu item images
INSERT INTO storage.buckets (id, name, public) VALUES ('menu-images', 'menu-images', true) ON CONFLICT (id) DO NOTHING;

-- Storage policies for menu-images
CREATE POLICY "Anyone can view menu images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'menu-images');
CREATE POLICY "Authenticated users can upload menu images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'menu-images');
CREATE POLICY "Authenticated users can update menu images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'menu-images');
CREATE POLICY "Authenticated users can delete menu images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'menu-images');

-- Add inventory deduction trigger (if not exists)
DROP TRIGGER IF EXISTS trigger_deduct_inventory ON public.orders;
CREATE TRIGGER trigger_deduct_inventory
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.deduct_inventory_on_sale();

-- Add missing RLS policies for tables that need INSERT/UPDATE/DELETE
-- employees
CREATE POLICY "Users can insert employees" ON public.employees FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can update employees" ON public.employees FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can delete employees" ON public.employees FOR DELETE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));

-- shifts
CREATE POLICY "Users can insert shifts" ON public.shifts FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM branches WHERE branches.id = shifts.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can update shifts" ON public.shifts FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = shifts.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can delete shifts" ON public.shifts FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = shifts.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- cashier_sessions
CREATE POLICY "Users can insert cashier sessions" ON public.cashier_sessions FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM branches WHERE branches.id = cashier_sessions.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can update cashier sessions" ON public.cashier_sessions FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = cashier_sessions.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- promotions
CREATE POLICY "Users can insert promotions" ON public.promotions FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can update promotions" ON public.promotions FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can delete promotions" ON public.promotions FOR DELETE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));

-- drivers
CREATE POLICY "Users can insert drivers" ON public.drivers FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can update drivers" ON public.drivers FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can delete drivers" ON public.drivers FOR DELETE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));

-- modifiers
CREATE POLICY "Users can insert modifiers" ON public.modifiers FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM modifier_groups WHERE modifier_groups.id = modifiers.group_id AND modifier_groups.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can update modifiers" ON public.modifiers FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM modifier_groups WHERE modifier_groups.id = modifiers.group_id AND modifier_groups.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can delete modifiers" ON public.modifiers FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM modifier_groups WHERE modifier_groups.id = modifiers.group_id AND modifier_groups.tenant_id = get_user_tenant(auth.uid())));

-- modifier_groups
CREATE POLICY "Users can insert modifier groups" ON public.modifier_groups FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can update modifier groups" ON public.modifier_groups FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can delete modifier groups" ON public.modifier_groups FOR DELETE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));

-- kds_stations
CREATE POLICY "Users can insert kds stations" ON public.kds_stations FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM branches WHERE branches.id = kds_stations.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can update kds stations" ON public.kds_stations FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = kds_stations.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can delete kds stations" ON public.kds_stations FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = kds_stations.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- coupons
CREATE POLICY "Users can insert coupons" ON public.coupons FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM promotions WHERE promotions.id = coupons.promotion_id AND promotions.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can update coupons" ON public.coupons FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM promotions WHERE promotions.id = coupons.promotion_id AND promotions.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can delete coupons" ON public.coupons FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM promotions WHERE promotions.id = coupons.promotion_id AND promotions.tenant_id = get_user_tenant(auth.uid())));

-- loyalty_accounts
CREATE POLICY "Users can insert loyalty accounts" ON public.loyalty_accounts FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM customers WHERE customers.id = loyalty_accounts.customer_id AND customers.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can update loyalty accounts" ON public.loyalty_accounts FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM customers WHERE customers.id = loyalty_accounts.customer_id AND customers.tenant_id = get_user_tenant(auth.uid())));

-- unit_conversions
CREATE POLICY "Users can insert unit conversions" ON public.unit_conversions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update unit conversions" ON public.unit_conversions FOR UPDATE TO authenticated USING (true);

-- menu_item_availability
CREATE POLICY "Users can insert menu item availability" ON public.menu_item_availability FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM menu_items WHERE menu_items.id = menu_item_availability.menu_item_id AND menu_items.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can update menu item availability" ON public.menu_item_availability FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM menu_items WHERE menu_items.id = menu_item_availability.menu_item_id AND menu_items.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can delete menu item availability" ON public.menu_item_availability FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM menu_items WHERE menu_items.id = menu_item_availability.menu_item_id AND menu_items.tenant_id = get_user_tenant(auth.uid())));

-- units delete
CREATE POLICY "Users can delete units" ON public.units FOR DELETE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));

-- orders delete
CREATE POLICY "Users can delete orders" ON public.orders FOR DELETE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));

-- branch_stock delete
CREATE POLICY "Users can delete branch stock" ON public.branch_stock FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = branch_stock.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- kds_routing_rules
CREATE POLICY "Users can insert kds routing rules" ON public.kds_routing_rules FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM kds_stations JOIN branches ON branches.id = kds_stations.branch_id WHERE kds_stations.id = kds_routing_rules.station_id AND branches.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can update kds routing rules" ON public.kds_routing_rules FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM kds_stations JOIN branches ON branches.id = kds_stations.branch_id WHERE kds_stations.id = kds_routing_rules.station_id AND branches.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can delete kds routing rules" ON public.kds_routing_rules FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM kds_stations JOIN branches ON branches.id = kds_stations.branch_id WHERE kds_stations.id = kds_routing_rules.station_id AND branches.tenant_id = get_user_tenant(auth.uid())));
