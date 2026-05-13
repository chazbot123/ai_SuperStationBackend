(function () {
  const PAGE_SOURCE = "ai-superweb-page";
  const EXTENSION_SOURCE = "ai-superweb-extension";
  const publishExecutionState = {
    sessionToken: "",
    pageUrl: "",
    running: false,
  };

  function resolvePlatformFromHost(hostname) {
    if (hostname.includes("xiaohongshu.com")) return "xiaohongshu";
    if (hostname.includes("douyin.com")) return "douyin";
    if (hostname.includes("channels.weixin.qq.com") || hostname.includes("weixin.qq.com")) return "wechat_mp";
    if (hostname.includes("kuaishou.com")) return "kuaishou";
    return null;
  }

  function normalize(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getPageText() {
    const text = normalize(document.body?.innerText || document.body?.textContent || "");
    return text.length > 20000 ? text.slice(0, 20000) : text;
  }

  function findFirstText(selectors) {
    for (const selector of selectors) {
      try {
        const node = document.querySelector(selector);
        const text = normalize(node?.innerText || node?.textContent || "");
        if (text && text.length <= 120) {
          return text;
        }
      } catch (_) {
        // ignore invalid selector
      }
    }
    return "";
  }

  function extractByRegex(text, regex) {
    const match = text.match(regex);
    return match?.[1]?.trim() || "";
  }

  function looksLikePlatformLabel(value, platform) {
    const normalized = normalize(value).toLowerCase();
    const labels = {
      xiaohongshu: ["小红书", "xiaohongshu", "创作服务平台"],
      douyin: ["抖音", "douyin", "创作者平台"],
      wechat_mp: ["视频号", "视频号助手", "channels", "wechat"],
      kuaishou: ["快手", "kuaishou"],
    };
    return (labels[platform] || []).some((label) => normalized.includes(String(label).toLowerCase()));
  }

  function extractNameFromTitle(title, platform) {
    const normalizedTitle = normalize(title);
    if (!normalizedTitle) {
      return null;
    }

    const separators = [" - ", "_", "|", "｜", "—", "–"];
    for (const separator of separators) {
      const parts = normalizedTitle
        .split(separator)
        .map((item) => normalize(item))
        .filter(Boolean);
      const candidate = parts.find((item) => !looksLikePlatformLabel(item, platform));
      if (candidate) {
        return candidate;
      }
    }

    return looksLikePlatformLabel(normalizedTitle, platform) ? null : normalizedTitle;
  }

  function extractProfileFromPageText(text, platform) {
    if (!text) {
      return { accountName: null, displayName: null };
    }

    const compactText = normalize(text);
    const matchers = {
      douyin: [
        {
          account: /抖音号\s*[:：]?\s*([A-Za-z0-9_-]+)/i,
          display: /([^\s]{1,40})\s+抖音号\s*[:：]?\s*[A-Za-z0-9_-]+/i,
        },
        {
          account: /([A-Za-z0-9_-]{4,})\s+获赞\s*\d+\s+关注\s*\d+\s+粉丝\s*\d+/i,
          display: /([^\s]{1,40})\s+[A-Za-z0-9_-]{4,}\s+获赞\s*\d+\s+关注\s*\d+\s+粉丝\s*\d+/i,
        },
      ],
      wechat_mp: [
        {
          account: /视频号ID\s*[:：]?\s*([A-Za-z0-9_-]+)/i,
          display: /([^\s]{1,40})\s+视频号认证/i,
        },
        {
          account:
            /([^\s]{1,40})\s+视频号认证[\s\S]{0,80}?视频号ID\s*[:：]?\s*([A-Za-z0-9_-]{4,})/i,
          display: /([^\s]{1,40})\s+视频号认证[\s\S]{0,80}?视频号ID\s*[:：]?\s*[A-Za-z0-9_-]{4,}/i,
        },
        {
          account: /视频号\s*[:：]?\s*([A-Za-z0-9_-]+)/i,
          display: /视频号名称\s*[:：]?\s*([^\s]{1,40})/i,
        },
        {
          account: /视频号ID\s*[:：]?\s*([A-Za-z0-9_-]+)[\s\S]{0,80}?被赞\s*\d+\s+关注\s*\d+/i,
          display: /([^\s]{1,40})\s+视频号认证[\s\S]{0,40}?视频号ID\s*[:：]?\s*[A-Za-z0-9_-]+/i,
        },
      ],
      xiaohongshu: [
        {
          account: /小红书(?:号|账号)\s*[:：]?\s*([A-Za-z0-9_-]+)/i,
          display: /昵称\s*[:：]?\s*([^\s]{1,40})/i,
        },
        {
          account: /([^\s]{1,40})\s+小红书(?:号|账号)\s*[:：]?\s*([A-Za-z0-9_-]{4,})/i,
          display: /([^\s]{1,40})\s+小红书(?:号|账号)\s*[:：]?\s*[A-Za-z0-9_-]{4,}/i,
        },
        {
          account: /([A-Za-z0-9_-]{4,})\s+(?:粉丝|获赞|收藏)/i,
          display: /([^\s]{1,40})\s+[A-Za-z0-9_-]{4,}\s+(?:粉丝|获赞|收藏)/i,
        },
      ],
      kuaishou: [
        {
          account: /快手号\s*[:：]?\s*([A-Za-z0-9_-]+)/i,
          display: /昵称\s*[:：]?\s*([^\s]{1,40})/i,
        },
        {
          account: /([A-Za-z0-9_-]{4,})\s+(?:获赞|关注|粉丝)/i,
          display: /([^\s]{1,40})\s+[A-Za-z0-9_-]{4,}\s+(?:获赞|关注|粉丝)/i,
        },
      ],
    };

    for (const matcher of matchers[platform] || []) {
      const accountMatch = compactText.match(matcher.account);
      const accountName = normalize(accountMatch?.[2] || accountMatch?.[1] || "");
      const displayName = matcher.display ? normalize(compactText.match(matcher.display)?.[1] || "") : "";
      if (accountName || displayName) {
        return {
          accountName: accountName || null,
          displayName:
            displayName && !looksLikePlatformLabel(displayName, platform) ? displayName : null,
        };
      }
    }

    return { accountName: null, displayName: null };
  }

  function findAncestorTextBlock(node, anchor) {
    let current = node instanceof HTMLElement ? node : node?.parentElement;
    while (current) {
      const text = normalize(current.innerText || current.textContent || "");
      if (text.includes(String(anchor)) && text.length >= 8 && text.length <= 240) {
        return text;
      }
      current = current.parentElement;
    }
    return "";
  }

  function findTextBlockByAnchors(anchors) {
    const nodes = Array.from(document.querySelectorAll("div, span, p, h2, h3"));
    for (const anchor of anchors) {
      for (const node of nodes) {
        const text = normalize(node.innerText || node.textContent || "");
        if (!text || !text.includes(anchor)) continue;
        const blockText = findAncestorTextBlock(node, anchor);
        if (blockText) return blockText;
      }
    }
    return "";
  }

  function extractProfile(platform) {
    const pageText = getPageText();
    const anchors = {
      xiaohongshu: ["小红书号", "小红书账号"],
      douyin: ["抖音号"],
      wechat_mp: ["视频号ID", "视频号 Id", "视频号"],
      kuaishou: ["快手号"],
    };
    const anchoredBlockText = findTextBlockByAnchors(anchors[platform] || []);
    const anchoredText = anchoredBlockText || pageText;

    const directDisplayName =
      findFirstText(
        {
          xiaohongshu: [
            ".account-name",
            "div.account-name",
            "div.account-name[data-v-bf295dc2]",
            "[class*='user-name']",
            "[class*='username']",
            "[class*='name']",
          ],
          douyin: [
            "div.name-_lSSDc",
            "[data-e2e*='user-name']",
            "[class*='creator-name']",
            "[class*='nickname']",
            "[class*='user-name']",
            "[class*='name']",
          ],
          wechat_mp: [
            "h2.finder-nickname",
            ".finder-nickname",
            "[class*='finder-nickname']",
            ".weui-desktop-account__info-name",
            ".finder_account_name",
            ".account_meta_primary",
            "[class*='finder'] [class*='name']",
            "[class*='account'] [class*='name']",
            "[class*='name']",
          ],
          kuaishou: [
            "div.user-info-name",
            "[class*='account-name']",
            "[class*='user-name']",
            "[class*='nickname']",
            "[class*='profile'] [class*='name']",
            "[class*='name']",
          ],
        }[platform] || [],
      ) || null;

    const profileFromAnchoredText = extractProfileFromPageText(anchoredText, platform);
    const profileFromPageText = extractProfileFromPageText(pageText, platform);
    const displayName =
      directDisplayName ||
      profileFromAnchoredText.displayName ||
      profileFromPageText.displayName ||
      extractNameFromTitle(document.title || "", platform) ||
      null;
    const accountName =
      profileFromAnchoredText.accountName ||
      profileFromPageText.accountName ||
      displayName ||
      extractNameFromTitle(document.title || "", platform) ||
      null;

    return {
      accountName,
      displayName: displayName && !looksLikePlatformLabel(displayName, platform) ? displayName : null,
    };
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) {
      return;
    }

    const data = event.data;
    if (!data || data.source !== PAGE_SOURCE || data.type !== "AI_SUPERWEB_EXTENSION_REQUEST") {
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: "AI_SUPERWEB_FROM_PAGE",
        requestId: data.requestId,
        payload: data.payload,
      },
      (response) => {
        window.postMessage(
          {
            source: EXTENSION_SOURCE,
            type: "AI_SUPERWEB_EXTENSION_RESPONSE",
            requestId: data.requestId,
            payload: response ?? {
              ok: false,
              message: chrome.runtime.lastError?.message || "扩展未返回结果",
            },
          },
          window.location.origin,
        );
      },
    );
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.source !== EXTENSION_SOURCE) {
      return;
    }

    if (message.type === "AI_SUPERWEB_EXTENSION_EXECUTE_PUBLISH" && message.payload?.session) {
      const session = message.payload.session;
      const currentUrl = window.location.href;
      if (
        publishExecutionState.running &&
        publishExecutionState.sessionToken === session.sessionToken &&
        publishExecutionState.pageUrl === currentUrl
      ) {
        return;
      }

      publishExecutionState.sessionToken = session.sessionToken;
      publishExecutionState.pageUrl = currentUrl;
      publishExecutionState.running = true;
      const sendStatus = async (payload) => {
        const profile = extractProfile(platform);
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            {
              type: "AI_SUPERWEB_EXTENSION_PUBLISH_STATUS",
              payload: {
                sessionToken: session.sessionToken,
                ...payload,
                accountName: profile.accountName,
                displayName: profile.displayName,
              },
            },
            () => resolve(undefined),
          );
        });
      };

      void globalThis.AISuperWebPublishAutomation.executePublishSession(session, sendStatus)
        .catch(async (error) => {
          await sendStatus({
            status: "failed",
            lastError: error instanceof Error ? error.message : "扩展本地发布失败",
            sourceUrl: window.location.href,
          });
        })
        .finally(() => {
          publishExecutionState.running = false;
        });
      return;
    }

    window.postMessage(message, window.location.origin);
  });

  const platform = resolvePlatformFromHost(window.location.hostname);
  if (!platform) {
    return;
  }

  const notifyPageReady = () => {
    const profile = extractProfile(platform);
    chrome.runtime.sendMessage({
      type: "AI_SUPERWEB_PLATFORM_PAGE_READY",
      payload: {
        platform,
        url: window.location.href,
        title: document.title || "",
        accountName: profile.accountName,
        displayName: profile.displayName,
      },
    });
  };

  notifyPageReady();
  window.addEventListener("load", notifyPageReady, { once: true });
  setTimeout(notifyPageReady, 2500);
  setTimeout(notifyPageReady, 6000);
})();
