(function () {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function normalize(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function inferFileName(url, fallbackName) {
    try {
      const pathname = new URL(url).pathname;
      const raw = pathname.split("/").pop() || fallbackName;
      return raw.includes(".") ? raw : fallbackName;
    } catch (_) {
      return fallbackName;
    }
  }

  async function fetchFile(url, index, kind) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`素材下载失败：${response.status}`);
    }
    const blob = await response.blob();
    const extension = kind === "video" ? "mp4" : "png";
    const fileName = inferFileName(url, `${kind}-${index + 1}.${extension}`);
    return new File([blob], fileName, {
      type: blob.type || (kind === "video" ? "video/mp4" : "image/png"),
    });
  }

  function matchesVisibility(node) {
    if (!(node instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findByText(text, root = document, baseSelector = "*") {
    const nodes = Array.from(root.querySelectorAll(baseSelector));
    return nodes.find((node) => normalize(node.textContent || "").includes(text)) || null;
  }

  function collectSearchRoots(root = document, results = [], visited = new Set()) {
    if (!root || visited.has(root)) {
      return results;
    }
    visited.add(root);
    results.push(root);

    const frameElements = Array.from(root.querySelectorAll("iframe"));
    for (const frame of frameElements) {
      try {
        const frameDocument = frame.contentDocument;
        if (frameDocument) {
          collectSearchRoots(frameDocument, results, visited);
        }
      } catch (_) {
        // ignore cross-origin iframe
      }
    }

    return results;
  }

  function queryFirst(selectors, root = document, visibleOnly = true) {
    const searchRoots = collectSearchRoots(root);
    for (const selector of selectors) {
      for (const currentRoot of searchRoots) {
        try {
          let matched = null;
          if (selector.startsWith("text=")) {
            matched = findByText(normalize(selector.slice(5)), currentRoot);
          } else {
            const hasTextMatch = selector.match(/^(.*):has-text\("(.+)"\)$/);
            if (hasTextMatch) {
              const baseSelector = hasTextMatch[1]?.trim() || "*";
              const text = normalize(hasTextMatch[2]);
              matched = findByText(text, currentRoot, baseSelector);
            } else {
              const nodes = Array.from(currentRoot.querySelectorAll(selector));
              matched = nodes.find((node) => (visibleOnly ? matchesVisibility(node) : true)) || null;
            }
          }

          if (matched && (!visibleOnly || matchesVisibility(matched))) {
            return matched;
          }
        } catch (_) {
          // ignore invalid selector
        }
      }
    }
    return null;
  }

  async function waitForVisible(selectors, timeoutMs = 30000, root = document, visibleOnly = true) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const node = queryFirst(selectors, root, visibleOnly);
      if (node) {
        return node;
      }
      await sleep(400);
    }
    throw new Error(`未找到目标元素：${selectors[0] || "unknown"}`);
  }

  async function clickFirst(selectors, timeoutMs = 30000, root = document) {
    const node = await waitForVisible(selectors, timeoutMs, root, true);
    if (node instanceof HTMLElement) {
      node.scrollIntoView({ block: "center", inline: "center" });
      node.click();
      return node;
    }
    throw new Error("目标元素不可点击");
  }

  function dispatchInputEvents(node) {
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
    node.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  async function fillFirst(selectors, value, timeoutMs = 30000, root = document) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return null;
    }

    const node = await waitForVisible(selectors, timeoutMs, root, true);
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      node.focus();
      node.value = normalized;
      dispatchInputEvents(node);
      return node;
    }

    if (node instanceof HTMLElement) {
      node.focus();
      node.textContent = normalized;
      dispatchInputEvents(node);
      return node;
    }

    return null;
  }

  async function appendText(selectors, value, timeoutMs = 30000, root = document) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return null;
    }

    const node = await waitForVisible(selectors, timeoutMs, root, true);
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
      node.focus();
      node.value = `${node.value || ""}${normalized}`;
      dispatchInputEvents(node);
      return node;
    }

    if (node instanceof HTMLElement) {
      node.focus();
      const nextValue = `${node.textContent || ""}${normalized}`;
      node.textContent = nextValue;
      dispatchInputEvents(node);
      return node;
    }

    return null;
  }

  async function uploadFiles(selectors, urls, kind, root = document) {
    if (!Array.isArray(urls) || urls.length === 0) {
      return;
    }
    const input = await waitForVisible(selectors, 30000, root, false);
    if (!(input instanceof HTMLInputElement) || input.type !== "file") {
      throw new Error("未找到可上传文件输入框");
    }

    const files = [];
    for (let index = 0; index < urls.length; index += 1) {
      files.push(await fetchFile(urls[index], index, kind));
    }

    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    input.files = transfer.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function waitForHints(successHints, failureHints, timeoutErrorMessage, timeoutMs = 120000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const pageText = normalize(document.body?.innerText || document.body?.textContent || "");
      if (failureHints.some((hint) => pageText.includes(hint))) {
        throw new Error(failureHints.find((hint) => pageText.includes(hint)) || "发布失败");
      }
      if (successHints.some((hint) => pageText.includes(hint))) {
        return;
      }
      await sleep(1200);
    }
    throw new Error(timeoutErrorMessage);
  }

  async function gotoUrl(url) {
    if (window.location.href.startsWith(url)) {
      return;
    }
    window.location.assign(url);
    await sleep(2500);
  }

  async function ensureKuaishouImagePublishReady() {
    await sleep(1500);

    if (!window.location.href.includes("tabType=2")) {
      try {
        await clickFirst(
          [
            '[role="tab"]:has-text("上传图文")',
            'button:has-text("上传图文")',
            'div:has-text("上传图文")',
            'text=上传图文',
            '[role="tab"]:has-text("图文")',
            'button:has-text("图文")',
            'text=图文',
          ],
          6000,
        );
        await sleep(1200);
      } catch (_) {
        // ignore and fallback to direct navigation
      }
    }

    if (!window.location.href.includes("tabType=2")) {
      await gotoUrl("https://cp.kuaishou.com/article/publish/video?tabType=2");
      await sleep(1500);
    }

    await clickFirst(
      [
        '[role="tab"]:has-text("上传图文")',
        'button:has-text("上传图文")',
        'div:has-text("上传图文")',
        'text=上传图文',
        '[role="tab"]:has-text("图文")',
        'button:has-text("图文")',
        'text=图文',
      ],
      8000,
    ).catch(() => null);

    await sleep(800);
  }

  async function ensureXiaohongshuPublishReady(isVideo) {
    await sleep(1200);
    await clickFirst(
      [
        'button:has-text("发布笔记")',
        'div:has-text("发布笔记")',
        'text=发布笔记',
        'button:has-text("去发布")',
        'div:has-text("去发布")',
        'text=去发布',
        'button:has-text("创建笔记")',
        'div:has-text("创建笔记")',
        'text=创建笔记',
      ],
      5000,
    ).catch(() => null);
    await sleep(1200);

    if (!isVideo) {
      await clickFirst(
        [
          'button:has-text("上传图文")',
          '[role="button"]:has-text("上传图文")',
          'div:has-text("上传图文")',
          'text=上传图文',
          'button:has-text("图文")',
          'text=图文',
        ],
        5000,
      ).catch(() => null);
      await sleep(600);
    }
  }

  async function ensureDouyinPublishReady(isVideo) {
    await sleep(1200);
    if (!isVideo) {
      await clickFirst(
        [
          'button:has-text("高清发布")',
          'div:has-text("高清发布")',
          'text=高清发布',
        ],
        3000,
      ).catch(() => null);
      await sleep(1000);

      await clickFirst(
        [
          'button:has-text("发布图文")',
          '[role="tab"]:has-text("发布图文")',
          'div:has-text("发布图文")',
          'text=发布图文',
          'button:has-text("图文")',
          'text=图文',
        ],
        6000,
      ).catch(() => null);
      await sleep(1200);

      await clickFirst(
        [
          'button:has-text("上传图文")',
          '[role="button"]:has-text("上传图文")',
          'div:has-text("上传图文")',
          'text=上传图文',
        ],
        5000,
      ).catch(() => null);
      await sleep(500);
      return;
    }

    await clickFirst(
      [
        'button:has-text("发布视频")',
        '[role="tab"]:has-text("发布视频")',
        'div:has-text("发布视频")',
        'text=发布视频',
        'button:has-text("上传视频")',
        'text=上传视频',
      ],
      5000,
    ).catch(() => null);
    await sleep(600);
  }

  async function ensureWechatMpPublishReady(isVideo) {
    await sleep(1200);
    if (!isVideo) {
      await clickFirst(
        [
          'button:has-text("发表图文")',
          'div:has-text("发表图文")',
          'text=发表图文',
          'button:has-text("图片和文字")',
          'div:has-text("图片和文字")',
          'text=图片和文字',
          'button:has-text("图文")',
          'text=图文',
        ],
        6000,
      ).catch(() => null);
      await sleep(1200);

      await clickFirst(
        [
          'button:has-text("上传图片")',
          '[role="button"]:has-text("上传图片")',
          'div:has-text("上传图片")',
          'text=上传图片',
          'div:has-text("发布图片动态")',
          'text=发布图片动态',
        ],
        5000,
      ).catch(() => null);
      await sleep(500);
      return;
    }

    await clickFirst(
      [
        'button:has-text("上传视频")',
        '[role="button"]:has-text("上传视频")',
        'div:has-text("上传视频")',
        'text=上传视频',
        'button:has-text("重新上传")',
        'text=重新上传',
      ],
      6000,
    ).catch(() => null);
    await sleep(500);
  }

  function buildTagText(tags) {
    return (tags || [])
      .map((tag) => String(tag || "").replace(/^#+/, "").trim())
      .filter(Boolean)
      .map((tag) => `#${tag}`)
      .join(" ");
  }

  async function publishXiaohongshu(job) {
    const isVideo = Boolean(job.draftVideoUrl);
    await gotoUrl(
      isVideo
        ? "https://creator.xiaohongshu.com/publish/publish?from=homepage&target=video&openFilePicker=true"
        : "https://creator.xiaohongshu.com/publish/publish?from=homepage&target=image&openFilePicker=true",
    );
    await ensureXiaohongshuPublishReady(isVideo);
    await uploadFiles(
      [
        'input[type="file"][accept*="image"]',
        'input[type="file"][accept*="video"]',
        'input[type="file"]',
      ],
      isVideo ? [job.draftVideoUrl] : job.draftImages,
      isVideo ? "video" : "image",
    );
    await sleep(2000);
    await fillFirst(
      ['input[placeholder*="标题"]', 'textarea[placeholder*="标题"]', 'input[type="text"]'],
      job.draftTitle,
    );
    await fillFirst(
      ['div.tiptap.ProseMirror', 'div[role="textbox"]', 'div[contenteditable="true"]'],
      job.draftBody,
    );
    const tagText = buildTagText(job.draftTags);
    if (tagText) {
      await appendText(['div.tiptap.ProseMirror', 'div[role="textbox"]', 'div[contenteditable="true"]'], `\n${tagText}`);
    }
    await clickFirst(['button:has-text("发布")', 'div[role="button"]:has-text("发布")', 'text=发布']);
    await waitForHints(
      ["发布成功", "笔记发布成功", "审核中", "发布中", "笔记管理"],
      ["发布失败", "请完善", "请先上传", "请填写标题"],
      "未识别到小红书发布成功状态，请确认页面是否仍停留在发布页",
    );
  }

  async function publishDouyin(job) {
    const isVideo = Boolean(job.draftVideoUrl);
    await gotoUrl(
      isVideo
        ? "https://creator.douyin.com/creator-micro/content/upload"
        : "https://creator.douyin.com/creator-micro/content/publish",
    );
    await ensureDouyinPublishReady(isVideo);
    await uploadFiles(
      ['input[type="file"][accept*="image"]', 'input[type="file"][accept*="video"]', 'input[type="file"]'],
      isVideo ? [job.draftVideoUrl] : job.draftImages,
      isVideo ? "video" : "image",
    );
    await sleep(3000);
    await fillFirst(
      ['input[placeholder*="作品标题"]', 'input[placeholder*="添加标题"]', 'textarea[placeholder*="标题"]'],
      job.draftTitle,
    ).catch(() => null);
    const bodyWithTags = [job.draftBody, buildTagText(job.draftTags)].filter(Boolean).join("\n").trim();
    await fillFirst(
      ['div[contenteditable="true"]', 'textarea[placeholder*="描述"]', 'textarea[placeholder*="文案"]'],
      bodyWithTags,
    );
    await clickFirst(['button:has-text("发布")', '[role="button"]:has-text("发布")', 'text=发布']);
    await waitForHints(
      ["发布成功", "作品发布成功", "审核中", "内容管理", "发布完成"],
      ["发布失败", "上传失败", "请完善", "请填写"],
      "未识别到抖音发布成功状态，请确认页面是否仍停留在发布页",
    );
  }

  async function publishWechatMp(job) {
    const isVideo = Boolean(job.draftVideoUrl);
    await gotoUrl(
      isVideo
        ? "https://channels.weixin.qq.com/platform/post/create"
        : "https://channels.weixin.qq.com/platform/post/finderNewLifeCreate",
    );
    await ensureWechatMpPublishReady(isVideo);
    await uploadFiles(
      ['input[type="file"][accept*="image"]', 'input[type="file"][accept*="video"]', 'input[type="file"]'],
      isVideo ? [job.draftVideoUrl] : job.draftImages,
      isVideo ? "video" : "image",
    );
    await sleep(2500);
    await fillFirst(
      ['input[placeholder*="标题"]', 'textarea[placeholder*="标题"]', 'input[type="text"]'],
      job.draftTitle,
    ).catch(() => null);
    await fillFirst(
      ['div[contenteditable="true"]', 'textarea[placeholder*="描述"]', 'textarea[placeholder*="内容"]'],
      job.draftBody,
    );
    await clickFirst(['button:has-text("发表")', '[role="button"]:has-text("发表")', 'button:has-text("发布")', 'text=发表']);
    await waitForHints(
      ["发表成功", "发布成功", "审核中", "内容管理"],
      ["发布失败", "上传失败", "请完善", "请填写"],
      "未识别到视频号发布成功状态，请确认页面是否仍停留在发布页",
    );
  }

  async function publishKuaishou(job) {
    const isVideo = Boolean(job.draftVideoUrl);
    await gotoUrl(
      isVideo
        ? "https://cp.kuaishou.com/article/publish/video"
        : "https://cp.kuaishou.com/article/publish/video?tabType=2",
    );
    if (!isVideo) {
      await ensureKuaishouImagePublishReady();
      await clickFirst(
        [
          'button:has-text("上传图文")',
          '[role="button"]:has-text("上传图文")',
          'div:has-text("上传图文")',
          'text=上传图文',
          'button[class*="upload"]',
          '[role="button"][class*="upload"]',
        ],
        8000,
      ).catch(() => null);
      await sleep(500);
    }
    await uploadFiles(
      isVideo
        ? ['input[type="file"][accept*="video"]', 'input[type="file"]']
        : [
            'input[type="file"][accept*="image/png"]',
            'input[type="file"][accept*="image/jpeg"]',
            'input[type="file"][accept*="image/webp"]',
            'input[type="file"][accept*="image/*"]',
            'input[accept*="image/png"]',
            'input[accept*="image/jpeg"]',
            'input[accept*="image/webp"]',
            'input[accept*="image/*"]',
            'input[type="file"][accept*="image"]',
            'input[type="file"]',
          ],
      isVideo ? [job.draftVideoUrl] : job.draftImages,
      isVideo ? "video" : "image",
    );
    await sleep(2500);
    if (isVideo) {
      await fillFirst(
        ['input[placeholder*="作品标题"]', 'input[placeholder*="添加标题"]', 'textarea[placeholder*="标题"]'],
        job.draftTitle,
      ).catch(() => null);
    }
    await fillFirst(
      ['div[contenteditable="true"]', 'textarea[placeholder*="描述"]', 'textarea[placeholder*="文案"]'],
      job.draftBody,
    );
    await clickFirst(['button:has-text("发布")', 'div[role="button"]:has-text("发布")', 'text=发布']);
    await waitForHints(
      ["发布成功", "作品发布成功", "发布完成", "审核中", "已发布"],
      ["发布失败", "上传失败", "请完善", "请填写内容"],
      "未识别到快手发布成功状态，请确认页面是否仍停留在发布页",
    );
  }

  async function executePublishSession(session, sendStatus) {
    const job = session?.job;
    if (!job?.platform) {
      throw new Error("扩展未收到有效发布任务");
    }

    await sendStatus({
      status: "running",
      sourceUrl: window.location.href,
    });

    switch (job.platform) {
      case "xiaohongshu":
        await publishXiaohongshu(job);
        break;
      case "douyin":
        await publishDouyin(job);
        break;
      case "wechat_mp":
        await publishWechatMp(job);
        break;
      case "kuaishou":
        await publishKuaishou(job);
        break;
      default:
        throw new Error("当前平台暂不支持扩展本地发布");
    }

    await sendStatus({
      status: "success",
      draftUrl: window.location.href,
      sourceUrl: window.location.href,
    });
  }

  globalThis.AISuperWebPublishAutomation = {
    executePublishSession,
  };
})();
