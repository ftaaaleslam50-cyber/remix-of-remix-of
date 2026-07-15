DROP POLICY IF EXISTS "packages public read" ON public.packages;
CREATE POLICY "packages public read active" ON public.packages FOR SELECT TO anon, authenticated USING (active = true);
CREATE POLICY "packages admin read all" ON public.packages FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));