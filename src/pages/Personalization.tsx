import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { getMySuperSiteSettings, updateMySuperSiteSettings } from "@/lib/superSiteSettings";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import { usePageMeta } from "@/hooks/usePageMeta";
import SuperSiteIndustrySection from "@/pages/personalization/SuperSiteIndustrySection";
import SuperSiteMediaSection from "@/pages/personalization/SuperSiteMediaSection";
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
        <SuperSiteMediaSection />
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
