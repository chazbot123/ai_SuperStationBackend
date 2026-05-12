import { describe, expect, it, vi } from "vitest";
import { filterSupportedReferenceImages, requestPromptPolish } from "@/pages/generationWorkbench";

describe("requestPromptPolish", () => {
  it("blocks polish when prompt is blank", async () => {
    const invoke = vi.fn();

    const result = await requestPromptPolish({
      prompt: "   ",
      scene: "social_post",
      hasTextModel: true,
      invoke,
    });

    expect(result).toEqual({
      kind: "validation_error",
      message: "请先输入提示词",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("blocks polish when text model is unavailable", async () => {
    const invoke = vi.fn();

    const result = await requestPromptPolish({
      prompt: "raw prompt",
      scene: "product_image",
      hasTextModel: false,
      invoke,
    });

    expect(result).toEqual({
      kind: "validation_error",
      message: "文字模型未配置，暂时无法润色",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("returns polished text when api succeeds", async () => {
    const invoke = vi.fn().mockResolvedValue({ prompt: "polished prompt" });

    const result = await requestPromptPolish({
      prompt: "raw prompt",
      scene: "product_image",
      hasTextModel: true,
      invoke,
    });

    expect(result).toEqual({
      kind: "success",
      prompt: "polished prompt",
    });
    expect(invoke).toHaveBeenCalledWith({
      prompt: "raw prompt",
      scene: "product_image",
    });
  });

  it("keeps only image uploads for reference assets", () => {
    const imageFile = new File(["a"], "demo.png", { type: "image/png" });
    const pdfFile = new File(["b"], "demo.pdf", { type: "application/pdf" });

    const result = filterSupportedReferenceImages([imageFile, pdfFile]);

    expect(result).toEqual([imageFile]);
  });
});
