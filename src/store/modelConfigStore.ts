import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  getProviderPreset,
  inferProviderKey,
  type ModelType,
  type ProviderKey,
} from "@/config/modelProviderPresets";

export type ModelConfig = {
  type: ModelType;
  title: string;
  desc: string;
  enabled: boolean;
  providerKey: ProviderKey;
  providerName: string;
  baseUrl: string;
  taskQueryUrlTemplate?: string;
  apiKey: string;
  modelName: string;
  timeoutSeconds: string;
  maxRetries: string;
  responseFormat: string;
  remark: string;
  scopes: string[];
};

const defaultConfigs: ModelConfig[] = [
  {
    type: "text",
    title: "文字模型",
    desc: "用于图文文案、视频脚本、AI 客服问答和知识库 RAG 回答。",
    enabled: true,
    providerKey: "qwen",
    providerName: "Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKey: "",
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
    providerKey: "qwen",
    providerName: "Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/api/v1/services/aigc",
    taskQueryUrlTemplate: "https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}",
    apiKey: "",
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
    providerKey: "qwen",
    providerName: "Qwen",
    baseUrl: "https://dashscope.aliyuncs.com/api/v1/services/aigc",
    taskQueryUrlTemplate: "https://dashscope.aliyuncs.com/api/v1/tasks/{taskId}",
    apiKey: "",
    modelName: "wanx-video-v1",
    timeoutSeconds: "120",
    maxRetries: "1",
    responseFormat: "json",
    remark: "用于产品视频、真人口播视频。",
    scopes: ["产品视频", "真人口播视频"],
  },
];

type ModelConfigState = {
  ownerUserId: string | null;
  configs: ModelConfig[];
  bindOwner: (userId: string | null | undefined) => void;
  updateConfig: (type: ModelType, patch: Partial<ModelConfig>) => void;
  replaceConfig: (type: ModelType, next: Partial<ModelConfig>) => void;
  resetConfigs: () => void;
};

function mergeConfigs(saved?: ModelConfig[]) {
  if (!saved?.length) {
    return defaultConfigs;
  }

  return defaultConfigs.map((base) => {
    const found = saved.find((item) => item.type === base.type);
    const providerKey = inferProviderKey(base.type, found);
    const preset = getProviderPreset(base.type, providerKey);
    return found
      ? {
          ...base,
          ...found,
          providerKey,
          providerName: found.providerName || preset?.providerName || base.providerName,
          baseUrl:
            found.baseUrl ||
            (found as ModelConfig & { requestUrl?: string }).requestUrl ||
            base.baseUrl,
          taskQueryUrlTemplate:
            found.taskQueryUrlTemplate || preset?.taskQueryUrlTemplate || base.taskQueryUrlTemplate,
          type: base.type,
          scopes: found.scopes?.length ? found.scopes : base.scopes,
        }
      : base;
  });
}

export const useModelConfigStore = create<ModelConfigState>()(
  persist(
    (set) => ({
      ownerUserId: null,
      configs: defaultConfigs,
      bindOwner: (userId) =>
        set((state) => {
          const normalizedUserId = userId?.trim() || null;
          if (state.ownerUserId === normalizedUserId) {
            return state;
          }
          return {
            ownerUserId: normalizedUserId,
            configs: defaultConfigs,
          };
        }),
      updateConfig: (type, patch) =>
        set((state) => ({
          configs: state.configs.map((item) => (item.type === type ? { ...item, ...patch, type: item.type } : item)),
        })),
      replaceConfig: (type, next) =>
        set((state) => ({
          configs: state.configs.map((item) =>
            item.type === type
              ? {
                  ...item,
                  ...next,
                  type: item.type,
                }
              : item
          ),
        })),
      resetConfigs: () => set({ configs: defaultConfigs }),
    }),
    {
      name: "aiadmin_model_configs_v1",
      merge: (persistedState, currentState) => {
        const persisted = (persistedState as Partial<ModelConfigState>) ?? {};
        return {
          ...currentState,
          ...persisted,
          ownerUserId: persisted.ownerUserId ?? null,
          configs: mergeConfigs(persisted.configs),
        };
      },
    }
  )
);
