import { useState } from "react";
import { ImagePlus, Trash2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssetPicker, type AssetSelection } from "@/components/admin/AssetPicker";
import { AssetImg } from "@/components/admin/AssetImg";


/**
 * Compact media-library field: preview + Select/Replace/Remove.
 * Value is the asset's public URL (persisted directly to existing columns).
 * If the asset is later deleted from the library the URL simply 404s at render
 * time — components should render an <img> with a graceful fallback; nothing
 * else breaks.
 */
export function AssetField({
  value,
  onChange,
  label,
  compact = false,
  aspect = "video",
}: {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  label?: string;
  compact?: boolean;
  aspect?: "video" | "square" | "thumb";
}) {
  const [open, setOpen] = useState(false);

  const aspectCls =
    aspect === "square" ? "aspect-square"
    : aspect === "thumb" ? "h-14 w-20"
    : "aspect-video";

  function handlePick(a: AssetSelection) {
    onChange(a.url);
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {value ? (
          <AssetImg src={value} className="h-10 w-16 rounded object-cover border" />
        ) : (
          <div className="h-10 w-16 rounded border grid place-items-center bg-muted text-muted-foreground">
            <ImageIcon className="h-4 w-4" />

          </div>
        )}
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          <ImagePlus className="h-3 w-3 ml-1" /> {value ? "استبدال" : "اختر"}
        </Button>
        {value && (
          <Button type="button" size="sm" variant="outline" onClick={() => onChange(null)} title="إزالة">
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
        <AssetPicker open={open} onOpenChange={setOpen} onSelect={handlePick} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label && <div className="text-xs font-medium">{label}</div>}
      {value ? (
        <div className={`relative rounded-lg overflow-hidden border ${aspectCls} bg-muted`}>
          <AssetImg src={value} className="w-full h-full object-cover" />
        </div>

      ) : (
        <div className={`rounded-lg border-2 border-dashed grid place-items-center text-muted-foreground ${aspectCls}`}>
          <div className="text-center">
            <ImageIcon className="h-6 w-6 mx-auto opacity-50" />
            <p className="text-xs mt-1">لا توجد صورة</p>
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" className="flex-1" onClick={() => setOpen(true)}>
          <ImagePlus className="h-3 w-3 ml-1" />
          {value ? "استبدال من المكتبة" : "اختر من مكتبة الوسائط"}
        </Button>
        {value && (
          <Button type="button" size="sm" variant="outline" onClick={() => onChange(null)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
      <AssetPicker open={open} onOpenChange={setOpen} onSelect={handlePick} />
    </div>
  );
}
