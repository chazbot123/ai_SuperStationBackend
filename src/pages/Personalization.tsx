import { useMemo, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Tabs from "@/components/ui/Tabs";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAuthStore } from "@/store/authStore";
import { useAppStore, type CardSkinKey, type SiteTemplateKey, type VirtualAvatarKey } from "@/store/appStore";

type MetricConfig = {
  key: "visits" | "consultations" | "signing_rate" | "purchases";
  label: string;
  valueMode: "dynamic" | "fixed";
  startValue: string;
  tickInterval: string;
  incrementRange: string;
  fixedValue: string;
};

const metricSeed: MetricConfig[] = [
  { key: "visits", label: "访问量", valueMode: "dynamic", startValue: "2680", tickInterval: "8", incrementRange: "1-3", fixedValue: "" },
  { key: "consultations", label: "咨询量", valueMode: "dynamic", startValue: "126", tickInterval: "15", incrementRange: "1-2", fixedValue: "" },
  { key: "signing_rate", label: "招商签约率", valueMode: "fixed", startValue: "", tickInterval: "", incrementRange: "", fixedValue: "31%" },
  { key: "purchases", label: "购买量", valueMode: "dynamic", startValue: "880", tickInterval: "20", incrementRange: "1-2", fixedValue: "" },
];

export default function Personalization() {
  usePageMeta("前台配置中心");

  const user = useAuthStore((s) => s.user);
  const canEdit = user?.roleKey === "main_company";
  const [tab, setTab] = useState("layout");
  const settings = useAppStore((s) => s.settings);
  const setCardSkin = useAppStore((s) => s.setCardSkin);
  const setEnterpriseName = useAppStore((s) => s.setEnterpriseName);
  const setVirtualAvatar = useAppStore((s) => s.setVirtualAvatar);
  const setVirtualAvatarCustomUrl = useAppStore((s) => s.setVirtualAvatarCustomUrl);
  const setSiteTemplate = useAppStore((s) => s.setSiteTemplate);
  const toggleSiteModule = useAppStore((s) => s.toggleSiteModule);
  const reorderSiteModules = useAppStore((s) => s.reorderSiteModules);

  const [metrics, setMetrics] = useState(metricSeed);
  const [industrySources, setIndustrySources] = useState("虎嗅、量子位、36氪");
  const [industryKeywords, setIndustryKeywords] = useState("AI建站、智能营销、数字化招商");
  const [industryRefresh, setIndustryRefresh] = useState("每天 09:00");
  const [tickerItems, setTickerItems] = useState([
    { id: "t1", name: "电热转化率", value: "99%", desc: "比传统供暖方式节能 50% 以上" },
    { id: "t2", name: "安装周期", value: "3 天", desc: "适合改造型项目快速交付" },
  ]);

  const enabledModules = useMemo(() => settings.siteModules.filter((m) => m.enabled), [settings.siteModules]);
  const editableModules = useMemo(
    () => settings.siteModules.map((module, index) => ({ ...module, index })),
    [settings.siteModules]
  );

  if (!canEdit) {
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        当前角色无权访问前台配置中心。该模块仅主公司可见。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs
        tabs={[
          { key: "layout", label: "布局与模板" },
          { key: "metrics", label: "运营指标" },
          { key: "industry", label: "行业与招商" },
          { key: "avatar", label: "AI形象与名片" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "layout" ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>站点模板与模块布局</CardTitle>
              <Badge variant="gray">仅影响前台显示，不改后台模板</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-5 space-y-4">
              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">企业名称</span>
                <Input value={settings.enterpriseName} onChange={(e) => setEnterpriseName(e.target.value)} />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">前台模板</span>
                <Select value={settings.siteTemplate} onChange={(e) => setSiteTemplate(e.target.value as SiteTemplateKey)}>
                  <option value="standard">标准模板</option>
                  <option value="split">双区模板</option>
                </Select>
              </label>

              <div>
                <div className="mb-2 text-xs font-medium text-zinc-300">模块启停与顺序</div>
                <div className="space-y-2">
                  {editableModules.map((module, index) => (
                    <div key={module.key} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-500">#{index + 1}</span>
                        <input type="checkbox" checked={module.enabled} onChange={() => toggleSiteModule(module.key)} />
                        <span className="text-sm text-zinc-100">{module.label}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="secondary" size="sm" disabled={index === 0} onClick={() => reorderSiteModules(index, index - 1)}>
                          上移
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={index === editableModules.length - 1}
                          onClick={() => reorderSiteModules(index, index + 1)}
                        >
                          下移
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="xl:col-span-7">
              <div className="mb-2 text-xs font-medium text-zinc-300">前台预览摘要</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="text-sm font-semibold text-zinc-100">{settings.enterpriseName || "企业名称"}</div>
                  <Badge variant="amber">{settings.siteTemplate === "split" ? "双区模板" : "标准模板"}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {enabledModules.map((module) => (
                    <div key={module.key} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-zinc-300">
                      {module.label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {tab === "metrics" ? (
        <Card>
          <CardHeader>
            <CardTitle>运营指标组配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {metrics.map((item, index) => (
              <div key={item.key} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-medium text-zinc-100">{item.label}</div>
                  <Badge variant={item.valueMode === "dynamic" ? "blue" : "gray"}>
                    {item.valueMode === "dynamic" ? "动态值" : "固定值"}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-zinc-300">展示顺序</span>
                    <Input value={String(index + 1)} readOnly />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-zinc-300">起始值</span>
                    <Input
                      value={item.startValue}
                      onChange={(e) =>
                        setMetrics((prev) => prev.map((row) => (row.key === item.key ? { ...row, startValue: e.target.value } : row)))
                      }
                      disabled={item.valueMode !== "dynamic"}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-zinc-300">跳动间隔（秒）</span>
                    <Input
                      value={item.tickInterval}
                      onChange={(e) =>
                        setMetrics((prev) => prev.map((row) => (row.key === item.key ? { ...row, tickInterval: e.target.value } : row)))
                      }
                      disabled={item.valueMode !== "dynamic"}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-medium text-zinc-300">固定值</span>
                    <Input
                      value={item.fixedValue}
                      onChange={(e) =>
                        setMetrics((prev) => prev.map((row) => (row.key === item.key ? { ...row, fixedValue: e.target.value } : row)))
                      }
                      disabled={item.valueMode !== "fixed"}
                    />
                  </label>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {tab === "industry" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-7">
            <CardHeader>
              <CardTitle>行业信息与自动抓取</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">抓取来源站点</span>
                <Input value={industrySources} onChange={(e) => setIndustrySources(e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">行业关键词</span>
                <Input value={industryKeywords} onChange={(e) => setIndustryKeywords(e.target.value)} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">刷新频率</span>
                <Input value={industryRefresh} onChange={(e) => setIndustryRefresh(e.target.value)} />
              </label>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-zinc-300">
                当前口径：自动抓取行业动态 + 后台手工行业信息，统一排序后在前台展示。
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-5">
            <CardHeader>
              <CardTitle>结构化滚动条</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {tickerItems.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="grid grid-cols-1 gap-3">
                    <Input
                      value={item.name}
                      onChange={(e) =>
                        setTickerItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, name: e.target.value } : row)))
                      }
                    />
                    <Input
                      value={item.value}
                      onChange={(e) =>
                        setTickerItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, value: e.target.value } : row)))
                      }
                    />
                    <Input
                      value={item.desc}
                      onChange={(e) =>
                        setTickerItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, desc: e.target.value } : row)))
                      }
                    />
                  </div>
                </div>
              ))}
              <Button
                variant="secondary"
                onClick={() =>
                  setTickerItems((prev) => [...prev, { id: `ticker_${Date.now()}`, name: "新增字段", value: "示例值", desc: "示例描述" }])
                }
              >
                新增滚动条项目
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "avatar" ? (
        <Card>
          <CardHeader>
            <CardTitle>AI 形象与企业名片</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-7 space-y-4">
              <div>
                <div className="mb-2 text-xs font-medium text-zinc-300">名片皮肤</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <SkinOption label="黑金商务" value="black_gold" current={settings.cardSkin} onPick={setCardSkin} />
                  <SkinOption label="幻彩珠光" value="iridescent" current={settings.cardSkin} onPick={setCardSkin} />
                  <SkinOption label="几何绿" value="geo_green" current={settings.cardSkin} onPick={setCardSkin} />
                  <SkinOption label="夜色金线" value="night_gold" current={settings.cardSkin} onPick={setCardSkin} />
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-zinc-300">AI 形象</div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <AvatarOption label="猫咪" value="cat" current={settings.virtualAvatar} onPick={setVirtualAvatar} />
                  <AvatarOption label="机器人" value="robot" current={settings.virtualAvatar} onPick={setVirtualAvatar} />
                  <AvatarOption label="自定义" value="custom" current={settings.virtualAvatar} onPick={setVirtualAvatar} />
                </div>
              </div>

              <div>
                <div className="mb-1 text-xs font-medium text-zinc-300">上传自定义头像</div>
                <input
                  className="block w-full text-sm text-zinc-200 file:mr-3 file:rounded-md file:border file:border-white/10 file:bg-white/5 file:px-3 file:py-2 file:text-sm file:text-zinc-200 hover:file:bg-white/10"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      setVirtualAvatarCustomUrl(String(reader.result ?? ""));
                      setVirtualAvatar("custom");
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </div>
            </div>

            <div className="xl:col-span-5">
              <div className="mb-2 text-xs font-medium text-zinc-300">预览</div>
              <CardPreview skin={settings.cardSkin} enterpriseName={settings.enterpriseName} />
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
      className={`rounded-lg border p-3 text-left transition-colors ${
        active ? "border-amber-400/30 bg-amber-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-zinc-100">{props.label}</div>
        {active ? <Badge variant="green">已选</Badge> : <Badge variant="gray">未选</Badge>}
      </div>
      <div className={`mt-3 h-16 rounded-md ${skinStyle(props.value)}`} />
    </button>
  );
}

function AvatarOption(props: { label: string; value: VirtualAvatarKey; current: VirtualAvatarKey; onPick: (v: VirtualAvatarKey) => void }) {
  const active = props.current === props.value;
  return (
    <button
      type="button"
      onClick={() => props.onPick(props.value)}
      className={`rounded-lg border p-3 text-left transition-colors ${
        active ? "border-amber-400/30 bg-amber-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-zinc-100">{props.label}</div>
        {active ? <Badge variant="green">已选</Badge> : <Badge variant="gray">未选</Badge>}
      </div>
      <div className="mt-3 h-16 rounded-md border border-white/10 bg-white/5" />
    </button>
  );
}

function CardPreview(props: { skin: CardSkinKey; enterpriseName: string }) {
  return (
    <div className={`rounded-xl p-4 shadow-sm ${skinStyle(props.skin)}`}>
      <div className="text-center text-xs font-semibold opacity-85">{props.enterpriseName || "企业名称"}</div>
      <div className="mt-2 text-xs opacity-80">AI 名片预览</div>
      <div className="mt-2 text-lg font-semibold">运营负责人</div>
      <div className="mt-1 text-sm opacity-90">AI 超级站 · 主公司后台</div>
      <div className="mt-4 flex items-center justify-between text-xs opacity-80">
        <div>138****1234</div>
        <div>demo@company.com</div>
      </div>
    </div>
  );
}
