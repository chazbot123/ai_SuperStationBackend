export type PromptPolishScene = "social_post" | "product_image";

export const MAX_REFERENCE_IMAGE_COUNT = 3;
export const REFERENCE_IMAGE_REQUEST_LIMIT_MB = 20;

type PromptPolishInvoker = (input: {
  prompt: string;
  scene: PromptPolishScene;
}) => Promise<{ prompt: string }>;

type RequestPromptPolishInput = {
  prompt: string;
  scene: PromptPolishScene;
  hasTextModel: boolean;
  invoke: PromptPolishInvoker;
};

type PromptPolishResult =
  | { kind: "validation_error"; message: string }
  | { kind: "success"; prompt: string };

export async function requestPromptPolish(
  input: RequestPromptPolishInput,
): Promise<PromptPolishResult> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    return {
      kind: "validation_error",
      message: "请先输入提示词",
    };
  }

  if (!input.hasTextModel) {
    return {
      kind: "validation_error",
      message: "文字模型未配置，暂时无法润色",
    };
  }

  const payload = await input.invoke({
    prompt,
    scene: input.scene,
  });

  return {
    kind: "success",
    prompt: payload.prompt,
  };
}

export function filterSupportedReferenceImages(files: File[]) {
  return files.filter((file) => file.type.startsWith("image/"));
}
