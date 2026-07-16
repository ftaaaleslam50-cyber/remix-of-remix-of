import { useEffect, useState } from "react";
import { resolveDisplayUrl } from "@/lib/asset-url";

/**
 * <img> wrapper that transparently signs private-bucket URLs on the fly.
 * Use everywhere a stored asset URL is rendered so legacy /object/public/
 * URLs (which 404 against the private assets bucket) still display.
 */
export function AssetImg({
  src,
  alt = "",
  className,
  loading = "lazy",
  onError,
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  loading?: "eager" | "lazy";
  onError?: React.ReactEventHandler<HTMLImageElement>;
}) {
  const [resolved, setResolved] = useState<string | null>(src ?? null);
  useEffect(() => {
    let alive = true;
    setResolved(src ?? null);
    if (!src) return;
    resolveDisplayUrl(src).then((u) => { if (alive) setResolved(u); });
    return () => { alive = false; };
  }, [src]);
  if (!resolved) return null;
  return <img src={resolved} alt={alt} className={className} loading={loading} onError={onError} />;
}
