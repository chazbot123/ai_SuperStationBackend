import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { listPublishingContents, type PublishingContentItem } from "@/lib/publishing";
import { listVideoDrafts } from "@/lib/ai";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";

type DraftMediaPickerModalProps = {
  open: boolean;
  type: "image" | "video";
  onClose: () => void;
  onSelect: (url: string) => void;
};

export default function DraftMediaPickerModal({ open, type, onClose, onSelect }: DraftMediaPickerModalProps) {
  const { accessToken } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<{ id: string; url: string; title: string; createdAt: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !accessToken) return;
    let disposed = false;

    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        if (type === "image") {
          const res = await listPublishingContents({ accessToken, limit: 100 });
          if (disposed) return;
          const imageList: { id: string; url: string; title: string; createdAt: string }[] = [];
          res.items.forEach((item) => {
            const allImages = new Set<string>();
            if (item.coverImage) allImages.add(item.coverImage);
            if (Array.isArray(item.images)) {
              item.images.forEach((img) => allImages.add(img));
            }
            Array.from(allImages).forEach((url, i) => {
              imageList.push({
                id: `${item.id}-${i}`,
                url,
                title: item.title || "未命名草稿",
                createdAt: item.createdAt,
              });
            });
          });
          setItems(imageList);
        } else {
          // fetch video drafts
          const res = await listVideoDrafts(accessToken);
          if (disposed) return;
          const videoList: { id: string; url: string; title: string; createdAt: string }[] = [];
          res.forEach((item: any) => {
            if (item.videoUrl) {
              videoList.push({
                id: item.id,
                url: item.videoUrl,
                title: item.title || item.prompt || "未命名视频",
                createdAt: item.createdAt,
              });
            }
          });
          setItems(videoList);
        }
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : "加载数据失败");
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    void loadData();

    return () => {
      disposed = true;
    };
  }, [open, accessToken, type]);

  return (
    <Modal open={open} onClose={onClose} title={`从草稿箱选择${type === "image" ? "图片" : "视频"}`}>
      <div className="max-h-[60vh] overflow-y-auto p-4">
        {loading && <div className="text-center text-sm text-zinc-500 py-10">加载中...</div>}
        {error && <div className="text-center text-sm text-red-400 py-10">{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="text-center text-sm text-zinc-500 py-10">
            暂无{type === "image" ? "图片" : "视频"}记录
          </div>
        )}
        {!loading && !error && items.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="group relative cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-black/20 hover:border-indigo-500/50"
                onClick={() => {
                  onSelect(item.url);
                  onClose();
                }}
              >
                {type === "image" ? (
                  <div
                    className="h-32 w-full bg-cover bg-center"
                    style={{ backgroundImage: `url("${item.url}")` }}
                  />
                ) : (
                  <video src={item.url} className="h-32 w-full object-cover" muted />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="absolute bottom-0 left-0 right-0 p-2 text-xs text-white truncate">
                    {item.title}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-end border-t border-white/10 p-4">
        <Button variant="ghost" onClick={onClose}>取消</Button>
      </div>
    </Modal>
  );
}
