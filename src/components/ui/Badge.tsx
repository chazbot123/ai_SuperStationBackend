import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Variant = "gray" | "blue" | "green" | "red" | "amber";

export default function Badge({
  className,
  variant = "gray",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  const variants: Record<Variant, string> = {
    gray: "border-white/10 bg-white/5 text-zinc-200",
    blue: "border-blue-400/30 bg-blue-500/10 text-blue-200",
    green: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
    red: "border-red-400/30 bg-red-500/10 text-red-200",
    amber: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
