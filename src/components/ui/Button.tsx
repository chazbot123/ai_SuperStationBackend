import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

export default function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  const base =
    "inline-flex min-h-10 min-w-10 items-center justify-center gap-2 rounded-[6px] border px-4 text-sm font-normal text-zinc-50 transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 focus:outline-none focus:ring-2 focus:ring-slate-300/20";
  const variants: Record<Variant, string> = {
    primary:
      "border-orange-600/80 bg-orange-600 text-white hover:bg-orange-500 active:bg-orange-700",
    secondary:
      "border-zinc-500/70 bg-transparent text-zinc-100 hover:border-orange-500/60 hover:bg-orange-500/15 active:bg-orange-500/25",
    ghost:
      "border-transparent bg-transparent text-zinc-100 hover:bg-orange-500/15 active:bg-orange-500/25",
    danger:
      "border-red-700/80 bg-red-800 text-white hover:bg-red-700 active:bg-red-900",
  };
  const sizes: Record<Size, string> = {
    sm: "h-9 px-3 text-sm",
    md: "h-10 px-4 text-sm",
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
