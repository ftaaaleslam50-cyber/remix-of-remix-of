
-- Columns
ALTER TABLE public.wheel_spins
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS device_id text;

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS device_id text;

CREATE INDEX IF NOT EXISTS wheel_spins_phone_idx ON public.wheel_spins(phone);
CREATE INDEX IF NOT EXISTS wheel_spins_ip_idx ON public.wheel_spins(ip);
CREATE INDEX IF NOT EXISTS wheel_spins_device_id_idx ON public.wheel_spins(device_id);
CREATE INDEX IF NOT EXISTS wheel_spins_user_id_idx ON public.wheel_spins(user_id);
CREATE INDEX IF NOT EXISTS coupons_user_id_idx ON public.coupons(user_id);
CREATE INDEX IF NOT EXISTS coupons_device_id_idx ON public.coupons(device_id);

-- Secure spin function (server-authoritative)
CREATE OR REPLACE FUNCTION public.perform_spin(
  _phone text,
  _ip text,
  _device_id text,
  _user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg RECORD;
  cutoff timestamptz;
  recent_row RECORD;
  seg RECORD;
  total_weight numeric := 0;
  r numeric;
  chosen RECORD;
  new_code text;
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
  coupon_id_new uuid;
  effective_user uuid;
BEGIN
  -- Sanitize inputs
  IF _phone IS NULL OR length(_phone) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  END IF;

  -- Trust the auth context first; fall back to explicit arg for guests
  effective_user := COALESCE(auth.uid(), _user_id);

  SELECT * INTO cfg FROM public.wheel_config WHERE id = 1;
  IF cfg IS NULL OR cfg.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'disabled');
  END IF;

  cutoff := now() - make_interval(days => cfg.spin_cooldown_days);

  -- Cooldown check across phone / IP / device / user
  SELECT spun_at INTO recent_row
  FROM public.wheel_spins
  WHERE spun_at >= cutoff
    AND (
      phone = _phone
      OR (_ip IS NOT NULL AND ip = _ip)
      OR (_device_id IS NOT NULL AND device_id = _device_id)
      OR (effective_user IS NOT NULL AND user_id = effective_user)
    )
  ORDER BY spun_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'cooldown',
      'next_at', (recent_row.spun_at + make_interval(days => cfg.spin_cooldown_days))
    );
  END IF;

  -- Weighted pick from active segments
  SELECT COALESCE(SUM(probability_weight), 0) INTO total_weight
  FROM public.wheel_segments WHERE active = true;

  IF total_weight <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_segments');
  END IF;

  r := random() * total_weight;
  FOR seg IN
    SELECT * FROM public.wheel_segments
    WHERE active = true
    ORDER BY display_order
  LOOP
    r := r - COALESCE(seg.probability_weight, 0);
    IF r <= 0 THEN
      chosen := seg;
      EXIT;
    END IF;
  END LOOP;

  IF chosen IS NULL THEN
    SELECT * INTO chosen FROM public.wheel_segments
    WHERE active = true
    ORDER BY display_order DESC LIMIT 1;
  END IF;

  -- Issue coupon if winner
  IF chosen.prize_type <> 'lose' THEN
    LOOP
      new_code := 'ZT-';
      FOR i IN 1..8 LOOP
        new_code := new_code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.coupons WHERE code = new_code);
    END LOOP;

    INSERT INTO public.coupons(
      code, phone, ip, prize_type, prize_value, label,
      expiry_date, source, user_id, device_id
    ) VALUES (
      new_code, _phone, _ip, chosen.prize_type, chosen.prize_value, chosen.label,
      now() + make_interval(hours => cfg.coupon_expiry_hours),
      'wheel', effective_user, _device_id
    ) RETURNING id INTO coupon_id_new;
  END IF;

  INSERT INTO public.wheel_spins(phone, ip, device_id, user_id, segment_id, coupon_id)
  VALUES (_phone, _ip, _device_id, effective_user, chosen.id, coupon_id_new);

  RETURN jsonb_build_object(
    'ok', true,
    'segment_id', chosen.id,
    'label', chosen.label,
    'prize_type', chosen.prize_type,
    'prize_value', chosen.prize_value,
    'color', chosen.color,
    'coupon_code', new_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.perform_spin(text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.perform_spin(text, text, text, uuid) TO anon, authenticated;
