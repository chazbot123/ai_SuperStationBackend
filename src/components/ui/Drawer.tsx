import type { ReactNode } from "react";
import { useT } from "@/i18n/useT";

export default function Drawer({
  open,
  title,
  children,
  onClose,
  footer,
  widthClassName = "max-w-xl",
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  widthClassName?: string;
}) {
  const t = useT();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex w-full justify-end">
        <div className={`h-full w-full ${widthClassName} border-l border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur`}>
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="text-sm font-semibold text-zinc-100">{title}</div>
            <button
              className="rounded-md px-2 py-1 text-sm text-zinc-300 hover:bg-white/10"
              onClick={onClose}
              type="button"
            >
              {t("common.close")}
            </button>
          </div>
          <div className="h-[calc(100%-48px)] overflow-auto px-4 py-4">{children}</div>
          {footer ? (
            <div className="absolute bottom-0 right-0 w-full border-t border-white/10 bg-black/20 px-4 py-3 backdrop-blur">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
