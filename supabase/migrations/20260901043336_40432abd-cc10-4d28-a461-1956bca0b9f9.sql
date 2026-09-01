CREATE OR REPLACE FUNCTION public.tg_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cfg public.push_hook_config%ROWTYPE;
BEGIN
  SELECT * INTO cfg FROM public.push_hook_config WHERE id = 1;
  IF cfg.id IS NULL OR cfg.enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := cfg.endpoint_url,
    body := jsonb_build_object('notification_id', NEW.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-token', cfg.token),
    timeout_milliseconds := 5000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_notification_push() FROM PUBLIC, anon, authenticated;

CREATE POLICY "push hook config is internal only" ON public.push_hook_config
  AS RESTRICTIVE FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);