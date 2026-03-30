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
    "inline-flex items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-amber-400/30";
  const variants: Record<Variant, string> = {
    primary:
      "border-amber-400/40 bg-gradient-to-b from-amber-400 to-amber-500 text-zinc-950 hover:from-amber-300 hover:to-amber-500",
    secondary:
      "border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10",
    ghost:
      "border-transparent bg-transparent text-zinc-100 hover:bg-white/10",
    danger:
      "border-red-500/40 bg-gradient-to-b from-red-500 to-red-600 text-white hover:from-red-400 hover:to-red-600",
  };
  const sizes: Record<Size, string> = {
    sm: "h-8 px-3",
    md: "h-10 px-4",
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  );
}
