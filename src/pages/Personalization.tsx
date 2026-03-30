import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAppStore, type CardSkinKey, type SiteTemplateKey, type VirtualAvatarKey } from "@/store/appStore";
import Badge from "@/components/ui/Badge";
import { useT } from "@/i18n/useT";

export default function Personalization() {
  const t = useT();
  usePageMeta(t("page.personalization"));
  const [tab, setTab] = useState("card");
  const settings = useAppStore((s) => s.settings);
  const setCardSkin = useAppStore((s) => s.setCardSkin);
  const setEnterpriseName = useAppStore((s) => s.setEnterpriseName);
  const setVirtualAvatar = useAppStore((s) => s.setVirtualAvatar);
  const setVirtualAvatarCustomUrl = useAppStore((s) => s.setVirtualAvatarCustomUrl);
  const setSiteTemplate = useAppStore((s) => s.setSiteTemplate);
  const toggleSiteModule = useAppStore((s) => s.toggleSiteModule);
  const reorderSiteModules = useAppStore((s) => s.reorderSiteModules);
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const enabledModules = useMemo(() => settings.siteModules.filter((m) => m.enabled), [settings.siteModules]);

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { key: "card", label: t("personalization.tabs.card") },
          { key: "site", label: t("personalization.tabs.site") },
          { key: "avatar", label: t("personalization.tabs.avatar") },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "card" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("personalization.card.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="md:col-span-7">
                <div>
                  <div className="mb-1 text-xs font-medium text-zinc-300">{t("personalization.card.enterpriseName")}</div>
                  <Input
                    value={settings.enterpriseName}
                    onChange={(e) => setEnterpriseName(e.target.value)}
                    placeholder={t("personalization.card.enterpriseName")}
                  />
                </div>
                <div className="mt-4 mb-2 text-xs font-medium text-zinc-300">{t("personalization.card.pickSkin")}</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <SkinOption label="黑金色" value="black_gold" current={settings.cardSkin} onPick={setCardSkin} />
                  <SkinOption label="幻彩珠光" value="iridescent" current={settings.cardSkin} onPick={setCardSkin} />
                  <SkinOption label="几何翠绿" value="geo_green" current={settings.cardSkin} onPick={setCardSkin} />
                  <SkinOption label="暗夜金线" value="night_gold" current={settings.cardSkin} onPick={setCardSkin} />
                </div>
              </div>
              <div className="md:col-span-5">
                <div className="mb-2 text-xs font-medium text-zinc-300">{t("personalization.card.preview")}</div>
                <CardPreview skin={settings.cardSkin} enterpriseName={settings.enterpriseName} />
                <div className="mt-3 flex justify-end">
                  <Button variant="secondary">{t("personalization.card.push")}</Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "site" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("personalization.site.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <div className="md:col-span-5">
                <div className="mb-2 text-xs font-medium text-zinc-300">{t("personalization.site.template")}</div>
                <Select
                  value={settings.siteTemplate}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "standard" || v === "split") setSiteTemplate(v as SiteTemplateKey);
                  }}
                >
                  <option value="standard">{t("personalization.site.template.standard")}</option>
                  <option value="split">{t("personalization.site.template.split")}</option>
                </Select>

                <div className="mt-4 mb-2 text-xs font-medium text-zinc-300">{t("personalization.site.modules")}</div>
                <div className="space-y-2">
                  {settings.siteModules.map((m, idx) => (
                    <div
                      key={m.key}
                      draggable
                      onDragStart={() => setDragIdx(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragIdx === null) return;
                        reorderSiteModules(dragIdx, idx);
                        setDragIdx(null);
                      }}
                      className="flex items-center justify-between rounded-md border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10"
                    >
                      <div className="flex items-center gap-3">
                        <div className="cursor-move select-none text-zinc-400">⋮⋮</div>
                        <input type="checkbox" checked={m.enabled} onChange={() => toggleSiteModule(m.key)} />
                        <div className="text-sm font-medium text-zinc-100">{m.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-200">
                  {t("personalization.site.hint")}
                </div>
              </div>
              <div className="md:col-span-7">
                <div className="mb-2 text-xs font-medium text-zinc-300">{t("personalization.site.preview")}</div>
                <SitePreview
                  template={settings.siteTemplate}
                  enterpriseName={settings.enterpriseName}
                  modules={enabledModules}
                  avatarKey={settings.virtualAvatar}
                  avatarCustomUrl={settings.virtualAvatarCustomUrl}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "avatar" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("personalization.avatar.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <AvatarOption label="小猫" value="cat" current={settings.virtualAvatar} onPick={setVirtualAvatar} />
              <AvatarOption label="小狗" value="dog" current={settings.virtualAvatar} onPick={setVirtualAvatar} />
              <AvatarOption label="龙" value="dragon" current={settings.virtualAvatar} onPick={setVirtualAvatar} />
              <AvatarOption label="迪丽热巴" value="dilireba" current={settings.virtualAvatar} onPick={setVirtualAvatar} />
              <AvatarOption label="机器人" value="robot" current={settings.virtualAvatar} onPick={setVirtualAvatar} />
              <AvatarOption label="自定义" value="custom" current={settings.virtualAvatar} onPick={setVirtualAvatar} />
            </div>
            <div className="mt-4">
              <div className="mb-1 text-xs font-medium text-zinc-300">{t("personalization.avatar.upload")}</div>
              <input
                className="block w-full text-sm text-zinc-200 file:mr-3 file:rounded-md file:border file:border-white/10 file:bg-white/5 file:px-3 file:py-2 file:text-sm file:text-zinc-200 hover:file:bg-white/10"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (!f) return;
                  const reader = new FileReader();
                  reader.onload = () => {
                    const url = String(reader.result ?? "");
                    setVirtualAvatarCustomUrl(url || null);
                    setVirtualAvatar("custom");
                  };
                  reader.readAsDataURL(f);
                }}
              />
              <div className="mt-1 text-xs text-zinc-400">{t("personalization.avatar.uploadHint")}</div>
            </div>
            <div className="mt-3 rounded-md border border-white/10 bg-white/5 px-3 py-3 text-sm text-zinc-200">
              {t("personalization.avatar.hint")}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function skinStyle(skin: CardSkinKey) {
  if (skin === "black_gold") return "bg-gradient-to-br from-zinc-950 via-zinc-900 to-amber-900 text-amber-50";
  if (skin === "iridescent") return "bg-gradient-to-br from-fuchsia-600 via-blue-500 to-emerald-400 text-white";
  if (skin === "geo_green") return "bg-gradient-to-br from-emerald-900 via-emerald-700 to-zinc-950 text-emerald-50";
  return "bg-gradient-to-br from-zinc-950 via-zinc-900 to-yellow-800 text-yellow-50";
}

function SkinOption(props: { label: string; value: CardSkinKey; current: CardSkinKey; onPick: (v: CardSkinKey) => void }) {
  const active = props.current === props.value;
  return (
    <button
      type="button"
      onClick={() => props.onPick(props.value)}
      className={`rounded-lg border p-3 text-left transition-colors ${active ? "border-amber-400/30 bg-amber-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-zinc-100">{props.label}</div>
        {active ? <Badge variant="green">已选</Badge> : <Badge variant="gray">未选</Badge>}
      </div>
      <div className={`mt-3 h-16 rounded-md ${skinStyle(props.value)}`} />
    </button>
  );
}

function CardPreview(props: { skin: CardSkinKey; enterpriseName: string }) {
  return (
    <div className={`rounded-xl p-4 shadow-sm ${skinStyle(props.skin)}`}>
      <div className="text-center text-xs font-semibold opacity-85">{props.enterpriseName || "—"}</div>
      <div className="mt-2 text-xs opacity-80">AI名片</div>
      <div className="mt-2 text-lg font-semibold">周亮</div>
      <div className="mt-1 text-sm opacity-90">示例科技 · 运营负责人</div>
      <div className="mt-4 flex items-center justify-between text-xs opacity-80">
        <div>138****1234</div>
        <div>demo@company.com</div>
      </div>
    </div>
  );
}

function AvatarOption(props: { label: string; value: VirtualAvatarKey; current: VirtualAvatarKey; onPick: (v: VirtualAvatarKey) => void }) {
  const active = props.current === props.value;
  return (
    <button
      type="button"
      onClick={() => props.onPick(props.value)}
      className={`rounded-lg border p-3 text-left transition-colors ${active ? "border-amber-400/30 bg-amber-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-zinc-100">{props.label}</div>
        {active ? <Badge variant="green">已选</Badge> : <Badge variant="gray">未选</Badge>}
      </div>
      <div className="mt-3 h-16 rounded-md border border-white/10 bg-white/5" />
    </button>
  );
}

function SitePreview(props: {
  template: SiteTemplateKey;
  enterpriseName: string;
  modules: { key: string; label: string; enabled: boolean }[];
  avatarKey: VirtualAvatarKey;
  avatarCustomUrl: string | null;
}) {
  const productTitle = props.template === "split" ? "AI超级站 · 双区模板" : "AI超级站 · 标准模板";
  const avatarLabel =
    props.avatarKey === "cat"
      ? "猫"
      : props.avatarKey === "dog"
      ? "狗"
      : props.avatarKey === "dragon"
      ? "龙"
      : props.avatarKey === "dilireba"
      ? "热巴"
      : props.avatarKey === "robot"
      ? "机器人"
      : "自定义";
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-amber-300 to-amber-600" />
          <div className="text-sm font-semibold text-zinc-100">{props.enterpriseName || "—"}</div>
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-300">
          <div>产品分类</div>
          <div>购物车</div>
          <div>用户中心</div>
        </div>
      </div>
      <div className={`grid gap-3 p-4 ${props.template === "split" ? "md:grid-cols-2" : "grid-cols-1"}`}>
        <div className="rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="text-xs text-zinc-400">{productTitle}</div>
          <div className="mt-3 h-28 rounded-md border border-white/10 bg-white/5" />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="h-10 rounded-md border border-white/10 bg-white/5" />
            <div className="h-10 rounded-md border border-white/10 bg-white/5" />
            <div className="h-10 rounded-md border border-white/10 bg-white/5" />
          </div>
        </div>
        {props.template === "split" ? (
          <div className="rounded-lg border border-white/10 bg-black/20 p-4">
            <div className="text-xs text-zinc-400">推荐区</div>
            <div className="mt-3 h-28 rounded-md border border-white/10 bg-white/5" />
            <div className="mt-3 h-10 rounded-md border border-white/10 bg-white/5" />
          </div>
        ) : null}
      </div>
      <div className="border-t border-white/10 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {props.modules.map((m) => (
            <span key={m.key} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-200">
              {m.label}
            </span>
          ))}
        </div>
      </div>
      <div className="absolute bottom-3 right-3">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-2 backdrop-blur">
          {props.avatarKey === "custom" && props.avatarCustomUrl ? (
            <img src={props.avatarCustomUrl} alt="avatar" className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs text-zinc-100">
              {avatarLabel}
            </div>
          )}
          <div className="text-xs text-zinc-200">桌宠</div>
        </div>
      </div>
    </div>
  );
}
