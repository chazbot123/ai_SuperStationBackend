import { cn } from "@/lib/utils";
import type { SelectHTMLAttributes } from "react";

export default function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 outline-none transition-shadow focus:ring-2 focus:ring-amber-400/30",
        className
      )}
      {...props}
    />
  );
}
