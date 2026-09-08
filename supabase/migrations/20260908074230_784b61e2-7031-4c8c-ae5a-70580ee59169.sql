ALTER TABLE public.return_trips
  ADD COLUMN IF NOT EXISTS auto_advance boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clone_buses_on_advance boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.advance_due_return_trips()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  t public.return_trips%ROWTYPE;
  deadline timestamptz;
  moved integer := 0;
  guard integer;
  old_bus public.buses%ROWTYPE;
  new_bus_id uuid;
  new_date date;
BEGIN
  FOR t IN
    SELECT * FROM public.return_trips
    WHERE auto_advance IS TRUE AND return_date IS NOT NULL AND active IS TRUE
  LOOP
    guard := 0;
    LOOP
      deadline := ((t.return_date + COALESCE(t.return_time, TIME '23:59')) AT TIME ZONE 'Asia/Riyadh');
      EXIT WHEN deadline > now() OR guard > 520;
      guard := guard + 1;
      new_date := t.return_date + 7;

      IF t.clone_buses_on_advance THEN
        -- نسخ حافلات العودة المرتبطة بالتاريخ الحالي: رقم 0، بدون بيانات سائق
        FOR old_bus IN
          SELECT b.* FROM public.buses b
          JOIN public.return_trip_buses rb ON rb.bus_id = b.id
          WHERE rb.return_trip_id = t.id AND rb.trip_date = t.return_date
        LOOP
          BEGIN
            INSERT INTO public.buses (
              bus_number, name, capacity, layout, layout_id, image_url, bus_type, details,
              price_addition, round_trip_price, outbound_price, return_price, open_return_price, direction,
              status, active, trip_id, blocked_seats,
              driver_name, driver_phone, driver_id_number, plate, model
            ) VALUES (
              0, old_bus.name, old_bus.capacity, old_bus.layout, old_bus.layout_id,
              old_bus.image_url, old_bus.bus_type, old_bus.details,
              old_bus.price_addition, old_bus.round_trip_price, old_bus.outbound_price, old_bus.return_price, old_bus.open_return_price,
              'return', 'active', true, NULL, old_bus.blocked_seats,
              NULL, NULL, NULL, NULL, old_bus.model
            )
            RETURNING id INTO new_bus_id;

            INSERT INTO public.return_trip_buses (return_trip_id, trip_date, bus_id)
            VALUES (t.id, new_date, new_bus_id)
            ON CONFLICT DO NOTHING;
          EXCEPTION WHEN OTHERS THEN
            NULL;
          END;
        END LOOP;
        -- الحافلات القديمة تبقى مرتبطة بالتاريخ القديم فقط (أرشيف تلقائي)
      ELSE
        -- نقل نفس ارتباطات الحافلات إلى التاريخ الجديد
        UPDATE public.return_trip_buses
        SET trip_date = new_date
        WHERE return_trip_id = t.id AND trip_date = t.return_date;
      END IF;

      t.return_date := new_date;
      moved := moved + 1;
    END LOOP;

    IF guard > 0 THEN
      UPDATE public.return_trips
      SET return_date = t.return_date,
          weekday = EXTRACT(DOW FROM t.return_date)::integer
      WHERE id = t.id;
    END IF;
  END LOOP;

  RETURN moved;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.advance_due_return_trips() TO authenticated;