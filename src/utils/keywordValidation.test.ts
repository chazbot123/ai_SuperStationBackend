import { describe, expect, it } from "vitest";
import type { KeywordRule } from "@/types/demo";
import { validateKeywordsAgainstRule } from "@/utils/keywordValidation";

const rule: KeywordRule = {
  id: "r1",
  name: "测试规则",
  minCount: 2,
  maxCount: 3,
  minLen: 2,
  maxLen: 6,
  dedupeRequired: true,
  sensitiveFilterEnabled: true,
  submitRateLimitPerDay: null,
  createdAt: new Date().toISOString(),
};

describe("validateKeywordsAgainstRule", () => {
  it("rejects empty", () => {
    const res = validateKeywordsAgainstRule(["  ", "\n"], rule);
    expect(res.errors[0]?.code).toBe("empty");
  });

  it("enforces min/max count", () => {
    expect(validateKeywordsAgainstRule(["a"], rule).errors.some((e) => e.code === "count_min")).toBe(true);
    expect(validateKeywordsAgainstRule(["aa", "bb", "cc", "dd"], rule).errors.some((e) => e.code === "count_max")).toBe(true);
  });

  it("enforces length and dedupe", () => {
    const res = validateKeywordsAgainstRule(["a", "aa", "AA"], rule);
    expect(res.errors.some((e) => e.code === "len_min")).toBe(true);
    expect(res.errors.some((e) => e.code === "duplicate")).toBe(true);
  });

  it("blocks sensitive words", () => {
    const res = validateKeywordsAgainstRule(["AI建站", "赌博平台"], rule);
    expect(res.errors.some((e) => e.code === "sensitive")).toBe(true);
  });
});

