import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Variant = "gray" | "blue" | "green" | "red" | "amber";

export default function Badge({
  className,
  variant = "gray",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  const variants: Record<Variant, string> = {
    gray: "border-zinc-600/70 bg-zinc-700 text-zinc-100",
    blue: "border-orange-600/70 bg-orange-700 text-zinc-50",
    green: "border-emerald-700/80 bg-emerald-800 text-zinc-50",
    red: "border-red-700/80 bg-red-800 text-zinc-50",
    amber: "border-orange-600/80 bg-orange-600 text-zinc-50",
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
