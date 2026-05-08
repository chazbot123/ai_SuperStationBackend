import { describe, expect, it } from "vitest";
import { defaultPublishPlatforms, publishPlatformOptions } from "@/pages/Publishing";

describe("publishing platform options", () => {
  it("enables xiaohongshu in the publish modal", () => {
    const xiaohongshu = publishPlatformOptions.find((item) => item.key === "xiaohongshu");

    expect(xiaohongshu).toMatchObject({
      key: "xiaohongshu",
      enabled: true,
    });
  });

  it("includes xiaohongshu in the default selected publish platforms", () => {
    expect(defaultPublishPlatforms).toContain("xiaohongshu");
  });
});
