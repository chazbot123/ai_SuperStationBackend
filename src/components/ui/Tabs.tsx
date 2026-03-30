import { cn } from "@/lib/utils";

export default function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={cn(
            "h-9 rounded-md border px-3 text-sm transition-colors",
            value === t.key
              ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
              : "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
