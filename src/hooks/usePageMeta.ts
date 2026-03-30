import { useEffect } from "react";
import { useT } from "@/i18n/useT";

export function usePageMeta(title: string) {
  const t = useT();
  useEffect(() => {
    document.title = `${t("app.name")} - ${title}`;
  }, [t, title]);
}
