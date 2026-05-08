import { formatMessage, messages, type MessageKey } from "@/i18n/messages";
import { useI18nStore } from "@/store/i18nStore";

export function useT() {
  const lang = useI18nStore((s) => s.lang);
  return (key: MessageKey, vars?: Record<string, string | number>) => {
    const msg = messages[key]?.[lang] ?? key;
    return formatMessage(msg, vars);
  };
}

