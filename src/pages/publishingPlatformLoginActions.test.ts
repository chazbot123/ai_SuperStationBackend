import { describe, expect, it, vi } from "vitest";
import type { PlatformAccountItem } from "@/lib/publishing";
import { checkPendingPlatformAccountLogin, openPlatformAccountSession } from "@/pages/publishingPlatformLoginActions";

function createAccount(overrides: Partial<PlatformAccountItem> = {}): PlatformAccountItem {
  return {
    id: "acct_1",
    creatorId: "u1",
    creatorName: "demo",
    platform: "douyin",
    provider: "extension",
    authType: "cookie",
    accountName: "demo_account",
    displayName: "Demo Account",
    authPayloadPreview: "demo***",
    loginStatus: "authenticated",
    loginUrl: "https://creator.douyin.com/creator-micro/content/publish",
    externalAccountId: null,
    externalGroupId: null,
    loginSourceLabel: "本地扩展",
    status: "valid",
    remark: null,
    lastLoginStartedAt: null,
    lastLoginCompletedAt: null,
    lastValidatedAt: null,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("openPlatformAccountSession", () => {
  it("reopens the account-specific hosted browser session", async () => {
    const account = createAccount();
    const reopen = vi.fn().mockResolvedValue({
      ...account,
      loginStatus: "pending",
    });

    const result = await openPlatformAccountSession({
      accessToken: "token",
      account,
      reopen,
    });

    expect(reopen).toHaveBeenCalledWith({
      accessToken: "token",
      id: "acct_1",
    });
    expect(result).toEqual({
      kind: "success",
      account: expect.objectContaining({ id: "acct_1", loginStatus: "pending" }),
      message: "宸叉墦寮€璇ヨ处鍙峰搴旂殑娴忚鍣ㄧ櫥褰曚細璇濄€?",
    });
  });

  it("blocks when login has expired", async () => {
    const reopen = vi.fn();

    const result = await openPlatformAccountSession({
      accessToken: "",
      account: createAccount(),
      reopen,
    });

    expect(reopen).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: "error",
      message: "鐧诲綍宸插け鏁堬紝璇烽噸鏂扮櫥褰曘€?",
    });
  });
});

describe("checkPendingPlatformAccountLogin", () => {
  it("checks one pending account at a time", async () => {
    const account = createAccount({ loginStatus: "pending" });
    const check = vi.fn().mockResolvedValue({
      ...account,
      loginStatus: "authenticated",
    });

    const result = await checkPendingPlatformAccountLogin({
      accessToken: "token",
      account,
      check,
    });

    expect(check).toHaveBeenCalledWith({
      accessToken: "token",
      id: "acct_1",
    });
    expect(result).toEqual({
      kind: "success",
      account: expect.objectContaining({ id: "acct_1", loginStatus: "authenticated" }),
    });
  });
});
