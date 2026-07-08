import { supabase } from "@/integrations/supabase/client";

export async function writeAudit(action: string, entity?: string, entityId?: string, details?: Record<string, unknown>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("audit_log" as never).insert({
      actor_id: user?.id ?? null,
      actor_name: user?.email ?? null,
      action,
      entity: entity ?? null,
      entity_id: entityId ?? null,
      details: details ?? {},
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    } as never);
  } catch { /* noop */ }
}
