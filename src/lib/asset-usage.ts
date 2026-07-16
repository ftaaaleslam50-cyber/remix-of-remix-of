import { supabase } from "@/integrations/supabase/client";

export async function trackAssetUsage(assetUrl: string | null | undefined, entityType: string, entityId: string) {
  if (!assetUrl || !entityId) return;
  const { data: asset } = await supabase
    .from("assets" as never)
    .select("id")
    .eq("public_url", assetUrl)
    .maybeSingle();
  const assetId = (asset as { id?: string } | null)?.id;
  if (!assetId) return;
  // Idempotent-ish: clear previous usages for this entity, then insert.
  await supabase.from("asset_usages" as never).delete()
    .eq("entity_type", entityType).eq("entity_id", entityId);
  await supabase.from("asset_usages" as never).insert({
    asset_id: assetId, entity_type: entityType, entity_id: entityId,
  } as never);
}

export async function untrackAssetUsage(entityType: string, entityId: string) {
  if (!entityId) return;
  await supabase.from("asset_usages" as never).delete()
    .eq("entity_type", entityType).eq("entity_id", entityId);
}
