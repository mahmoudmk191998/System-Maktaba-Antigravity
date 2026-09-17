
-- Fix the overly permissive tenant insert policy
DROP POLICY "Users can insert tenants" ON public.tenants;

-- Create a more restrictive policy: only allow insert if user has no tenant yet
CREATE POLICY "Users can insert tenants" ON public.tenants FOR INSERT TO authenticated 
WITH CHECK (NOT EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.tenant_id IS NOT NULL));
