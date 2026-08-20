DO $$
DECLARE bid uuid; owner uuid;
BEGIN
  INSERT INTO public.bookings (booking_code, booking_type, passenger_count, room_type, seat_numbers, customer_name, id_number, contact_phone, whatsapp_phone, price_per_person, total_price, status, rep_name)
  VALUES ('TESTLINK1','individual',1,'5','{}','اختبار الربط','','0500000000','0500000000',0,0,'confirmed',' الشريف ')
  RETURNING id, created_by INTO bid, owner;
  DELETE FROM public.bookings WHERE id = bid;
  IF owner IS DISTINCT FROM 'fc8178a4-78a4-4b86-85ec-43d44bb7ffb5'::uuid THEN
    RAISE EXCEPTION 'FAIL: owner=%', owner;
  END IF;
  RAISE NOTICE 'PASS';
END $$;