import { useEffect, useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import {
  getProviderPreset,
  getProviderPresets,
  looksLikeUnifiedVideoGatewayVideoConfig,
  normalizeVideoTaskQueryUrlTemplate,
  type ModelType,
} from "@/config/modelProviderPresets";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  activateModelConfig,
  listActiveModelConfigs,
  listSavedModelConfigs,
  testModelConnection,
  type SavedProviderModelConfigItem,
} from "@/lib/ai";
import { useAuthStore } from "@/store/authStore";
import { canEdit as canEditPage } from "@/store/permissions";
import { useModelConfigStore, type ModelConfig } from "@/store/modelConfigStore";

function modelBadge(type: ModelType) {
  if (type === "text") return <Badge variant="blue">文字模型</Badge>;
  if (type === "image") return <Badge variant="amber">图片模型</Badge>;
  return <Badge variant="green">视频模型</Badge>;
}

export default function Rules() {
  usePageMeta("模型配置");

  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const canEdit = user ? canEditPage(user.roleKey, "rules") : false;
  const configs = useModelConfigStore((s) => s.configs);
  const updateConfig = useModelConfigStore((s) => s.updateConfig);
  const replaceConfig = useModelConfigStore((s) => s.replaceConfig);
  const [activeType, setActiveType] = useState<ModelType>("text");
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [testHint, setTestHint] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedConfigs, setSavedConfigs] = useState<
    Partial<Record<ModelType, Partial<Record<ModelConfig["providerKey"], SavedProviderModelConfigItem>>>>
  >({});

  const active = configs.find((item) => item.type === activeType) ?? configs[0];
  const providerOptions = getProviderPresets(activeType);

  useEffect(() => {
    if (!accessToken || !canEdit) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [activeItems, savedItems] = await Promise.all([
          listActiveModelConfigs(accessToken),
          listSavedModelConfigs(accessToken),
        ]);
        if (cancelled) return;
        const nextSaved: Partial<
          Record<ModelType, Partial<Record<ModelConfig["providerKey"], SavedProviderModelConfigItem>>>
        > = {};
        for (const item of savedItems) {
          nextSaved[item.type] = nextSaved[item.type] ?? {};
          nextSaved[item.type]![item.providerKey] = item;
        }
        setSavedConfigs(nextSaved);
        for (const item of activeItems) {
          replaceConfig(item.type, item);
        }
      } catch {
        // keep local config when redis has no active settings or is temporarily unavailable
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, canEdit, replaceConfig]);

  useEffect(() => {
    const saved = savedConfigs[activeType]?.[active.providerKey];
    if (saved) {
      replaceConfig(activeType, saved);
    }
  }, [active.providerKey, activeType, replaceConfig, savedConfigs]);

  useEffect(() => {
    if (active.type !== "video") {
      return;
    }

    const normalizedTaskQueryUrlTemplate = normalizeVideoTaskQueryUrlTemplate({
      providerKey: active.providerKey,
      providerName: active.providerName,
      baseUrl: active.baseUrl,
      taskQueryUrlTemplate: active.taskQueryUrlTemplate,
      modelName: active.modelName,
    });
    const currentTaskQueryUrlTemplate = active.taskQueryUrlTemplate?.trim() || undefined;
    if (normalizedTaskQueryUrlTemplate === currentTaskQueryUrlTemplate) {
      return;
    }

    updateConfig(activeType, { taskQueryUrlTemplate: normalizedTaskQueryUrlTemplate });
    setSavedHint(null);
    setTestHint(null);
  }, [
    active.baseUrl,
    active.modelName,
    active.providerKey,
    active.providerName,
    active.taskQueryUrlTemplate,
    active.type,
    activeType,
    updateConfig,
  ]);

  if (!canEdit) {
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        当前角色无权访问模型配置。
      </div>
    );
  }

  const updateActive = (patch: Partial<ModelConfig>) => {
    updateConfig(activeType, patch);
    setSavedHint(null);
    setTestHint(null);
  };

  const handleProviderChange = (providerKey: string) => {
    const preset = getProviderPreset(activeType, providerKey as ModelConfig["providerKey"]);
    if (!preset) return;

    const saved = savedConfigs[activeType]?.[preset.key];
    if (saved) {
      replaceConfig(activeType, saved);
      return;
    }

    updateActive({
      providerKey: preset.key,
      providerName: preset.providerName,
      baseUrl: preset.baseUrl,
      taskQueryUrlTemplate: preset.taskQueryUrlTemplate,
      modelName: preset.defaultModelName,
    });
  };

  const handleTestConnection = async () => {
    if (!accessToken || isTesting) return;

    setIsTesting(true);
    setTestHint("测试中...");
    try {
      const result = await testModelConnection({
        type: activeType,
        modelConfig: active,
        accessToken,
      });
      setTestHint(result.message);
    } catch (error) {
      setTestHint(error instanceof Error ? error.message : "测试连接失败");
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAndUse = async () => {
    if (!accessToken || isSaving) return;

    setIsSaving(true);
    setSavedHint("保存中...");
    try {
      const saved = await activateModelConfig({
        type: activeType,
        modelConfig: active,
        accessToken,
      });
      setSavedConfigs((current) => ({
        ...current,
        [saved.type]: {
          ...(current[saved.type] ?? {}),
          [saved.providerKey]: saved,
        },
      }));
      replaceConfig(saved.type, saved);
      setSavedHint(`${active.title}已保存并生效`);
    } catch (error) {
      setSavedHint(error instanceof Error ? error.message : "保存失败");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>模型配置</CardTitle>
              <div className="mt-2 text-sm text-zinc-400">
                当前后台为模板化交付模式。每个客户独立部署时，都需要在这里配置自己的文字、图片、视频模型参数。
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="gray">当前角色可维护</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
            {configs.map((item) => {
              const isActive = item.type === activeType;
              return (
                <button
                  key={item.type}
                  type="button"
                  onClick={() => setActiveType(item.type)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    isActive ? "border-amber-400/30 bg-amber-500/10" : "border-white/10 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-base font-semibold text-zinc-100">{item.title}</div>
                    {modelBadge(item.type)}
                  </div>
                  <div className="mt-2 text-sm leading-6 text-zinc-400">{item.desc}</div>
                  <div className="mt-4 flex items-center justify-between text-xs text-zinc-400">
                    <span>型号：{item.modelName}</span>
                    <span>{item.enabled ? "已启用" : "未启用"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card className="xl:col-span-8">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{active.title} 参数</CardTitle>
              <div className="flex items-center gap-3">
                {savedHint ? <span className="text-xs text-emerald-300">{savedHint}</span> : null}
                {testHint ? <span className="text-xs text-amber-300">{testHint}</span> : null}
                <Button type="button" size="sm" onClick={handleSaveAndUse} disabled={isSaving}>
                  {isSaving ? "保存中..." : "保存并使用"}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={handleTestConnection} disabled={isTesting}>
                  {isTesting ? "测试中..." : "测试连接"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">是否启用</span>
                <Select
                  value={String(active.enabled)}
                  onChange={(e) => updateActive({ enabled: e.target.value === "true" })}
                >
                  <option value="true">启用</option>
                  <option value="false">停用</option>
                </Select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">服务商</span>
                <Select value={active.providerKey} onChange={(e) => handleProviderChange(e.target.value)}>
                  {providerOptions.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">服务商名称</span>
                <Input value={active.providerName} onChange={(e) => updateActive({ providerName: e.target.value })} />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-zinc-300">Base URL</span>
                <Input value={active.baseUrl} onChange={(e) => updateActive({ baseUrl: e.target.value })} />
              </label>

              {(active.type === "image" || active.type === "video") ? (
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-medium text-zinc-300">任务查询地址模板</span>
                  <Input
                    value={active.taskQueryUrlTemplate ?? ""}
                    onChange={(e) => updateActive({ taskQueryUrlTemplate: e.target.value })}
                    placeholder="可选，异步任务时使用，例如 https://example.com/tasks/{taskId}"
                  />
                </label>
              ) : null}

              {active.type === "video" &&
              looksLikeUnifiedVideoGatewayVideoConfig({
                providerKey: active.providerKey,
                providerName: active.providerName,
                baseUrl: active.baseUrl,
                modelName: active.modelName,
              }) ? (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/5 px-4 py-3 text-xs leading-6 text-amber-100 md:col-span-2">
                  当前视频配置会按统一视频网关处理，可直接填写网关根地址、`/v1` 或完整 `/v1/videos`。若任务查询仍是标准
                  `/v1/videos/{'{'}taskId{'}'}`，查询模板可留空；像旧的
                  `/api/v3/contents/generations/tasks/{'{'}taskId{'}'}` 会被自动清理。
                </div>
              ) : null}

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-zinc-300">API Key</span>
                <Input value={active.apiKey} onChange={(e) => updateActive({ apiKey: e.target.value })} />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">模型型号</span>
                <Input value={active.modelName} onChange={(e) => updateActive({ modelName: e.target.value })} />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">返回格式</span>
                <Select value={active.responseFormat} onChange={(e) => updateActive({ responseFormat: e.target.value })}>
                  <option value="json">json</option>
                  <option value="text">text</option>
                </Select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">超时时间（秒）</span>
                <Input value={active.timeoutSeconds} onChange={(e) => updateActive({ timeoutSeconds: e.target.value })} />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-zinc-300">失败重试次数</span>
                <Input value={active.maxRetries} onChange={(e) => updateActive({ maxRetries: e.target.value })} />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-zinc-300">备注说明</span>
                <Input value={active.remark} onChange={(e) => updateActive({ remark: e.target.value })} />
              </label>
            </div>

          </CardContent>
        </Card>

        <Card className="xl:col-span-4">
          <CardHeader>
            <CardTitle>适用范围</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-sm font-medium text-zinc-100">{active.title} 当前用途</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {active.scopes.map((scope) => (
                  <span key={scope} className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-zinc-200">
                    {scope}
                  </span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-zinc-300">
              说明：
              <div className="mt-2 space-y-2 text-zinc-400">
                <div>1. 先选服务商，系统会自动填官方 Base URL 和默认模型。</div>
                <div>2. 官方服务商按 Base URL 自动拼协议路径，自定义场景可手动调整。</div>
                <div>3. 图片和视频如为异步任务，可额外填写任务查询地址模板。</div>
                <div>4. 测试连接会真实请求上游接口，可能创建测试任务或产生计费。</div>
                <div>5. 图文生成和测试连接都会按服务商协议自动匹配。</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
