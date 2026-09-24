REVOKE EXECUTE ON FUNCTION public.notify_bus_details_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_trip_schedule_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.render_notification_text(text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_notification_broadcast(text, text, text, text, text[], text, timestamptz, uuid, uuid, uuid, uuid) FROM anon;