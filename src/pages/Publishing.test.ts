import { describe, expect, it } from "vitest";
import { publishPlatformOptions } from "@/pages/Publishing";

describe("publishing platform options", () => {
  it("enables xiaohongshu in the publish modal", () => {
    const xiaohongshu = publishPlatformOptions.find((item) => item.key === "xiaohongshu");

    expect(xiaohongshu).toMatchObject({
      key: "xiaohongshu",
      enabled: true,
    });
  });

  it("includes xiaohongshu in the enabled publish platforms", () => {
    const enabledPlatforms = publishPlatformOptions.filter((item) => item.enabled).map((item) => item.key);

    expect(enabledPlatforms).toContain("xiaohongshu");
  });
});
