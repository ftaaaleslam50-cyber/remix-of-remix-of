CREATE TABLE public.representatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  notes text,
  active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.representatives TO authenticated;
GRANT ALL ON public.representatives TO service_role;

ALTER TABLE public.representatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reps_read_authenticated" ON public.representatives
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "reps_admin_write" ON public.representatives
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER trg_representatives_updated_at
  BEFORE UPDATE ON public.representatives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();