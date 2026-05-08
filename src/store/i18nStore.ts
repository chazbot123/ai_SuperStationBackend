import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LangKey } from "@/i18n/messages";

type I18nState = {
  lang: LangKey;
  setLang: (lang: LangKey) => void;
  toggle: () => void;
};

export const useI18nStore = create<I18nState>()(
  persist(
    (set, get) => ({
      lang: "zh-CN",
      setLang: (lang) => set({ lang }),
      toggle: () => set({ lang: get().lang === "zh-CN" ? "en-US" : "zh-CN" }),
    }),
    { name: "aiadmin_lang_v1" }
  )
);

