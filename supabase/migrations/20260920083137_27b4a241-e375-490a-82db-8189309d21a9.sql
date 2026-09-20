CREATE POLICY "staff can create bookings without phone"
ON public.bookings
FOR INSERT
TO authenticated
WITH CHECK (
  passenger_count > 0
  AND length(COALESCE(customer_name, '')) > 0
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'supervisor'::app_role)
    OR has_role(auth.uid(), 'representative'::app_role)
  )
);