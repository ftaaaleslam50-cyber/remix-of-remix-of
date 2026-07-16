import { supabase } from "@/integrations/supabase/client";

/**
 * Assets bucket is private (public buckets are blocked in this workspace).
 * `/object/public/assets/...` URLs 404. We render via long-lived signed URLs.
 */

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

/** Extract the storage path from any /object/(public|sign|authenticated)/{bucket}/{path} URL, or return null. */
export function extractAssetPath(url: string | null | undefined): { bucket: string; path: string } | null {
  if (!url) return null;
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/);
  if (!m) return null;
  return { bucket: m[1], path: decodeURIComponent(m[2]) };
}

/** Get a long-lived signed URL for a storage path. Cached. */
export async function getLongLivedSignedUrl(bucket: string, path: string): Promise<string> {
  const key = `${bucket}/${path}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = (async () => {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, TEN_YEARS);
    if (error || !data?.signedUrl) throw error ?? new Error("sign failed");
    cache.set(key, data.signedUrl);
    return data.signedUrl;
  })();
  inflight.set(key, p);
  try { return await p; } finally { inflight.delete(key); }
}

/**
 * Resolve a stored URL for display. If it points at a private storage bucket
 * via the /object/public/ path (which 404s), swap to a signed URL.
 * External URLs are returned as-is.
 */
export async function resolveDisplayUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (!url.includes("/storage/v1/object/")) return url;
  if (url.includes("/object/sign/")) return url; // already signed
  const parsed = extractAssetPath(url);
  if (!parsed) return url;
  try {
    return await getLongLivedSignedUrl(parsed.bucket, parsed.path);
  } catch {
    return url;
  }
}
