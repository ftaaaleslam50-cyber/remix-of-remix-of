
-- Assets table
CREATE TABLE IF NOT EXISTS public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  public_url text NOT NULL,
  mime_type text,
  size_bytes bigint,
  width integer,
  height integer,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assets_select_auth" ON public.assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "assets_admin_insert" ON public.assets FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "assets_admin_update" ON public.assets FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "assets_admin_delete" ON public.assets FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER assets_updated_at BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Asset usages (polymorphic)
CREATE TABLE IF NOT EXISTS public.asset_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  field_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, entity_type, entity_id, field_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_usages TO authenticated;
GRANT ALL ON public.asset_usages TO service_role;

ALTER TABLE public.asset_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "asset_usages_select_auth" ON public.asset_usages FOR SELECT TO authenticated USING (true);
CREATE POLICY "asset_usages_admin_all" ON public.asset_usages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS asset_usages_entity_idx ON public.asset_usages(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS asset_usages_asset_idx ON public.asset_usages(asset_id);
