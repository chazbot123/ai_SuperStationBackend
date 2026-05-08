import type { AiReviewMaterialItem } from "@/lib/ai";
import type { ContentItem, ReviewStatus } from "@/store/appStore";

export type ReviewListStatus = "pending" | "approved" | "rejected";
export type MaterialTypeKey = "copy" | "image_text" | "video" | "mixed";
export type MaterialTypeFilter = "all" | MaterialTypeKey;

export type MaterialReviewItem = {
  id: string;
  title: string;
  body: string;
  images: string[];
  videoUrl: string | null;
  tags: string[];
  materialTypeKey: MaterialTypeKey;
  materialTypeLabel: string;
  status: ReviewListStatus;
  submittedByName: string;
  submittedAt: string;
  rejectReason: string | null;
};

export function mapMaterialStatus(status: ReviewStatus): ReviewListStatus {
  if (status === "approved") {
    return "approved";
  }

  if (status === "rejected") {
    return "rejected";
  }

  return "pending";
}

export function extractTags(text: string) {
  const matches = text.match(/#([^\s#]+)/g) ?? [];
  return matches.map((item) => item.slice(1));
}

export function buildMaterialReviewItem(content: ContentItem): MaterialReviewItem {
  const hasImages = content.images.length > 0;
  const hasVideo = Boolean(content.videoUrl);

  let materialTypeKey: MaterialTypeKey = "copy";
  let materialTypeLabel = "文案";

  if (hasImages && hasVideo) {
    materialTypeKey = "mixed";
    materialTypeLabel = "混合";
  } else if (hasVideo) {
    materialTypeKey = "video";
    materialTypeLabel = "视频";
  } else if (hasImages) {
    materialTypeKey = "image_text";
    materialTypeLabel = "图文";
  }

  return {
    id: content.id,
    title: content.title,
    body: content.body,
    images: content.images,
    videoUrl: content.videoUrl ?? null,
    tags: extractTags(content.body),
    materialTypeKey,
    materialTypeLabel,
    status: mapMaterialStatus(content.reviewStatus),
    submittedByName: content.submittedByName ?? "-",
    submittedAt: content.submittedAt ?? content.createdAt,
    rejectReason: content.rejectReason ?? null,
  };
}

export function buildAiMaterialReviewItem(item: AiReviewMaterialItem): MaterialReviewItem {
  const hasImages = item.images.length > 0;
  const hasVideo = Boolean(item.videoUrl);

  let materialTypeKey: MaterialTypeKey = "copy";
  let materialTypeLabel = "文案";

  if (hasImages && hasVideo) {
    materialTypeKey = "mixed";
    materialTypeLabel = "混合";
  } else if (hasVideo) {
    materialTypeKey = "video";
    materialTypeLabel = "视频";
  } else if (hasImages) {
    materialTypeKey = "image_text";
    materialTypeLabel = "图文";
  }

  return {
    id: `${item.source}_${item.id}`,
    title: item.title,
    body: item.body,
    images: item.images,
    videoUrl: item.videoUrl,
    tags: item.tags,
    materialTypeKey,
    materialTypeLabel,
    status: item.reviewStage === "approved" ? "approved" : "pending",
    submittedByName: item.submittedByName,
    submittedAt: item.submittedAt,
    rejectReason: null,
  };
}

export function filterMaterialReviewItems(
  items: MaterialReviewItem[],
  filters: {
    status: "all" | ReviewListStatus;
    materialType: MaterialTypeFilter;
    keyword: string;
  }
) {
  const keyword = filters.keyword.trim().toLowerCase();

  return items.filter((item) => {
    if (filters.status !== "all" && item.status !== filters.status) {
      return false;
    }

    if (filters.materialType !== "all" && item.materialTypeKey !== filters.materialType) {
      return false;
    }

    if (!keyword) {
      return true;
    }

    const haystack = [item.title, item.body, item.tags.join(" ")].join(" ").toLowerCase();
    return haystack.includes(keyword);
  });
}
