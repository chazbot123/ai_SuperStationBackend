import { describe, expect, it } from "vitest";
import { buildMaterialReviewItem, filterMaterialReviewItems } from "@/pages/reviewCenter/reviewCenterModels";
import type { ContentItem } from "@/store/appStore";

function createContent(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "content_1",
    type: "copy",
    title: "春季素材单",
    body: "封面文案 #露营 #装备",
    platformStyle: "xiaohongshu",
    images: ["https://example.com/a.png"],
    createdAt: "2026-04-29T07:00:00.000Z",
    syncedToLeads: false,
    reviewStatus: "submitted",
    rejectReason: null,
    ...overrides,
  };
}

describe("buildMaterialReviewItem", () => {
  it("maps an image-and-copy submission to the image-text type", () => {
    const result = buildMaterialReviewItem(
      createContent({
        submittedByName: "张三",
        submittedAt: "2026-04-29T08:00:00.000Z",
      })
    );

    expect(result.materialTypeKey).toBe("image_text");
    expect(result.materialTypeLabel).toBe("图文");
    expect(result.status).toBe("pending");
    expect(result.tags).toEqual(["露营", "装备"]);
  });

  it("maps a video submission to the video type", () => {
    const result = buildMaterialReviewItem(
      createContent({
        id: "content_2",
        type: "video",
        images: [],
        videoUrl: "https://example.com/video.mp4",
      })
    );

    expect(result.materialTypeKey).toBe("video");
    expect(result.materialTypeLabel).toBe("视频");
  });
});

describe("filterMaterialReviewItems", () => {
  it("filters items by status, type, and keyword", () => {
    const items = [
      buildMaterialReviewItem(createContent()),
      buildMaterialReviewItem(
        createContent({
          id: "content_3",
          title: "夏季视频素材",
          body: "短视频脚本 #清凉",
          images: [],
          videoUrl: "https://example.com/video-2.mp4",
          reviewStatus: "approved",
        })
      ),
    ];

    const filtered = filterMaterialReviewItems(items, {
      status: "approved",
      materialType: "video",
      keyword: "夏季",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("content_3");
  });
});
