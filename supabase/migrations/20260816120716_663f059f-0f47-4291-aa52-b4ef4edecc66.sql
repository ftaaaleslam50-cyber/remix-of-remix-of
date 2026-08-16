CREATE TABLE IF NOT EXISTS public.coupon_ip_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  coupon_id uuid REFERENCES public.coupons(id) ON DELETE CASCADE,
  coupon_code text NOT NULL,
  reward_id uuid,
  source text NOT NULL DEFAULT 'link',
  device_id text,
  user_id uuid,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS coupon_ip_bindings_ip_code_key ON public.coupon_ip_bindings (ip, coupon_code);
CREATE INDEX IF NOT EXISTS coupon_ip_bindings_ip_idx ON public.coupon_ip_bindings (ip);

GRANT SELECT ON public.coupon_ip_bindings TO authenticated;
GRANT ALL ON public.coupon_ip_bindings TO service_role;

ALTER TABLE public.coupon_ip_bindings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read coupon ip bindings" ON public.coupon_ip_bindings;
CREATE POLICY "staff read coupon ip bindings" ON public.coupon_ip_bindings
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR user_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.bind_coupon_to_ip(
  _code text, _ip text, _source text DEFAULT 'link',
  _device_id text DEFAULT NULL, _user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  c public.coupons%ROWTYPE;
  eff_user uuid := COALESCE(auth.uid(), _user_id);
BEGIN
  IF _ip IS NULL OR btrim(_ip) = '' OR _code IS NULL OR btrim(_code) = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_input');
  END IF;

  SELECT * INTO c FROM public.coupons WHERE upper(code) = upper(btrim(_code)) LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF c.active IS FALSE OR c.expiry_date < now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  INSERT INTO public.coupon_ip_bindings(ip, coupon_id, coupon_code, source, device_id, user_id, expires_at)
  VALUES (_ip, c.id, c.code, COALESCE(_source, 'link'), _device_id, eff_user, c.expiry_date)
  ON CONFLICT (ip, coupon_code) DO UPDATE
    SET user_id = COALESCE(public.coupon_ip_bindings.user_id, EXCLUDED.user_id),
        device_id = COALESCE(public.coupon_ip_bindings.device_id, EXCLUDED.device_id),
        expires_at = EXCLUDED.expires_at;

  RETURN jsonb_build_object('ok', true, 'code', c.code, 'source', COALESCE(_source, 'link'));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_coupon_for_ip(_ip text)
RETURNS TABLE(code text, prize_type text, prize_value numeric, label text, expiry_date timestamptz, source text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH candidates AS (
    SELECT c.*, b.source AS bind_source, b.created_at AS bound_at
    FROM public.coupon_ip_bindings b
    JOIN public.coupons c ON c.code = b.coupon_code
    WHERE b.ip = _ip AND b.status = 'active'
    UNION ALL
    SELECT c.*, c.source AS bind_source, c.created_at AS bound_at
    FROM public.coupons c
    WHERE c.ip = _ip
  )
  SELECT DISTINCT ON (x.code)
         x.code, x.prize_type, x.prize_value, x.label, x.expiry_date, x.bind_source
  FROM candidates x
  WHERE x.active
    AND x.prize_type <> 'lose'
    AND x.expiry_date >= now()
    AND (x.start_date IS NULL OR x.start_date <= now())
    AND (
      (x.max_uses IS NOT NULL AND COALESCE(x.usage_count, 0) < x.max_uses)
      OR (x.max_uses IS NULL AND x.used IS NOT TRUE)
    )
  ORDER BY x.code, x.bound_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.bind_coupon_to_ip(text, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bind_coupon_to_ip(text, text, text, text, uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_coupon_for_ip(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_coupon_for_ip(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.perform_spin(_phone text, _ip text, _device_id text, _user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  prev_coupon RECORD;
  prev_seg RECORD;
BEGIN
  IF _phone IS NULL OR length(_phone) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  END IF;

  effective_user := COALESCE(auth.uid(), _user_id);

  SELECT * INTO cfg FROM public.wheel_config WHERE id = 1;
  IF cfg IS NULL OR cfg.enabled IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'disabled');
  END IF;

  cutoff := now() - make_interval(days => cfg.spin_cooldown_days);

  SELECT * INTO recent_row
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
    -- Idempotent replay: return the reward already granted instead of a new one.
    SELECT * INTO prev_seg FROM public.wheel_segments WHERE id = recent_row.segment_id;
    SELECT * INTO prev_coupon FROM public.coupons WHERE id = recent_row.coupon_id;

    IF prev_coupon.id IS NOT NULL AND prev_coupon.active AND prev_coupon.expiry_date >= now() THEN
      IF _ip IS NOT NULL THEN
        INSERT INTO public.coupon_ip_bindings(ip, coupon_id, coupon_code, reward_id, source, device_id, user_id, expires_at)
        VALUES (_ip, prev_coupon.id, prev_coupon.code, recent_row.segment_id, 'wheel', _device_id, effective_user, prev_coupon.expiry_date)
        ON CONFLICT (ip, coupon_code) DO NOTHING;
      END IF;
      RETURN jsonb_build_object(
        'ok', true,
        'replay', true,
        'segment_id', recent_row.segment_id,
        'label', COALESCE(prev_seg.label, prev_coupon.label),
        'prize_type', prev_coupon.prize_type,
        'prize_value', prev_coupon.prize_value,
        'color', prev_seg.color,
        'coupon_code', prev_coupon.code,
        'next_at', (recent_row.spun_at + make_interval(days => cfg.spin_cooldown_days))
      );
    END IF;

    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'cooldown',
      'next_at', (recent_row.spun_at + make_interval(days => cfg.spin_cooldown_days))
    );
  END IF;

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

    IF _ip IS NOT NULL THEN
      INSERT INTO public.coupon_ip_bindings(ip, coupon_id, coupon_code, reward_id, source, device_id, user_id, expires_at)
      VALUES (_ip, coupon_id_new, new_code, chosen.id, 'wheel', _device_id, effective_user,
              now() + make_interval(hours => cfg.coupon_expiry_hours))
      ON CONFLICT (ip, coupon_code) DO NOTHING;
    END IF;
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
$function$;