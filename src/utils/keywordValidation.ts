import type { KeywordRule } from "@/types/demo";

export type KeywordValidationError = {
  code:
    | "empty"
    | "count_min"
    | "count_max"
    | "len_min"
    | "len_max"
    | "duplicate"
    | "sensitive";
  message: string;
};

const SENSITIVE_WORDS = ["赌博", "色情", "违禁"]; 

export function normalizeKeyword(input: string) {
  return input.trim().replace(/\s+/g, " ");
}

export function validateKeywordsAgainstRule(rawKeywords: string[], rule: KeywordRule) {
  const keywords = rawKeywords.map(normalizeKeyword).filter(Boolean);
  const errors: KeywordValidationError[] = [];

  if (keywords.length === 0) {
    errors.push({ code: "empty", message: "请至少输入 1 个关键词" });
    return { keywords, errors };
  }

  if (rule.minCount != null && keywords.length < rule.minCount) {
    errors.push({
      code: "count_min",
      message: `关键词数量不足：至少 ${rule.minCount} 个`,
    });
  }

  if (rule.maxCount != null && keywords.length > rule.maxCount) {
    errors.push({
      code: "count_max",
      message: `关键词数量过多：最多 ${rule.maxCount} 个`,
    });
  }

  for (const k of keywords) {
    if (rule.minLen != null && k.length < rule.minLen) {
      errors.push({
        code: "len_min",
        message: `关键词“${k}”长度不足：至少 ${rule.minLen} 字符`,
      });
    }
    if (rule.maxLen != null && k.length > rule.maxLen) {
      errors.push({
        code: "len_max",
        message: `关键词“${k}”长度过长：最多 ${rule.maxLen} 字符`,
      });
    }
  }

  if (rule.dedupeRequired) {
    const seen = new Set<string>();
    for (const k of keywords) {
      const key = k.toLowerCase();
      if (seen.has(key)) {
        errors.push({ code: "duplicate", message: `存在重复关键词：${k}` });
        break;
      }
      seen.add(key);
    }
  }

  if (rule.sensitiveFilterEnabled) {
    for (const k of keywords) {
      const hit = SENSITIVE_WORDS.find((w) => k.includes(w));
      if (hit) {
        errors.push({
          code: "sensitive",
          message: `关键词“${k}”包含敏感词：${hit}`,
        });
        break;
      }
    }
  }

  return { keywords, errors };
}

