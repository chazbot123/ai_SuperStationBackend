import { describe, expect, it } from "vitest";
import { resolveReviewTabFromPath } from "@/pages/Reviews";

describe("resolveReviewTabFromPath", () => {
  it("defaults to materials for the review center root path", () => {
    expect(resolveReviewTabFromPath("/reviews")).toBe("materials");
  });

  it("uses the products tab for the product review route", () => {
    expect(resolveReviewTabFromPath("/reviews/products")).toBe("products");
  });
});
