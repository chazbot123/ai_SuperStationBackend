import { useState } from "react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAuthStore } from "@/store/authStore";

type ModelType = "text" | "image" | "video";

type ModelConfig = {
  type: ModelType;
  title: string;
  desc: string;
  enabled: boolean;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
  timeoutSeconds: string;
  maxRetries: string;
  responseFormat: string;
  remark: string;
  scopes: string[];
};

const initialConfigs: ModelConfig[] = [
  {
    type: "text",
    title: "文字模型",
    desc: "用于图文文案、视频脚本、AI 客服问答和知识库 RAG 回答。",
    enabled: true,
    providerName: "DashScope",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: "sk-****-text-demo",
    modelName: "qwen-plus",
    timeoutSeconds: "60",
    maxRetries: "2",
    responseFormat: "json",
    remark: "默认文字模型，同时服务内容生成和客服模块。",
    scopes: ["图文文案", "视频脚本", "AI 客服", "RAG 回答"],
  },
  {
    type: "image",
    title: "图片模型",
    desc: "用于社媒图文、商品图与详情图生成。",
    enabled: true,
    providerName: "DashScope",
    baseUrl: "https://dashscope.aliyuncs.com/api/v1/services/aigc",
    apiKey: "sk-****-image-demo",
    modelName: "qwen-image-max",
    timeoutSeconds: "90",
    maxRetries: "2",
    responseFormat: "json",
    remark: "用于文生图、图生图和商品图结果生成。",
    scopes: ["社媒图文", "商品图", "详情图"],
  },
  {
    type: "video",
    title: "视频模型",
    desc: "用于产品视频和真人口播视频任务生成。",
    enabled: true,
    providerName: "DashScope",
    baseUrl: "https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation",
    apiKey: "sk-****-video-demo",
    modelName: "wanx-video-v1",
    timeoutSeconds: "120",
    maxRetries: "1",
    responseFormat: "json",
    remark: "用于产品视频、真人口播视频。",
    scopes: ["产品视频", "真人口播视频"],
  },
];

function modelBadge(type: ModelType) {
  if (type === "text") return <Badge variant="blue">文字模型</Badge>;
  if (type === "image") return <Badge variant="amber">图片模型</Badge>;
  return <Badge variant="green">视频模型</Badge>;
}

export default function Rules() {
  usePageMeta("模型配置");

  const user = useAuthStore((s) => s.user);
  const canEdit = user?.roleKey === "main_company";
  const [configs, setConfigs] = useState(initialConfigs);
  const [activeType, setActiveType] = useState<ModelType>("text");
  const [testingType, setTestingType] = useState<ModelType | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);

  const active = configs.find((item) => item.type === activeType) ?? configs[0];

  if (!canEdit) {
    return (
      <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        当前角色无权访问模型配置。该模块仅主公司可见。
      </div>
    );
  }

  const updateActive = (patch: Partial<ModelConfig>) => {
    setConfigs((prev) => prev.map((item) => (item.type === activeType ? { ...item, ...patch } : item)));
    setSavedHint(null);
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
              <Badge variant="gray">仅主公司可维护</Badge>
              <Button
                onClick={() => {
                  setSavedHint("配置已保存（Demo）");
                  window.setTimeout(() => setSavedHint(null), 2000);
                }}
              >
                保存全部配置
              </Button>
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
            <div className="flex items-center justify-between">
              <CardTitle>{active.title} 参数</CardTitle>
              {savedHint ? <span className="text-xs text-emerald-300">{savedHint}</span> : null}
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
                <span className="text-xs font-medium text-zinc-300">服务商名称</span>
                <Input value={active.providerName} onChange={(e) => updateActive({ providerName: e.target.value })} />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-zinc-300">Base URL</span>
                <Input value={active.baseUrl} onChange={(e) => updateActive({ baseUrl: e.target.value })} />
              </label>

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

            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div>
                <div className="text-sm font-medium text-zinc-100">连接测试</div>
                <div className="mt-1 text-xs text-zinc-400">用于模拟 `POST /api/admin/model-configs/:type/test` 的后台联调入口。</div>
              </div>
              <Button
                variant="secondary"
                disabled={testingType === active.type}
                onClick={() => {
                  setTestingType(active.type);
                  window.setTimeout(() => {
                    setTestingType(null);
                    setSavedHint(`${active.title} 测试连接成功（Demo）`);
                  }, 900);
                }}
              >
                {testingType === active.type ? "连接中..." : "测试连接"}
              </Button>
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
                <div>1. 文字模型同时服务内容生成、AI 客服与知识库 RAG，不单独拆客服模型。</div>
                <div>2. 图片模型用于社媒图文和商品图生成。</div>
                <div>3. 视频模型用于产品视频和真人口播视频。</div>
                <div>4. 当前页面先用本地状态模拟，后续统一接入模型配置表和保存接口。</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
