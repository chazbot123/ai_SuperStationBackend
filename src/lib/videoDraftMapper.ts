import type { VideoDraftRecord } from "@/lib/ai";
import type { VideoDraftItem } from "@/store/videoDraftStore";

export function toVideoDraftItem(record: VideoDraftRecord): VideoDraftItem {
  return {
    id: record.id,
    prompt: record.prompt,
    source: record.source,
    title: record.title,
    platformStyle: (record.platformStyle as VideoDraftItem["platformStyle"]) ?? undefined,
    publishTitle: record.publishTitle ?? undefined,
    publishTags: record.publishTags ?? [],
    createdAt: record.createdAt,
    completedAt: record.completedAt ?? undefined,
    durationText: record.durationText,
    generatedScript: record.generatedScript,
    videoUrl: record.videoUrl ?? "",
    taskId: record.taskId ?? undefined,
    provider: record.provider ?? undefined,
    model: record.model ?? undefined,
    errorMessage: record.errorMessage ?? undefined,
    reviewStage: record.reviewStage,
    status: record.status,
    syncedToLeads: record.syncedToLeads,
  };
}
