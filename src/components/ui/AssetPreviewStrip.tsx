import { FileText, Image as ImageIcon, Video as VideoIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type AssetPreviewStripItem = {
  id: string;
  name: string;
  kind: "image" | "video" | "file";
  previewUrl?: string;
};

type AssetPreviewStripProps = {
  items: AssetPreviewStripItem[];
  emptyText: string;
  onPreview?: (item: AssetPreviewStripItem) => void;
  onRemove?: (id: string) => void;
  className?: string;
};

export default function AssetPreviewStrip({
  items,
  emptyText,
  onPreview,
  onRemove,
  className,
}: AssetPreviewStripProps) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-black/20 p-4 text-center text-xs text-zinc-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div className={cn("flex gap-3 overflow-x-auto pb-1", className)}>
      {items.map((item) => {
        const previewable =
          item.kind === "image" || item.kind === "video" || (item.kind === "file" && !!onPreview);

        return (
          <div
            key={item.id}
            className="relative h-20 w-44 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/20"
          >
            {onRemove ? (
              <button
                type="button"
                className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white/80 transition hover:bg-red-500 hover:text-white"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(item.id);
                }}
                aria-label={`删除 ${item.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}

            <button
              type="button"
              className={cn(
                "flex h-full w-full items-center gap-3 px-3 py-2 text-left",
                previewable ? "cursor-pointer transition hover:bg-white/5" : "cursor-default"
              )}
              onClick={() => {
                if (previewable) {
                  onPreview?.(item);
                }
              }}
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-white/5">
                {item.kind === "image" && item.previewUrl ? (
                  <img src={item.previewUrl} alt={item.name} className="h-full w-full object-cover" />
                ) : item.kind === "video" ? (
                  <VideoIcon className="h-5 w-5 text-amber-300" />
                ) : item.kind === "file" ? (
                  <FileText className="h-5 w-5 text-amber-300" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-amber-300" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-zinc-100">{item.name}</div>
                <div className="mt-1 truncate text-[11px] text-zinc-500">
                  {item.kind === "image"
                    ? "图片素材"
                    : item.kind === "video"
                      ? "视频素材"
                      : "文档素材"}
                </div>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
