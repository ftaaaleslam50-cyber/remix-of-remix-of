
-- Deduplicate pricing_matrix rows by (package_id, passenger_count), keep most recent
DELETE FROM public.pricing_matrix a
USING public.pricing_matrix b
WHERE a.package_id = b.package_id
  AND a.passenger_count = b.passenger_count
  AND (a.updated_at, a.id::text) < (b.updated_at, b.id::text);

-- Normalize room_type to '5' (unused for pricing)
UPDATE public.pricing_matrix SET room_type = '5' WHERE room_type <> '5';

-- Enforce uniqueness so admin edits target exactly one row
CREATE UNIQUE INDEX IF NOT EXISTS pricing_matrix_pkg_pax_unique
  ON public.pricing_matrix (package_id, passenger_count);
