// One-time (idempotent) bootstrap of default admin Abo3taa2 / Abo3taa2.
// Safe to call repeatedly — no-op if the user already exists.
import { createFileRoute } from "@tanstack/react-router";

const DEFAULT_ADMIN_EMAIL = "abo3taa2@zohrat.local";
const DEFAULT_ADMIN_PASSWORD = "Abo3taa2";
const DEFAULT_ADMIN_USERNAME = "Abo3taa2";

export const Route = createFileRoute("/api/public/bootstrap-admin")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Look up existing user by email.
        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        if (listErr) return Response.json({ ok: false, error: listErr.message }, { status: 500 });
        let user = list.users.find((u) => u.email?.toLowerCase() === DEFAULT_ADMIN_EMAIL);

        if (!user) {
          const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: DEFAULT_ADMIN_EMAIL,
            password: DEFAULT_ADMIN_PASSWORD,
            email_confirm: true,
            user_metadata: { full_name: "المسؤول", username: DEFAULT_ADMIN_USERNAME },
          });
          if (createErr) return Response.json({ ok: false, error: createErr.message }, { status: 500 });
          user = created.user!;
        }

        // Ensure profile row.
        await supabaseAdmin.from("profiles").upsert(
          { id: user.id, full_name: "المسؤول", account_type: "customer", active: true },
          { onConflict: "id" }
        );

        // Grant admin role (idempotent via unique).
        await supabaseAdmin.from("user_roles").upsert(
          { user_id: user.id, role: "admin" },
          { onConflict: "user_id,role" }
        );

        return Response.json({ ok: true, user_id: user.id });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to bootstrap default admin" }),
    },
  },
});
