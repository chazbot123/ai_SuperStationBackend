import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { getMySuperSiteSettings } from "@/lib/superSiteSettings";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { usePageMeta } from "@/hooks/usePageMeta";
import SuperSiteIndustrySection from "@/pages/personalization/SuperSiteIndustrySection";
import SuperSiteMetricsSection from "@/pages/personalization/SuperSiteMetricsSection";
import { useAuthStore } from "@/store/authStore";
import { useAppStore, type SiteTemplateKey } from "@/store/appStore";

export default function Personalization() {
  usePageMeta("超级站配置中心");

  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const canEdit = user?.roleKey === "main_company";
  const settings = useAppStore((s) => s.settings);
  const replaceSettings = useAppStore((s) => s.replaceSettings);
  const setEnterpriseName = useAppStore((s) => s.setEnterpriseName);
  const setSiteTemplate = useAppStore((s) => s.setSiteTemplate);
  const toggleSiteModule = useAppStore((s) => s.toggleSiteModule);
  const reorderSiteModules = useAppStore((s) => s.reorderSiteModules);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  const enabledModules = useMemo(() => settings.siteModules.filter((m) => m.enabled), [settings.siteModules]);
  const editableModules = useMemo(
    () => settings.siteModules.map((module, index) => ({ ...module, index })),
    [settings.siteModules]
  );
  const activeSection = useMemo<"layout" | "metrics" | "industry">(() => {
    if (location.pathname.startsWith("/personalization/metrics")) {
      return "metrics";
    }
    if (location.pathname.startsWith("/personalization/industry")) {
      return "industry";
    }
    return "layout";
  }, [location.pathname]);

  useEffect(() => {
    if (!canEdit || !accessToken) {
      setSettingsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadSettings() {
      setSettingsLoading(true);

      try {
        const payload = await getMySuperSiteSettings();
        if (cancelled) return;
        replaceSettings(payload);
        setSettingsError(null);
      } catch (error) {
        if (cancelled) return;
        setSettingsError(error instanceof Error ? error.message : "加载超级站配置失败");
      } finally {
        if (!cancelled) {
          setSettingsLoading(false);
        }
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [accessToken, canEdit, replaceSettings]);

  if (!canEdit) {
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        当前角色无权访问超级站配置中心。该模块仅主公司可见。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {settingsLoading ? (
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
          正在加载超级站配置...
        </div>
      ) : null}

      {settingsError ? (
        <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {settingsError}
        </div>
      ) : null}

      {activeSection === "layout" ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>站点模板与模块布局</CardTitle>
              <Badge variant="gray">仅影响超级站前台显示，不改后台模板</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 xl:grid-cols-12">
            <div className="xl:col-span-5 space-y-4">
              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">企业名称</span>
                <Input value={settings.enterpriseName} onChange={(e) => setEnterpriseName(e.target.value)} />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">超级站模板</span>
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
              <div className="mb-2 text-xs font-medium text-zinc-300">超级站预览摘要</div>
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

      {activeSection === "metrics" ? (
        <SuperSiteMetricsSection />
      ) : null}

      {activeSection === "industry" ? (
        <SuperSiteIndustrySection />
      ) : null}

    </div>
  );
}
