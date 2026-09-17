
-- Add INSERT/UPDATE/DELETE policies for all tables that need them

-- tenants: allow authenticated users to insert (for onboarding)
CREATE POLICY "Users can insert tenants" ON public.tenants FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update their tenant" ON public.tenants FOR UPDATE TO authenticated USING (id = get_user_tenant(auth.uid()));

-- branches
CREATE POLICY "Users can insert branches" ON public.branches FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can update branches" ON public.branches FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can delete branches" ON public.branches FOR DELETE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));

-- profiles: allow insert for new user creation
CREATE POLICY "Users can insert profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- tables
CREATE POLICY "Users can insert tables" ON public.tables FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM branches WHERE branches.id = tables.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can update tables" ON public.tables FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = tables.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can delete tables" ON public.tables FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = tables.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- reservations
CREATE POLICY "Users can insert reservations" ON public.reservations FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM branches WHERE branches.id = reservations.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can update reservations" ON public.reservations FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = reservations.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can delete reservations" ON public.reservations FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = reservations.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- menu_categories
CREATE POLICY "Users can insert menu categories" ON public.menu_categories FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can update menu categories" ON public.menu_categories FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can delete menu categories" ON public.menu_categories FOR DELETE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));

-- menu_items (already has admin manage policy, but let's ensure all users can insert for now)
-- Already has "Admins can manage menu items" policy

-- inventory_items
CREATE POLICY "Users can insert inventory items" ON public.inventory_items FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can update inventory items" ON public.inventory_items FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can delete inventory items" ON public.inventory_items FOR DELETE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));

-- suppliers
CREATE POLICY "Users can insert suppliers" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can update suppliers" ON public.suppliers FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can delete suppliers" ON public.suppliers FOR DELETE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));

-- purchase_orders
CREATE POLICY "Users can insert purchase orders" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can update purchase orders" ON public.purchase_orders FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can delete purchase orders" ON public.purchase_orders FOR DELETE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));

-- purchase_order_items
CREATE POLICY "Users can manage purchase order items" ON public.purchase_order_items FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM purchase_orders WHERE purchase_orders.id = purchase_order_items.order_id AND purchase_orders.tenant_id = get_user_tenant(auth.uid())));

-- stock_movements
CREATE POLICY "Users can insert stock movements" ON public.stock_movements FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM branches WHERE branches.id = stock_movements.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- branch_stock
CREATE POLICY "Users can insert branch stock" ON public.branch_stock FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM branches WHERE branches.id = branch_stock.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can update branch stock" ON public.branch_stock FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = branch_stock.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- payments
CREATE POLICY "Users can insert payments" ON public.payments FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM orders WHERE orders.id = payments.order_id AND orders.tenant_id = get_user_tenant(auth.uid())));

-- recipes
CREATE POLICY "Users can insert recipes" ON public.recipes FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can update recipes" ON public.recipes FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can delete recipes" ON public.recipes FOR DELETE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));

-- recipe_ingredients
CREATE POLICY "Users can manage recipe ingredients" ON public.recipe_ingredients FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM recipes WHERE recipes.id = recipe_ingredients.recipe_id AND recipes.tenant_id = get_user_tenant(auth.uid())));

-- units
CREATE POLICY "Users can insert units" ON public.units FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can update units" ON public.units FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));

-- customers
CREATE POLICY "Users can insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can update customers" ON public.customers FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can delete customers" ON public.customers FOR DELETE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));

-- user_roles
CREATE POLICY "Admins can manage user roles" ON public.user_roles FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.tenant_id IS NOT NULL));

-- floor_zones
CREATE POLICY "Users can insert floor zones" ON public.floor_zones FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM branches WHERE branches.id = floor_zones.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can update floor zones" ON public.floor_zones FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = floor_zones.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));
CREATE POLICY "Users can delete floor zones" ON public.floor_zones FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM branches WHERE branches.id = floor_zones.branch_id AND branches.tenant_id = get_user_tenant(auth.uid())));

-- audit_logs: allow insert for logging
CREATE POLICY "Users can insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant(auth.uid()));

-- Also allow all users to manage menu items (not just admins)
CREATE POLICY "Users can insert menu items" ON public.menu_items FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can update menu items" ON public.menu_items FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));
CREATE POLICY "Users can delete menu items" ON public.menu_items FOR DELETE TO authenticated USING (tenant_id = get_user_tenant(auth.uid()));

-- Create a function to auto-deduct inventory on order completion
CREATE OR REPLACE FUNCTION public.deduct_inventory_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_item RECORD;
  v_recipe RECORD;
  v_ingredient RECORD;
BEGIN
  -- Only trigger when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Get order details
    SELECT * INTO v_order FROM orders WHERE id = NEW.id;
    
    -- Loop through order items
    FOR v_item IN SELECT * FROM order_items WHERE order_id = NEW.id
    LOOP
      -- Find recipe for this menu item
      FOR v_recipe IN SELECT * FROM recipes WHERE menu_item_id = v_item.menu_item_id
      LOOP
        -- Deduct each ingredient
        FOR v_ingredient IN SELECT * FROM recipe_ingredients WHERE recipe_id = v_recipe.id
        LOOP
          -- Update branch stock
          UPDATE branch_stock 
          SET quantity = GREATEST(quantity - (v_ingredient.quantity * v_item.quantity), 0),
              updated_at = now()
          WHERE branch_id = v_order.branch_id 
            AND item_id = v_ingredient.item_id;
          
          -- Record stock movement
          INSERT INTO stock_movements (branch_id, item_id, movement_type, quantity, reference_id, reference_type, notes, created_by)
          VALUES (v_order.branch_id, v_ingredient.item_id, 'consumption', -(v_ingredient.quantity * v_item.quantity), NEW.id, 'order', 'خصم تلقائي - طلب ' || v_order.order_number, v_order.created_by);
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for auto-deduction
DROP TRIGGER IF EXISTS trigger_deduct_inventory ON public.orders;
CREATE TRIGGER trigger_deduct_inventory
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.deduct_inventory_on_sale();

-- Create trigger for updated_at columns
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- Add updated_at triggers to key tables
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['tenants','branches','profiles','menu_categories','menu_items','inventory_items','suppliers','purchase_orders','orders','customers','reservations','recipes','system_settings'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON public.%I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t);
  END LOOP;
END $$;

-- Seed default units
INSERT INTO public.units (id, tenant_id, name, abbreviation) 
SELECT gen_random_uuid(), t.id, u.name, u.abbr
FROM (VALUES ('كيلوجرام','كجم'),('جرام','جم'),('لتر','لتر'),('مليلتر','مل'),('قطعة','قطعة'),('علبة','علبة'),('كيس','كيس'),('صندوق','صندوق'),('ملعقة كبيرة','م.ك'),('ملعقة صغيرة','م.ص'),('كوب','كوب'),('حزمة','حزمة')) AS u(name, abbr)
CROSS JOIN public.tenants t
WHERE NOT EXISTS (SELECT 1 FROM public.units WHERE units.tenant_id = t.id AND units.name = u.name);
