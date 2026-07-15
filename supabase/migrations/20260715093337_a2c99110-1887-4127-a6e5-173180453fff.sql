-- Make bus trip assignment optional; trips manage available buses via trip_buses table.
ALTER TABLE public.buses ALTER COLUMN trip_id DROP NOT NULL;

-- Ensure a wheel_config row exists so the "Spin" button isn't permanently disabled.
INSERT INTO public.wheel_config (id, enabled, spin_cooldown_days, coupon_expiry_hours, title, subtitle)
VALUES (1, true, 30, 72, 'عجلة السحب', 'جرّب حظك واحصل على خصومات مميزة')
ON CONFLICT (id) DO UPDATE SET enabled = COALESCE(public.wheel_config.enabled, true);