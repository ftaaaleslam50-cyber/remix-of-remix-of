-- lovable-cron-fallback-reviewed: 288 runs/day; only while retryable rows exist — job is armed on transient failure and unschedules itself after drain (wake-on-enqueue, zero cost when idle)
-- 1) Duplicate trigger: keep trg_booking_notify, drop the older duplicate
DROP TRIGGER IF EXISTS booking_notify ON public.bookings;

-- 2) Delivery tracking table
CREATE TABLE IF NOT EXISTS public.push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','expired')),
  attempt_count integer NOT NULL DEFAULT 0,
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  failed_at timestamptz,
  next_retry_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, subscription_id)
);
CREATE INDEX IF NOT EXISTS push_deliveries_retry_idx ON public.push_deliveries (next_retry_at) WHERE status IN ('pending','failed') AND next_retry_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS push_deliveries_created_idx ON public.push_deliveries (created_at DESC);

GRANT SELECT ON public.push_deliveries TO authenticated;
GRANT ALL ON public.push_deliveries TO service_role;

ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read push deliveries" ON public.push_deliveries
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER push_deliveries_updated BEFORE UPDATE ON public.push_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

-- 3) Secure subscription sync: endpoint = device/browser. The signed-in user takes ownership of the endpoint
--    (same device, different account) without being able to read/alter other users' rows.
CREATE OR REPLACE FUNCTION public.sync_push_subscription(_endpoint text, _p256dh text, _auth text, _user_agent text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  sid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  IF _endpoint IS NULL OR btrim(_endpoint) = '' OR _p256dh IS NULL OR _auth IS NULL THEN
    RAISE EXCEPTION 'Invalid subscription' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, is_active, last_error, updated_at)
  VALUES (uid, _endpoint, _p256dh, _auth, _user_agent, true, NULL, now())
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        user_agent = COALESCE(EXCLUDED.user_agent, public.push_subscriptions.user_agent),
        is_active = true,
        last_error = NULL,
        updated_at = now()
  RETURNING id INTO sid;

  RETURN sid;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_push_subscription(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_push_subscription(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.deactivate_push_subscription(_endpoint text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  n integer;
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;
  UPDATE public.push_subscriptions
     SET is_active = false, last_error = 'user-disabled', updated_at = now()
   WHERE endpoint = _endpoint AND user_id = uid;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;
REVOKE ALL ON FUNCTION public.deactivate_push_subscription(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deactivate_push_subscription(text) TO authenticated;

-- 4) Wake-on-enqueue retry: the dispatcher arms a short-lived kicker only while retryable rows exist;
--    the kicker unschedules itself as soon as the queue is drained (no permanent polling).
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT USAGE ON SCHEMA cron TO postgres;

CREATE OR REPLACE FUNCTION public.push_retry_kick()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cfg public.push_hook_config%ROWTYPE;
  has_future boolean;
BEGIN
  UPDATE public.push_deliveries
     SET status = 'expired', updated_at = now(),
         error_code = COALESCE(error_code, 'expired'),
         error_message = COALESCE(error_message, 'انتهت صلاحية الإرسال بعد 24 ساعة')
   WHERE status IN ('pending','failed','sending')
     AND queued_at < now() - interval '24 hours';

  IF NOT EXISTS (
    SELECT 1 FROM public.push_deliveries
     WHERE status IN ('pending','failed')
       AND attempt_count < 3
       AND (next_retry_at IS NULL OR next_retry_at <= now())
       AND queued_at >= now() - interval '24 hours'
  ) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.push_deliveries
       WHERE status IN ('pending','failed') AND attempt_count < 3
         AND queued_at >= now() - interval '24 hours'
    ) INTO has_future;
    IF NOT has_future THEN
      PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'push-retry-kick';
    END IF;
    RETURN false;
  END IF;

  SELECT * INTO cfg FROM public.push_hook_config WHERE id = 1;
  IF cfg.id IS NULL OR cfg.enabled IS NOT TRUE THEN RETURN false; END IF;

  PERFORM net.http_post(
    url := cfg.endpoint_url,
    body := jsonb_build_object('retry', true),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-token', cfg.token),
    timeout_milliseconds := 5000
  );
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.push_retry_kick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_retry_kick() TO service_role;

CREATE OR REPLACE FUNCTION public.arm_push_retry()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-retry-kick') THEN
    RETURN false;
  END IF;
  PERFORM cron.schedule('push-retry-kick', '*/5 * * * *', 'SELECT public.push_retry_kick();');
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.arm_push_retry() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arm_push_retry() TO service_role;