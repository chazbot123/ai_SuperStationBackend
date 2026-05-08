import { describe, expect, it } from "vitest";
import { navLabels, resolveTopbarTitle } from "@/components/layout/navigationLabels";

describe("navigation labels", () => {
  it("keeps the main navigation labels in readable Chinese", () => {
    expect(navLabels.appTitle).toBe("AI 超级站后台");
    expect(navLabels.dashboard).toBe("仪表盘");
    expect(navLabels.publishing).toBe("获客内容池");
    expect(navLabels.logout).toBe("退出");
  });

  it("resolves topbar titles from known routes", () => {
    expect(resolveTopbarTitle("/")).toBe("仪表盘");
    expect(resolveTopbarTitle("/publishing")).toBe("获客内容池");
    expect(resolveTopbarTitle("/publishing/platform-login")).toBe("获客内容池");
    expect(resolveTopbarTitle("/rbac/users")).toBe("用户/角色/权限");
  });
});
