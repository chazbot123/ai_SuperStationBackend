import { cn } from "@/lib/utils";
import type { SelectHTMLAttributes } from "react";

export default function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative w-full">
      <select
        className={cn(
          "h-10 w-full cursor-pointer appearance-none rounded-md border border-white/10 bg-white/5 px-3 pr-10 text-sm text-zinc-100 outline-none transition-shadow focus:ring-2 focus:ring-amber-400/30",
          className
        )}
        {...props}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-zinc-400">
        ▼
      </span>
    </div>
  );
}
