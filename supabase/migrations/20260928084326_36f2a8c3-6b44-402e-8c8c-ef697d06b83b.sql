CREATE TABLE public.deleted_buses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id uuid NOT NULL,
  bus_label text,
  bus_number integer,
  plate text,
  driver_name text,
  snapshot jsonb NOT NULL,
  deleted_by uuid,
  deleted_by_name text,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  restored_at timestamptz,
  restored_by uuid,
  restored_bus_id uuid,
  restore_notes text
);
GRANT SELECT ON public.deleted_buses TO authenticated;
GRANT ALL ON public.deleted_buses TO service_role;
ALTER TABLE public.deleted_buses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read deleted buses" ON public.deleted_buses FOR SELECT TO authenticated
  USING (public.is_admin_or_manager(auth.uid()));

-- Delete bus(es) atomically after saving a full restore snapshot.
CREATE OR REPLACE FUNCTION public.delete_bus_with_snapshot(_bus_id uuid, _delete_bookings boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b public.buses; snap jsonb; sid uuid; uname text;
BEGIN
  IF NOT public.is_admin_or_manager(auth.uid()) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO b FROM public.buses WHERE id = _bus_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'الحافلة غير موجودة'; END IF;
  SELECT coalesce(p.full_name, u.email) INTO uname FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE u.id = auth.uid();

  snap := jsonb_build_object(
    'version', 1,
    'bus', to_jsonb(b),
    'layout', (SELECT to_jsonb(l) FROM public.bus_layouts l WHERE l.id = b.layout_id),
    'trip_buses', coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM public.trip_buses t WHERE t.bus_id = _bus_id), '[]'),
    'return_trip_buses', coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM public.return_trip_buses r WHERE r.bus_id = _bus_id), '[]'),
    'occupancy_alerts', coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM public.bus_occupancy_alerts a WHERE a.bus_id = _bus_id), '[]'),
    'deleted_bookings', CASE WHEN _delete_bookings THEN coalesce((SELECT jsonb_agg(to_jsonb(k)) FROM public.bookings k WHERE k.bus_id = _bus_id), '[]') ELSE '[]' END,
    'linked_booking_ids', coalesce((SELECT jsonb_agg(k.id) FROM public.bookings k WHERE k.bus_id = _bus_id), '[]'),
    'return_linked_booking_ids', coalesce((SELECT jsonb_agg(k.id) FROM public.bookings k WHERE k.return_bus_id = _bus_id), '[]'),
    'deleted_bookings_flag', _delete_bookings
  );

  INSERT INTO public.deleted_buses(bus_id, bus_label, bus_number, plate, driver_name, snapshot, deleted_by, deleted_by_name)
  VALUES (_bus_id, coalesce(b.name, 'حافلة ' || b.bus_number), b.bus_number, b.plate, b.driver_name, snap, auth.uid(), uname)
  RETURNING id INTO sid;

  IF sid IS NULL THEN RAISE EXCEPTION 'فشل حفظ نسخة الاسترجاع'; END IF;

  IF _delete_bookings THEN
    DELETE FROM public.bookings WHERE bus_id = _bus_id;
  END IF;
  DELETE FROM public.bus_occupancy_alerts WHERE bus_id = _bus_id;
  DELETE FROM public.buses WHERE id = _bus_id;

  INSERT INTO public.audit_log(actor_id, actor_name, action, entity, entity_id, details)
  VALUES (auth.uid(), uname, 'bus.delete', 'bus', _bus_id::text, jsonb_build_object('snapshot_id', sid, 'bus_number', b.bus_number, 'plate', b.plate, 'deleted_bookings', _delete_bookings));
  RETURN sid;
END $$;

-- Insert a row from jsonb, skipping generated columns.
CREATE OR REPLACE FUNCTION public._insert_json_row(_table text, _row jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ',' ORDER BY ordinal_position) INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = _table AND is_generated = 'NEVER'
    AND (_row ? column_name);
  EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1) ON CONFLICT DO NOTHING',
    _table, cols, cols, _table) USING _row;
END $$;
REVOKE ALL ON FUNCTION public._insert_json_row(text, jsonb) FROM PUBLIC, anon, authenticated;

-- Restore a deleted bus. _mode: 'check' returns conflicts; 'restore' fails on conflicts;
-- 'renumber' restores with a new free bus number and clears a conflicting plate.
CREATE OR REPLACE FUNCTION public.restore_deleted_bus(_snapshot_id uuid, _mode text DEFAULT 'restore')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s public.deleted_buses; bus jsonb; conflicts jsonb := '[]'; newnum int; x jsonb; uname text;
  restored_bookings int := 0; notes text := '';
BEGIN
  IF NOT public.is_admin_or_manager(auth.uid()) THEN RAISE EXCEPTION 'غير مصرح'; END IF;
  SELECT * INTO s FROM public.deleted_buses WHERE id = _snapshot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'النسخة غير موجودة'; END IF;
  IF s.restored_at IS NOT NULL THEN RAISE EXCEPTION 'تم استرجاع هذه الحافلة مسبقاً'; END IF;
  bus := s.snapshot->'bus';

  IF EXISTS (SELECT 1 FROM public.buses WHERE id = (bus->>'id')::uuid) THEN
    conflicts := conflicts || jsonb_build_array('id');
  END IF;
  IF EXISTS (SELECT 1 FROM public.buses WHERE bus_number = (bus->>'bus_number')::int
      AND direction = bus->>'direction'
      AND assigned_date IS NOT DISTINCT FROM (bus->>'assigned_date')::date) THEN
    conflicts := conflicts || jsonb_build_array('bus_number');
  END IF;
  IF coalesce(bus->>'plate','') <> '' AND EXISTS (SELECT 1 FROM public.buses WHERE lower(btrim(plate)) = lower(btrim(bus->>'plate'))) THEN
    conflicts := conflicts || jsonb_build_array('plate');
  END IF;

  IF _mode = 'check' OR (_mode = 'restore' AND jsonb_array_length(conflicts) > 0) THEN
    RETURN jsonb_build_object('ok', false, 'conflicts', conflicts);
  END IF;
  IF conflicts ? 'id' THEN RAISE EXCEPTION 'معرّف الحافلة مستخدم'; END IF;

  IF conflicts ? 'bus_number' THEN
    SELECT min(n) INTO newnum FROM generate_series(1, 10000) n
      WHERE NOT EXISTS (SELECT 1 FROM public.buses WHERE bus_number = n AND direction = bus->>'direction'
        AND assigned_date IS NOT DISTINCT FROM (bus->>'assigned_date')::date);
    bus := jsonb_set(bus, '{bus_number}', to_jsonb(newnum));
    notes := notes || 'رقم جديد ' || newnum || '. ';
  END IF;
  IF conflicts ? 'plate' THEN
    bus := jsonb_set(bus, '{plate}', 'null'::jsonb);
    notes := notes || 'أزيلت اللوحة المتعارضة. ';
  END IF;
  IF bus->>'layout_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bus_layouts WHERE id = (bus->>'layout_id')::uuid) THEN
    IF s.snapshot->'layout' IS NOT NULL AND s.snapshot->'layout' <> 'null'::jsonb THEN
      PERFORM public._insert_json_row('bus_layouts', s.snapshot->'layout');
    ELSE bus := jsonb_set(bus, '{layout_id}', 'null'::jsonb); END IF;
  END IF;
  IF bus->>'trip_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.trips WHERE id = (bus->>'trip_id')::uuid) THEN
    bus := jsonb_set(bus, '{trip_id}', 'null'::jsonb);
  END IF;

  -- Skip notification/audit triggers while re-inserting historical rows.
  ALTER TABLE public.buses DISABLE TRIGGER USER;
  ALTER TABLE public.bookings DISABLE TRIGGER USER;

  PERFORM public._insert_json_row('buses', bus);

  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(s.snapshot->'trip_buses','[]')) LOOP
    IF EXISTS (SELECT 1 FROM public.trips WHERE id = (x->>'trip_id')::uuid) THEN
      PERFORM public._insert_json_row('trip_buses', x);
    END IF;
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(s.snapshot->'return_trip_buses','[]')) LOOP
    IF EXISTS (SELECT 1 FROM public.return_trips WHERE id = (x->>'return_trip_id')::uuid) THEN
      PERFORM public._insert_json_row('return_trip_buses', x);
    END IF;
  END LOOP;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(s.snapshot->'occupancy_alerts','[]')) LOOP
    PERFORM public._insert_json_row('bus_occupancy_alerts', x);
  END LOOP;

  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(s.snapshot->'deleted_bookings','[]')) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.bookings WHERE id = (x->>'id')::uuid OR booking_code = x->>'booking_code') THEN
      IF x->>'trip_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.trips WHERE id = (x->>'trip_id')::uuid) THEN x := jsonb_set(x,'{trip_id}','null'); END IF;
      IF x->>'hotel_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.hotels WHERE id = (x->>'hotel_id')::uuid) THEN x := jsonb_set(x,'{hotel_id}','null'); END IF;
      IF x->>'package_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.packages WHERE id = (x->>'package_id')::uuid) THEN x := jsonb_set(x,'{package_id}','null'); END IF;
      IF x->>'return_trip_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.return_trips WHERE id = (x->>'return_trip_id')::uuid) THEN x := jsonb_set(x,'{return_trip_id}','null'); END IF;
      IF x->>'return_bus_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.buses WHERE id = (x->>'return_bus_id')::uuid) THEN x := jsonb_set(x,'{return_bus_id}','null'); END IF;
      IF x->>'rep_profile_id' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = (x->>'rep_profile_id')::uuid) THEN x := jsonb_set(x,'{rep_profile_id}','null'); END IF;
      PERFORM public._insert_json_row('bookings', x);
      restored_bookings := restored_bookings + 1;
    END IF;
  END LOOP;

  UPDATE public.bookings SET bus_id = (bus->>'id')::uuid
    WHERE bus_id IS NULL AND id IN (SELECT (v#>>'{}')::uuid FROM jsonb_array_elements(coalesce(s.snapshot->'linked_booking_ids','[]')) v);
  UPDATE public.bookings SET return_bus_id = (bus->>'id')::uuid
    WHERE return_bus_id IS NULL AND id IN (SELECT (v#>>'{}')::uuid FROM jsonb_array_elements(coalesce(s.snapshot->'return_linked_booking_ids','[]')) v);

  ALTER TABLE public.buses ENABLE TRIGGER USER;
  ALTER TABLE public.bookings ENABLE TRIGGER USER;

  SELECT coalesce(p.full_name, u.email) INTO uname FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE u.id = auth.uid();
  UPDATE public.deleted_buses SET restored_at = now(), restored_by = auth.uid(), restored_bus_id = (bus->>'id')::uuid, restore_notes = nullif(notes,'')
    WHERE id = _snapshot_id;
  INSERT INTO public.audit_log(actor_id, actor_name, action, entity, entity_id, details)
  VALUES (auth.uid(), uname, 'bus.restore', 'bus', bus->>'id', jsonb_build_object('snapshot_id', _snapshot_id, 'conflicts', conflicts, 'restored_bookings', restored_bookings, 'notes', notes));
  RETURN jsonb_build_object('ok', true, 'conflicts', conflicts, 'notes', notes, 'restored_bookings', restored_bookings);
END $$;

REVOKE ALL ON FUNCTION public.delete_bus_with_snapshot(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_deleted_bus(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_bus_with_snapshot(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_deleted_bus(uuid, text) TO authenticated;

-- Security: media library metadata visible to staff only.
DROP POLICY IF EXISTS "assets_select_auth" ON public.assets;
CREATE POLICY "assets_select_staff" ON public.assets FOR SELECT TO authenticated
  USING (public.can_manage_bookings(auth.uid()) OR public.is_admin_or_manager(auth.uid()));
DROP POLICY IF EXISTS "asset_usages_select_auth" ON public.asset_usages;
CREATE POLICY "asset_usages_select_staff" ON public.asset_usages FOR SELECT TO authenticated
  USING (public.can_manage_bookings(auth.uid()) OR public.is_admin_or_manager(auth.uid()));