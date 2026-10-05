CREATE TABLE public.rep_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rep_key text NOT NULL UNIQUE,
  rep_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  source_name text,
  amount numeric NOT NULL DEFAULT 0,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rep_debts TO authenticated;
GRANT ALL ON public.rep_debts TO service_role;
ALTER TABLE public.rep_debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers manage rep debts" ON public.rep_debts FOR ALL TO authenticated
  USING (public.is_admin_or_manager(auth.uid())) WITH CHECK (public.is_admin_or_manager(auth.uid()));
CREATE POLICY "Reps read own debts" ON public.rep_debts FOR SELECT TO authenticated
  USING (rep_profile_id = auth.uid());
CREATE TRIGGER rep_debts_updated BEFORE UPDATE ON public.rep_debts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();