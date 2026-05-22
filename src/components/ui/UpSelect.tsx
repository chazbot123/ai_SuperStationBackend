import { useEffect, useRef, useState } from "react";
import { ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UpSelectOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface UpSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: UpSelectOption[];
  className?: string;
  placeholder?: string;
  icon?: React.ReactNode;
  layout?: "vertical" | "horizontal";
  title?: string;
}

export default function UpSelect({ value, onChange, options, className, placeholder, icon, layout = "vertical", title }: UpSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        className="flex items-center justify-center w-full outline-none gap-1"
        onClick={() => setIsOpen(!isOpen)}
      >
        {icon && <span className="text-zinc-500 shrink-0">{icon}</span>}
        <span className="truncate">{selectedOption?.label || placeholder || "请选择"}</span>
        {/* We can keep or remove ChevronUp, let's keep it but make it optional or subtle. Wait, the user's reference image doesn't show a chevron on the pills. Let's remove it if there's an icon, or keep it small. Actually, I will hide the chevron if icon is present to match the reference. */}
      </button>

      {isOpen && (
        <div className={cn(
          "absolute bottom-full left-0 mb-2 z-50 rounded-2xl border border-white/10 bg-[#1a2235] p-3 shadow-xl backdrop-blur-xl animate-in fade-in zoom-in-95 slide-in-from-bottom-2",
          layout === "horizontal" ? "min-w-max" : "min-w-full"
        )}>
          {title && <div className="text-xs font-medium text-zinc-400 mb-3 px-1">{title}</div>}
          <div className={cn(
            "flex gap-1.5",
            layout === "horizontal" ? "flex-row items-center" : "flex-col"
          )}>
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cn(
                  "flex items-center justify-center rounded-xl transition-all",
                  layout === "horizontal" ? "flex-col gap-2 p-2 min-w-[56px]" : "w-full px-3 py-2 text-xs hover:bg-white/10",
                  value === opt.value 
                    ? (layout === "horizontal" ? "bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/50" : "bg-cyan-500/20 text-cyan-300") 
                    : (layout === "horizontal" ? "text-zinc-400 hover:bg-white/5 hover:text-zinc-200" : "text-zinc-300")
                )}
                onClick={() => {
                  onChange(opt.value);
                  setIsOpen(false);
                }}
              >
                {opt.icon && <div className="flex items-center justify-center h-8">{opt.icon}</div>}
                <span className={cn("whitespace-nowrap", layout === "horizontal" ? "text-[11px]" : "")}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
