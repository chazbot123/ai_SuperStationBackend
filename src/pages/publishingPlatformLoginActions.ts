import type { PlatformAccountItem } from "@/lib/publishing";
import { checkHostedPlatformLogin, restartHostedPlatformLogin } from "@/lib/publishing";

type OpenPlatformAccountSessionResult =
  | {
      kind: "success";
      account: PlatformAccountItem;
      message: string;
    }
  | {
      kind: "error";
      message: string;
    };

export async function openPlatformAccountSession(input: {
  accessToken: string | null;
  account: PlatformAccountItem;
  reopen?: typeof restartHostedPlatformLogin;
}): Promise<OpenPlatformAccountSessionResult> {
  if (!input.accessToken) {
    return {
      kind: "error",
      message: "鐧诲綍宸插け鏁堬紝璇烽噸鏂扮櫥褰曘€?",
    };
  }

  try {
    const reopen = input.reopen ?? restartHostedPlatformLogin;
    const account = await reopen({
      accessToken: input.accessToken,
      id: input.account.id,
    });

    return {
      kind: "success",
      account,
      message: "宸叉墦寮€璇ヨ处鍙峰搴旂殑娴忚鍣ㄧ櫥褰曚細璇濄€?",
    };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "鎵撳紑璐﹀彿鐧诲綍浼氳瘽澶辫触",
    };
  }
}

export async function checkPendingPlatformAccountLogin(input: {
  accessToken: string | null;
  account: PlatformAccountItem;
  check?: typeof checkHostedPlatformLogin;
}): Promise<
  | {
      kind: "success";
      account: PlatformAccountItem;
    }
  | {
      kind: "error";
      message: string;
    }
> {
  if (!input.accessToken) {
    return {
      kind: "error",
      message: "鐧诲綍宸插け鏁堬紝璇烽噸鏂扮櫥褰曘€?",
    };
  }

  try {
    const check = input.check ?? checkHostedPlatformLogin;
    const account = await check({
      accessToken: input.accessToken,
      id: input.account.id,
    });

    return {
      kind: "success",
      account,
    };
  } catch (error) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "妫€鏌ョ櫥褰曠姸鎬佸け璐?",
    };
  }
}
