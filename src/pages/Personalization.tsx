import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { getMySuperSiteSettings, updateMySuperSiteSettings } from "@/lib/superSiteSettings";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { usePageMeta } from "@/hooks/usePageMeta";
import SuperSiteIndustrySection from "@/pages/personalization/SuperSiteIndustrySection";
import SuperSiteMetricsSection from "@/pages/personalization/SuperSiteMetricsSection";
import { useAuthStore } from "@/store/authStore";
import { useAppStore } from "@/store/appStore";

export default function Personalization() {
  usePageMeta("超级站配置中心");

  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const canEdit = user?.roleKey === "main_company" || user?.roleKey === "level1_agent";
  const settings = useAppStore((s) => s.settings);
  const replaceSettings = useAppStore((s) => s.replaceSettings);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [superSiteBaseUrlDraft, setSuperSiteBaseUrlDraft] = useState("");
  const [savingBaseUrl, setSavingBaseUrl] = useState(false);
  const [baseUrlSaved, setBaseUrlSaved] = useState(false);

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

  useEffect(() => {
    setSuperSiteBaseUrlDraft(settings.superSiteBaseUrl ?? "");
  }, [settings.superSiteBaseUrl]);

  async function handleSaveSuperSiteBaseUrl() {
    setSavingBaseUrl(true);
    setSettingsError(null);

    try {
      const payload = await updateMySuperSiteSettings({
        superSiteBaseUrl: superSiteBaseUrlDraft,
      });
      replaceSettings(payload);
      setBaseUrlSaved(true);
      window.setTimeout(() => {
        setBaseUrlSaved(false);
      }, 1500);
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "保存超级站前台地址失败");
    } finally {
      setSavingBaseUrl(false);
    }
  }

  if (!canEdit) {
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        当前角色无权访问超级站配置中心。
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
            <CardTitle>超级站地址设置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">超级站前台地址</span>
                <Input
                  value={superSiteBaseUrlDraft}
                  onChange={(e) => setSuperSiteBaseUrlDraft(e.target.value)}
                  placeholder="http://localhost:5173/"
                />
              </label>
              <div className="mt-2 text-xs text-zinc-400">
                保存后，“上传超级站”会直接按这里的地址打开当前账号对应的前台站点。
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" onClick={() => void handleSaveSuperSiteBaseUrl()} disabled={savingBaseUrl}>
                  {savingBaseUrl ? "保存中..." : baseUrlSaved ? "已保存" : "保存地址"}
                </Button>
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
