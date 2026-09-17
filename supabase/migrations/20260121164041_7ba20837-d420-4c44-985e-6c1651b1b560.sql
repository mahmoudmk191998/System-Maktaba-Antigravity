-- Enable RLS on remaining tables
ALTER TABLE public.menu_item_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_modifier_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floor_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_conversions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashier_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kds_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kds_routing_rules ENABLE ROW LEVEL SECURITY;

-- Fix function search paths
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add RLS policies for remaining tables
CREATE POLICY "Users can view menu item availability" ON public.menu_item_availability
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.menu_items 
    WHERE menu_items.id = menu_item_availability.menu_item_id 
    AND menu_items.tenant_id = public.get_user_tenant(auth.uid())
  ));

CREATE POLICY "Users can view modifier groups" ON public.modifier_groups
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Users can view modifiers" ON public.modifiers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.modifier_groups 
    WHERE modifier_groups.id = modifiers.group_id 
    AND modifier_groups.tenant_id = public.get_user_tenant(auth.uid())
  ));

CREATE POLICY "Users can view menu item modifier groups" ON public.menu_item_modifier_groups
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.menu_items 
    WHERE menu_items.id = menu_item_modifier_groups.menu_item_id 
    AND menu_items.tenant_id = public.get_user_tenant(auth.uid())
  ));

CREATE POLICY "Users can view floor zones" ON public.floor_zones
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.branches 
    WHERE branches.id = floor_zones.branch_id 
    AND branches.tenant_id = public.get_user_tenant(auth.uid())
  ));

CREATE POLICY "Users can view units" ON public.units
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Users can view unit conversions" ON public.unit_conversions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.units 
    WHERE units.id = unit_conversions.from_unit_id 
    AND units.tenant_id = public.get_user_tenant(auth.uid())
  ));

CREATE POLICY "Users can view recipes" ON public.recipes
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Users can view recipe ingredients" ON public.recipe_ingredients
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.recipes 
    WHERE recipes.id = recipe_ingredients.recipe_id 
    AND recipes.tenant_id = public.get_user_tenant(auth.uid())
  ));

CREATE POLICY "Users can view purchase order items" ON public.purchase_order_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_orders 
    WHERE purchase_orders.id = purchase_order_items.order_id 
    AND purchase_orders.tenant_id = public.get_user_tenant(auth.uid())
  ));

CREATE POLICY "Users can view loyalty accounts" ON public.loyalty_accounts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.customers 
    WHERE customers.id = loyalty_accounts.customer_id 
    AND customers.tenant_id = public.get_user_tenant(auth.uid())
  ));

CREATE POLICY "Users can view coupons" ON public.coupons
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.promotions 
    WHERE promotions.id = coupons.promotion_id 
    AND promotions.tenant_id = public.get_user_tenant(auth.uid())
  ));

CREATE POLICY "Users can view shifts" ON public.shifts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.branches 
    WHERE branches.id = shifts.branch_id 
    AND branches.tenant_id = public.get_user_tenant(auth.uid())
  ));

CREATE POLICY "Users can view cashier sessions" ON public.cashier_sessions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.branches 
    WHERE branches.id = cashier_sessions.branch_id 
    AND branches.tenant_id = public.get_user_tenant(auth.uid())
  ));

CREATE POLICY "Users can view delivery zones" ON public.delivery_zones
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.branches 
    WHERE branches.id = delivery_zones.branch_id 
    AND branches.tenant_id = public.get_user_tenant(auth.uid())
  ));

CREATE POLICY "Users can view drivers" ON public.drivers
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant(auth.uid()));

CREATE POLICY "Users can view delivery orders" ON public.delivery_orders
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.id = delivery_orders.order_id 
    AND orders.tenant_id = public.get_user_tenant(auth.uid())
  ));

CREATE POLICY "Users can view KDS stations" ON public.kds_stations
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.branches 
    WHERE branches.id = kds_stations.branch_id 
    AND branches.tenant_id = public.get_user_tenant(auth.uid())
  ));

CREATE POLICY "Users can view KDS routing rules" ON public.kds_routing_rules
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.kds_stations 
    JOIN public.branches ON branches.id = kds_stations.branch_id
    WHERE kds_stations.id = kds_routing_rules.station_id 
    AND branches.tenant_id = public.get_user_tenant(auth.uid())
  ));