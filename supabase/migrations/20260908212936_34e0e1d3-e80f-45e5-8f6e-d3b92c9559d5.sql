CREATE TABLE public.settlement_reference (
  id integer PRIMARY KEY DEFAULT 1,
  hotel_costs jsonb NOT NULL DEFAULT '{}'::jsonb,
  hotel_night_prices jsonb NOT NULL DEFAULT '{}'::jsonb,
  extension jsonb NOT NULL DEFAULT '{}'::jsonb,
  commissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  transfer jsonb NOT NULL DEFAULT '{}'::jsonb,
  bus_expenses jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settlement_reference_singleton CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE ON public.settlement_reference TO authenticated;
GRANT ALL ON public.settlement_reference TO service_role;

ALTER TABLE public.settlement_reference ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view settlement reference"
ON public.settlement_reference FOR SELECT TO authenticated
USING (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Staff can insert settlement reference"
ON public.settlement_reference FOR INSERT TO authenticated
WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE POLICY "Staff can update settlement reference"
ON public.settlement_reference FOR UPDATE TO authenticated
USING (public.is_admin_or_manager(auth.uid()))
WITH CHECK (public.is_admin_or_manager(auth.uid()));

CREATE TRIGGER update_settlement_reference_updated_at
BEFORE UPDATE ON public.settlement_reference
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.settlement_reference (id) VALUES (1) ON CONFLICT DO NOTHING;