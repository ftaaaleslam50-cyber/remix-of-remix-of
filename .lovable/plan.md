# Master Patch V5.5 — Admin Dashboard Overhaul

This is a large, cross-cutting change touching schema, admin routes, booking flow, and gallery. I'll ship it in one migration + coordinated code changes. Below is the scope and how each section maps to files.

## 1. Hotels rename (Packages → Hotels)
- User-facing strings only (no table rename to avoid breaking existing data). The `packages` table stays; the UI everywhere reads "Hotel/Hotels".
- Add `stars` (int 1–5, nullable) to `packages` for optional Hotel Rating.
- Update: `admin-homepage.tsx` labels, booking wizard step titles (already "Hotel"), any "Package" strings in admin/dashboard/reports.
- Add rating star selector in Hotel edit UI; display stars on the booking Hotel step cards.

## 2. Fleet simplification
- Drop UI for: favorite/priority/active-booking bus.
- Bus status enum kept as `active | maintenance | stopped` (rename "stopped" label to "Out of Service", drop "disabled").
- Remove the drag-priority column and the "Active booking" column from `admin-buses.tsx`.
- Add "Duplicate" action that inserts a new bus copying name/model/type/capacity/layout/details/image/price_addition (bus_number auto-increments, plate cleared).

## 3. Bus Layouts module (new)
- New table `bus_layouts` (id, name, seat_count, layout_json, created_at/updated_at) with admin-only RLS + public SELECT so booking page can read them.
- `layout_json` is a free-form grid: array of cells `{row, col, kind: 'seat'|'empty'|'driver'|'door'|'restroom', label?}`. Seat count auto-computed from `kind==='seat'` entries.
- New admin route `/_authenticated/admin-bus-layouts.tsx` with a grid editor (click cell → cycle kind, edit label). No true drag-and-drop needed for MVP; grid click-to-place is the practical implementation and matches the requirement's intent.
- Add `layout_id` (uuid, nullable) to `buses`. Fleet row gets a "Layout Template" select. `capacity` becomes derived (kept as column, auto-set from layout on save).
- `BusSeatMap` extended: if bus has a `layout_id`, render from the template JSON; otherwise fall back to the existing A/B built-in layouts.

## 4. Trips ↔ Buses assignment
- New join table `trip_buses (trip_id, bus_id)` with grants + RLS.
- `admin-trips.tsx` gains an "Available Buses" multi-select per trip with live occupancy `used/capacity` per bus (computed from `bookings.bus_id` + `seat_numbers`).
- Booking wizard's Bus step filters buses to those in the selected trip via `trip_buses`.
- Existing `buses.trip_id` stays for backward-compat but is no longer the primary source.

## 5. Gallery Management
- Add `videos` support: extend `gallery_images` with `media_type` ('image'|'video') + `video_url` (nullable). Public `gallery.tsx` renders videos with `<video>`.
- Create admin route `/_authenticated/admin-gallery.tsx` with tabs Albums / Images / Videos (CRUD). Confirm no events/meetings/interviews content anywhere — none exists today.

## 6. Homepage Builder
- Add `homepage_sections` table: `key`, `title`, `subtitle`, `image_url`, `button_text`, `button_link`, `bg_color`, `visible`, `display_order`.
- Seed with existing sections (hero, features, hotels, trips, gallery, contact).
- Extend `admin-homepage.tsx` with a sortable list (dnd-kit) for reorder + show/hide + inline edit.
- `index.tsx` reads sections and renders in configured order, honoring visibility and overriding titles/CTA/colors. Fixed section components remain; only content is data-driven.

## 7. Bookings by Bus
- Add "Filter by Bus" select + "By Bus" tab to bookings admin. When a bus is selected show a card: name, total, occupied, available, %; and action buttons:
  - View Seat Map (open dialog with `BusSeatMap` in read-only + occupied seats highlighted)
  - View Passenger List (dialog table)
  - Export PDF (client-side via `jspdf` + `jspdf-autotable`)
  - Export Excel (via `xlsx`)

## Migration summary
Single migration adds: `packages.stars`, `buses.layout_id`, `bus_layouts` table, `trip_buses` table, `gallery_images.media_type`+`video_url`, `homepage_sections` table + seed. All with GRANTs and RLS (admins write, public reads where needed).

## Files to add/edit
Add:
- `src/routes/_authenticated/admin-bus-layouts.tsx`
- `src/routes/_authenticated/admin-gallery.tsx`
- `src/components/booking/LayoutSeatMap.tsx` (renders from layout_json)
- `supabase/migrations/*.sql`

Edit:
- `src/routes/_authenticated/admin-buses.tsx` (status simplification, duplicate, layout picker, remove priority/active)
- `src/routes/_authenticated/admin-trips.tsx` (available-buses multi-select + occupancy)
- `src/routes/_authenticated/admin-homepage.tsx` (sortable section manager + "Hotel" wording)
- `src/routes/_authenticated/dashboard.tsx` (nav: Hotels, Bus Layouts; wording)
- `src/routes/_authenticated/my-bookings.tsx` and any admin bookings list (add bus filter + export)
- `src/routes/booking.tsx` (trip→buses via trip_buses; render layout template if present; Hotel step shows stars)
- `src/routes/index.tsx` (data-driven sections)
- `src/routes/gallery.tsx` (video rendering)
- `src/components/booking/BusSeatMap.tsx` (layout_json path)
- `src/lib/booking/types.ts` (types for new fields)

## Notes / trade-offs
- I keep the `packages` table name to avoid a risky rename (existing bookings reference it). All UI copy switches to "Hotel".
- Bus layout editor uses click-to-cycle + label edit rather than pixel-level drag-drop; this stays reliable on mobile and covers all listed elements (seats, empty, driver, doors, restroom, numbering).
- PDF/Excel exports add `jspdf`, `jspdf-autotable`, `xlsx` dependencies.

Ready to implement — this is a large batch, ~2 migrations + ~10 file edits + 3 new files. Confirm and I'll ship it.
