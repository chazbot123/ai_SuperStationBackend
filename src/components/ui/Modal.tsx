import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { useT } from "@/i18n/useT";

export default function Modal({
  open,
  title,
  children,
  onClose,
  footer,
  panelClassName,
  bodyClassName,
  footerClassName,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  panelClassName?: string;
  bodyClassName?: string;
  footerClassName?: string;
}) {
  const t = useT();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className={cn(
            "flex max-h-[calc(100vh-2rem)] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur",
            panelClassName
          )}
        >
          <div className="flex flex-none items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="text-sm font-semibold text-zinc-100">{title}</div>
            <button
              className={cn(
                "rounded-md px-2 py-1 text-sm text-zinc-300 hover:bg-white/10"
              )}
              onClick={onClose}
              type="button"
            >
              {t("common.close")}
            </button>
          </div>
          <div className={cn("min-h-0 flex-1 overflow-auto px-4 py-4", bodyClassName)}>{children}</div>
          {footer ? (
            <div className={cn("flex flex-none border-t border-white/10 px-4 py-3", footerClassName)}>{footer}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
