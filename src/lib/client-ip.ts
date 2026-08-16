// Shared client IP helper: the IP is the primary key used to persist a coupon /
// lucky-draw reward for a visitor across reloads, navigation and revisits.
// localStorage is only a cache to avoid refetching within a session.

const CACHE_KEY = "zt_client_ip";
let inflight: Promise<string | null> | null = null;

export async function getClientIp(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch("https://api.ipify.org?format=json", { cache: "no-store" });
      const j = (await res.json()) as { ip?: unknown };
      const ip = typeof j?.ip === "string" ? j.ip : null;
      if (ip) {
        try {
          localStorage.setItem(CACHE_KEY, ip);
        } catch {
          /* ignore */
        }
      }
      return ip;
    } catch {
      try {
        return localStorage.getItem(CACHE_KEY);
      } catch {
        return null;
      }
    }
  })();

  return inflight;
}

export function getDeviceId(): string {
  try {
    const KEY = "zt_device_id";
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
