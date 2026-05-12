const activeLoginSessions = new Map();
const activePublishSessions = new Map();

const platformCookieDomains = {
  xiaohongshu: ["creator.xiaohongshu.com", ".xiaohongshu.com"],
  douyin: ["creator.douyin.com", ".douyin.com"],
  wechat_mp: ["channels.weixin.qq.com", ".weixin.qq.com", ".qq.com"],
  kuaishou: ["cp.kuaishou.com", "passport.kuaishou.com", ".kuaishou.com"],
};

function sendResponseSafe(sendResponse, payload) {
  try {
    sendResponse(payload);
  } catch (_) {
    // Ignore closed message channels.
  }
}

function notifyApp(session, message) {
  if (!session || typeof session.appTabId !== "number") {
    return;
  }

  chrome.tabs.sendMessage(session.appTabId, message, () => {
    void chrome.runtime.lastError;
  });
}

function notifyPublishError(session, message) {
  notifyApp(session, {
    source: "ai-superweb-extension",
    type: "AI_SUPERWEB_EXTENSION_PUBLISH_ERROR",
    payload: {
      sessionId: session?.job?.id || "",
      platform: session?.platform,
      message,
    },
  });
}

async function getCookiesByDomain(domain) {
  const cookies = await chrome.cookies.getAll({ domain });
  return cookies ?? [];
}

async function collectPlatformCookies(platform) {
  const domains = platformCookieDomains[platform] ?? [];
  const cookieMap = new Map();

  for (const domain of domains) {
    const cookies = await getCookiesByDomain(domain);
    for (const cookie of cookies) {
      const key = `${cookie.domain}|${cookie.path}|${cookie.name}`;
      if (!cookieMap.has(key)) {
        cookieMap.set(key, cookie);
      }
    }
  }

  return Array.from(cookieMap.values())
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

async function syncLoginResult(session, context) {
  if (!session || session.syncing || session.status === "completed") {
    return;
  }

  session.syncing = true;
  try {
    const authPayload = await collectPlatformCookies(session.platform);
    if (!authPayload || authPayload.length < 20) {
      throw new Error("当前页面还没有可用的登录 Cookie，请先完成平台登录。");
    }

    const accountName = String(context?.accountName || "").trim();
    const displayName = String(context?.displayName || "").trim();
    const hasResolvedProfile = Boolean(accountName || displayName);
    if (!hasResolvedProfile) {
      return;
    }

    const response = await fetch(`${session.apiBaseUrl}/api/publishing/platform-accounts/extension-login/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionToken: session.sessionToken,
        authType: "cookie",
        authPayload,
        accountName,
        displayName,
        sourceUrl: context?.url || "",
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message || "扩展回传登录信息失败");
    }

    session.status = "completed";
    notifyApp(session, {
      source: "ai-superweb-extension",
      type: "AI_SUPERWEB_EXTENSION_LOGIN_SYNCED",
      payload: {
        sessionId: session.sessionId,
        platform: session.platform,
        account: payload?.account,
      },
    });
  } catch (error) {
    notifyApp(session, {
      source: "ai-superweb-extension",
      type: "AI_SUPERWEB_EXTENSION_LOGIN_ERROR",
      payload: {
        sessionId: session.sessionId,
        platform: session.platform,
        message: error instanceof Error ? error.message : "扩展自动同步失败",
      },
    });
  } finally {
    session.syncing = false;
  }
}

function getActiveSessionByPlatform(platform) {
  for (const session of activeLoginSessions.values()) {
    if (session.platform === platform && session.status !== "completed") {
      return session;
    }
  }
  return null;
}

function scheduleSync(platform, context) {
  const session = getActiveSessionByPlatform(platform);
  if (!session) {
    return;
  }

  void syncLoginResult(session, context);
  setTimeout(() => {
    void syncLoginResult(session, context);
  }, 2500);
  setTimeout(() => {
    void syncLoginResult(session, context);
  }, 6500);
  setTimeout(() => {
    void syncLoginResult(session, context);
  }, 12000);
}

function getPlatformPublishUrl(platform, job) {
  const hasVideo = Boolean(job?.draftVideoUrl);
  if (platform === "xiaohongshu") {
    return hasVideo
      ? "https://creator.xiaohongshu.com/publish/publish?from=homepage&target=video&openFilePicker=true"
      : "https://creator.xiaohongshu.com/publish/publish?from=homepage&target=image&openFilePicker=true";
  }
  if (platform === "douyin") {
    return hasVideo
      ? "https://creator.douyin.com/creator-micro/content/upload"
      : "https://creator.douyin.com/creator-micro/content/publish";
  }
  if (platform === "wechat_mp") {
    return hasVideo
      ? "https://channels.weixin.qq.com/platform/post/create"
      : "https://channels.weixin.qq.com/platform/post/finderNewLifeCreate";
  }
  if (platform === "kuaishou") {
    return hasVideo
      ? "https://cp.kuaishou.com/article/publish/video"
      : "https://cp.kuaishou.com/article/publish/video?tabType=2";
  }
  return "https://www.google.com/";
}

function getPublishSessionByTabId(tabId) {
  for (const session of activePublishSessions.values()) {
    if (session.tabId === tabId) {
      return session;
    }
  }
  return null;
}

async function syncPublishResult(session, payload) {
  if (!session || !payload?.status) {
    return;
  }

  try {
    let authPayload = undefined;
    if (payload.status === "success") {
      authPayload = await collectPlatformCookies(session.platform);
    }

    const response = await fetch(`${session.apiBaseUrl}/api/publishing/extension/publish-jobs/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionToken: session.sessionToken,
        status: payload.status,
        draftUrl: payload.draftUrl || "",
        lastError: payload.lastError || "",
        authPayload,
        accountName: payload.accountName || "",
        displayName: payload.displayName || "",
        sourceUrl: payload.sourceUrl || "",
      }),
    });

    const nextJob = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(nextJob?.message || "扩展回传发布状态失败");
    }

    if (payload.status === "success" || payload.status === "failed") {
      session.status = payload.status;
    }

    notifyApp(session, {
      source: "ai-superweb-extension",
      type: "AI_SUPERWEB_EXTENSION_PUBLISH_SYNCED",
      payload: {
        sessionId: session.job.id,
        platform: session.platform,
        job: nextJob,
      },
    });
  } catch (error) {
    notifyPublishError(session, error instanceof Error ? error.message : "扩展本地发布失败");
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "AI_SUPERWEB_FROM_PAGE") {
    const payload = message.payload;
    if (payload?.action === "PING") {
      sendResponseSafe(sendResponse, { ok: true, version: "0.1.0" });
      return true;
    }

    if (payload?.action === "START_LOGIN") {
      const session = {
        sessionId: payload.session.sessionId,
        sessionToken: payload.session.sessionToken,
        platform: payload.platform,
        apiBaseUrl: payload.apiBaseUrl,
        appTabId: sender.tab?.id,
        status: "pending",
        syncing: false,
      };
      activeLoginSessions.set(session.sessionId, session);
      sendResponseSafe(sendResponse, { ok: true });
      return true;
    }

    if (payload?.action === "START_PUBLISH") {
      void (async () => {
        try {
          const targetUrl = getPlatformPublishUrl(payload.platform, payload.session.job);
          const tab = await chrome.tabs.create({
            url: targetUrl,
            active: true,
          });
          activePublishSessions.set(payload.session.job.id, {
            sessionToken: payload.session.sessionToken,
            platform: payload.platform,
            apiBaseUrl: payload.apiBaseUrl,
            appTabId: sender.tab?.id,
            tabId: tab.id,
            job: payload.session.job,
            status: "pending",
            executionRequested: false,
          });
          sendResponseSafe(sendResponse, { ok: true });
        } catch (error) {
          sendResponseSafe(sendResponse, {
            ok: false,
            message: error instanceof Error ? error.message : "扩展本地发布启动失败",
          });
        }
      })();
      return true;
    }
  }

  if (message?.type === "AI_SUPERWEB_PLATFORM_PAGE_READY" && message.payload?.platform) {
    scheduleSync(message.payload.platform, message.payload);

    const publishSession = sender.tab?.id ? getPublishSessionByTabId(sender.tab.id) : null;
    if (
      publishSession &&
      publishSession.platform === message.payload.platform &&
      !publishSession.executionRequested
    ) {
      publishSession.executionRequested = true;
      chrome.tabs.sendMessage(
        sender.tab.id,
        {
          source: "ai-superweb-extension",
          type: "AI_SUPERWEB_EXTENSION_EXECUTE_PUBLISH",
          payload: {
            session: {
              sessionToken: publishSession.sessionToken,
              job: publishSession.job,
            },
          },
        },
        () => {
          if (chrome.runtime.lastError) {
            publishSession.executionRequested = false;
            notifyPublishError(publishSession, "扩展未能注入本地发布脚本");
          }
        },
      );
    }

    sendResponseSafe(sendResponse, { ok: true });
    return true;
  }

  if (message?.type === "AI_SUPERWEB_EXTENSION_PUBLISH_STATUS" && message.payload?.sessionToken) {
    const publishSession = Array.from(activePublishSessions.values()).find(
      (item) => item.sessionToken === message.payload.sessionToken,
    );
    if (publishSession) {
      void syncPublishResult(publishSession, message.payload);
    }
    sendResponseSafe(sendResponse, { ok: true });
    return true;
  }

  return false;
});
