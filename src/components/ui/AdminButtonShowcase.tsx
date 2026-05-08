export default function AdminButtonShowcase() {
  return (
    <div className="grid grid-cols-1 gap-6 rounded-3xl border border-white/10 bg-[linear-gradient(180deg,#2b2b2bcc_0%,#1a1a1acc_100%)] p-6 backdrop-blur-xl shadow-[0_24px_60px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.12)]">
      <div className="h-14 w-full rounded-2xl border border-white/20 bg-[linear-gradient(120deg,rgba(16,185,129,0.95)_0%,rgba(20,184,166,0.88)_47%,rgba(245,158,11,0.9)_53%,rgba(251,191,36,0.95)_100%)] shadow-[0_14px_28px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.24),0_0_20px_rgba(20,184,166,0.35)]" />

      <div className="h-12 w-52 rounded-xl border border-white/20 bg-[linear-gradient(180deg,rgba(17,94,89,0.95)_0%,rgba(20,184,166,0.9)_100%)] shadow-[0_10px_22px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.2),0_0_16px_rgba(20,184,166,0.26)]" />

      <div className="flex h-14 w-64 overflow-hidden rounded-2xl border border-white/20 shadow-[0_12px_26px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.2),0_0_16px_rgba(255,255,255,0.08)]">
        <div className="w-1/2 border-r border-white/15 bg-[linear-gradient(180deg,rgba(16,185,129,0.95)_0%,rgba(13,148,136,0.92)_100%)]" />
        <div className="w-1/2 bg-[linear-gradient(180deg,rgba(82,82,82,0.8)_0%,rgba(51,51,51,0.82)_100%)]" />
      </div>

      <div className="h-12 w-full rounded-2xl border border-white/16 bg-[linear-gradient(180deg,rgba(74,74,74,0.62)_0%,rgba(40,40,40,0.68)_100%)] shadow-[0_8px_20px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.14),0_0_10px_rgba(255,255,255,0.07)]" />
    </div>
  );
}
