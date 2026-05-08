import { cn } from "@/lib/utils";
import type { InputHTMLAttributes } from "react";

export default function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 outline-none transition-shadow placeholder:text-zinc-400 focus:ring-2 focus:ring-amber-400/30",
        className
      )}
      {...props}
    />
  );
}
