import { create } from "zustand";

export type StudioDraftTaskSource = "social" | "product";
export type StudioDraftTaskStage = "queued" | "copy" | "images" | "saving" | "failed";

export type StudioDraftTaskItem = {
  id: string;
  source: StudioDraftTaskSource;
  title: string;
  createdAt: string;
  progress: number;
  label: string;
  stage: StudioDraftTaskStage;
  errorMessage?: string;
};

type StudioDraftTaskState = {
  tasks: StudioDraftTaskItem[];
  upsertTask: (task: StudioDraftTaskItem) => void;
  removeTask: (id: string) => void;
};

export const useStudioDraftTaskStore = create<StudioDraftTaskState>((set) => ({
  tasks: [],
  upsertTask: (task) =>
    set((state) => ({
      tasks: [task, ...state.tasks.filter((item) => item.id !== task.id)],
    })),
  removeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((item) => item.id !== id),
    })),
}));
