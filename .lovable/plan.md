# V5 — Production Update — Progress & Roadmap

## ✅ COMPLETED (this turn)
- **DB Schema V5** (migration applied):
  - `profiles` table: full_name, mobile_phone, whatsapp_phone, national_id, national_id_image_url, avatar_url, account_type (customer/representative), active, last_login_at
  - Auto-create profile on signup via `handle_new_user()` trigger
  - `buses` fleet fields: name, plate, model, status (active/disabled/maintenance/stopped), priority, is_active_booking (unique partial index)
  - `bookings`: deleted_at (soft delete), created_by, created_by_name, updated_by, rep_name, rep_phone, rep_whatsapp
  - `notifications` table (realtime enabled)
  - `audit_log` table (actor, action, entity, ip, user_agent)
- **Storage bucket `avatars`** (private) with per-user RLS on storage.objects
- **Auth**: auto-confirm enabled (no email verification, per spec)

## 🚧 IN PROGRESS / NEXT TURNS

### Turn 2 — Auth + Profiles UI
- Rewrite `src/routes/auth.tsx`: signup with mobile + whatsapp + password (synthetic email `<mobile>@zohrat.local`). Login accepts mobile OR admin username (`Abo3taa2` → `abo3taa2@zohrat.local`).
- Create `src/routes/profile.tsx` (protected): edit full_name, mobile, whatsapp, national_id, upload avatar + ID image (private bucket signed URLs).
- Navbar: show avatar + "الملف الشخصي" / "خروج" when logged in.
- Booking auto-fill: when logged in, pre-fill customer info; if representative, pre-fill rep_name/rep_phone/rep_whatsapp.

### Turn 3 — Bus Fleet Management (Dashboard)
- New "الحافلات" tab in dashboard:
  - Table: name, plate, model, capacity, status, priority, active-booking indicator
  - Add / Edit / Delete / Disable / Maintenance actions
  - Drag-to-reorder priority (dnd-kit)
  - "Set as Active for Booking" button (enforces single active via unique index)
  - "Transfer all bookings to..." dialog (bulk update bus_id + reassign seat_numbers)
- Booking flow: assigned bus is auto-selected (active_booking → fallback next priority when full). Customer sees "🚌 حافلتك: [name] – [X] مقاعد متبقية".
- Ticket page: show bus name, number, plate.

### Turn 4 — Dashboard extras
- **Users tab**: list all profiles, search, filter by account_type, activate/deactivate, delete, change type, view booking history, reset password (admin API via server fn).
- **Bookings tab**: soft-delete (button "أرشفة")، view archived, restore, permanent delete.
- **Widgets**: bookings today/week/month, occupancy % per bus, revenue trend.
- Remove ZIP download from ticket page. Keep PDF. Add "تنزيل صورة الهوية" button in bookings table.

### Turn 5 — Notifications + Audit Log + Backup
- **Notification center**: bell icon with unread badge, dropdown with realtime subscription to `notifications`, sound on new, mark read/archive/search/filter, dedicated page.
- On booking create/edit/delete/user signup → insert notification (server fn with service role).
- **Audit log tab**: table with search/filter by admin, action, entity, date range. Log actor_id, ip (via client), user_agent on every admin write.
- **Backup system**: server route `/api/public/admin/backup` (admin-only via bearer): pg_dump-style JSON export of all tables. UI to create/download/restore. Cron: daily backup, keep last 30 (store in `backups` bucket).

## 📋 Deferred / To Confirm
- The "default admin Abo3taa2/Abo3taa2" credential is created as `abo3taa2@zohrat.local` in Supabase Auth then granted `admin` role via user_roles. Will do in Turn 2 via a one-time insert.
- "Rep account only affects booking workflow, no admin permissions" — confirmed via `profiles.account_type` (no impact on user_roles).
- Contact standard: mobile_phone and whatsapp_phone are already separate columns throughout.

## ⚠️ Known Pre-existing Security Warnings (not blockers)
- `generate_booking_code()` SECURITY DEFINER exposed publicly — pre-existing pattern, needed for booking flow.
- Audit insert policy allows any authenticated user to insert with their own actor_id — intentional (users log their own actions).
