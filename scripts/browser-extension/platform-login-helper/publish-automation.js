(function () {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const randomBetween = (min, max) => {
    const lower = Math.min(min, max);
    const upper = Math.max(min, max);
    return Math.floor(lower + Math.random() * (upper - lower + 1));
  };

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

  async function humanClickElement(node, options = {}) {
    if (!(node instanceof HTMLElement)) {
      throw new Error("目标元素不可点击");
    }

    const beforeMoveMin = options.beforeMoveMin ?? 120;
    const beforeMoveMax = options.beforeMoveMax ?? 260;
    const movePauseMin = options.movePauseMin ?? 80;
    const movePauseMax = options.movePauseMax ?? 180;
    const holdPauseMin = options.holdPauseMin ?? 90;
    const holdPauseMax = options.holdPauseMax ?? 160;
    const afterClickMin = options.afterClickMin ?? 220;
    const afterClickMax = options.afterClickMax ?? 420;

    node.scrollIntoView({ block: "center", inline: "center" });
    await sleep(randomBetween(beforeMoveMin, beforeMoveMax));

    const rect = node.getBoundingClientRect();
    const clientX = rect.left + Math.max(6, Math.min(rect.width - 6, rect.width * 0.45));
    const clientY = rect.top + Math.max(6, Math.min(rect.height - 6, rect.height * 0.5));

    const dispatchPointer = (type, overrides = {}) => {
      if (typeof PointerEvent === "undefined") {
        return;
      }
      node.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          clientX,
          clientY,
          button: 0,
          buttons: 1,
          ...overrides,
        }),
      );
    };

    const dispatchMouse = (type, overrides = {}) => {
      node.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          clientX,
          clientY,
          button: 0,
          buttons: 1,
          ...overrides,
        }),
      );
    };

    node.focus();
    dispatchPointer("pointerover");
    dispatchMouse("mouseover");
    dispatchPointer("pointerenter");
    dispatchMouse("mouseenter");
    await sleep(randomBetween(movePauseMin, movePauseMax));
    dispatchPointer("pointermove");
    dispatchMouse("mousemove");
    await sleep(randomBetween(movePauseMin, movePauseMax));
    dispatchPointer("pointerdown");
    dispatchMouse("mousedown");
    await sleep(randomBetween(holdPauseMin, holdPauseMax));
    dispatchPointer("pointerup", { buttons: 0 });
    dispatchMouse("mouseup", { buttons: 0 });
    node.click();
    await sleep(randomBetween(afterClickMin, afterClickMax));
  }

  async function clickFirst(selectors, timeoutMs = 30000, root = document, options = {}) {
    const node = await waitForVisible(selectors, timeoutMs, root, true);
    if (node instanceof HTMLElement) {
      await humanClickElement(node, options);
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

  function placeCaretAtEnd(node) {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    const selection = window.getSelection();
    if (!selection) {
      return;
    }
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function clearEditable(node) {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    node.focus();
    const selection = window.getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(node);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    document.execCommand("delete", false);
    node.textContent = "";
    dispatchInputEvents(node);
    placeCaretAtEnd(node);
  }

  function insertEditableText(node, text) {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    node.focus();
    placeCaretAtEnd(node);
    const inserted = document.execCommand("insertText", false, text);
    if (!inserted) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        node.textContent = `${node.textContent || ""}${text}`;
      } else {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
    dispatchInputEvents(node);
    placeCaretAtEnd(node);
  }

  async function typeEditableTextHuman(node, text, minDelay = 70, maxDelay = 120) {
    const normalized = String(text || "");
    if (!normalized) {
      return;
    }
    for (const char of normalized) {
      insertEditableText(node, char);
      await sleep(randomBetween(minDelay, maxDelay));
    }
  }

  async function pressEditableEnter(node) {
    if (!(node instanceof HTMLElement)) {
      return;
    }
    node.focus();
    placeCaretAtEnd(node);
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    const inserted =
      document.execCommand("insertParagraph", false) ||
      document.execCommand("insertLineBreak", false) ||
      document.execCommand("insertHTML", false, "<div><br></div>");
    if (!inserted) {
      insertEditableText(node, "\n");
    } else {
      dispatchInputEvents(node);
    }
    node.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
    placeCaretAtEnd(node);
    await sleep(randomBetween(240, 420));
  }

  function escapeHasText(value) {
    return String(value || "")
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"');
  }

  function normalizeTags(tags) {
    return Array.from(
      new Set(
        (tags || [])
          .map((tag) => String(tag || "").replace(/^#+/, "").trim())
          .filter(Boolean),
      ),
    );
  }

  async function clickKuaishouTagCandidate(tag) {
    const safeTag = escapeHasText(tag);
    const selectors = [
      `span._at-tag-name_eho7l_222:has-text("${safeTag}")`,
      `span[class*="at-tag-name"]:has-text("${safeTag}")`,
      `span:has-text("${safeTag}")`,
      `div:has-text("${safeTag}")`,
    ];
    return clickFirst(selectors, 5000, document, {
      beforeMoveMin: 160,
      beforeMoveMax: 320,
      movePauseMin: 100,
      movePauseMax: 220,
      holdPauseMin: 110,
      holdPauseMax: 180,
      afterClickMin: 260,
      afterClickMax: 520,
    })
      .then(() => true)
      .catch(() => false);
  }

  async function fillKuaishouDescription(job) {
    const editor = await waitForVisible(
      [
        "div#work-description-edit",
        'div._description_eho7l_59#work-description-edit',
        'div[contenteditable="true"]#work-description-edit',
        'div[contenteditable="true"][placeholder*="添加合适的话题"]',
        'div[contenteditable="true"]',
      ],
      20000,
      document,
      true,
    );
    if (!(editor instanceof HTMLElement)) {
      throw new Error("未找到快手描述输入框");
    }

    await humanClickElement(editor, {
      beforeMoveMin: 180,
      beforeMoveMax: 360,
      movePauseMin: 120,
      movePauseMax: 240,
      holdPauseMin: 120,
      holdPauseMax: 220,
      afterClickMin: 260,
      afterClickMax: 520,
    });
    await sleep(randomBetween(180, 320));
    clearEditable(editor);
    await sleep(randomBetween(180, 320));

    const title = String(job?.draftTitle || "").trim();
    const body = String(job?.draftBody || "").trim();
    const tags = normalizeTags(job?.draftTags);

    if (title) {
      await typeEditableTextHuman(editor, title, 80, 135);
    }
    await pressEditableEnter(editor);

    if (body) {
      await typeEditableTextHuman(editor, body, 80, 135);
    }

    for (const tag of tags) {
      await pressEditableEnter(editor);
      await typeEditableTextHuman(editor, `#${tag}`, 85, 140);
      await sleep(randomBetween(500, 900));
      await clickKuaishouTagCandidate(tag);
      await sleep(randomBetween(380, 720));
    }
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

  async function ensureKuaishouPublishReady(isVideo) {
    await sleep(1500);
    const entryTitle = isVideo ? "发布视频" : "发布图文";
    const uploadLabel = isVideo ? "上传视频" : "上传图片";

    await clickFirst(
      [
        `div.item:has-text("${entryTitle}")`,
        `div[class*="item"]:has-text("${entryTitle}")`,
        `div:has-text("${entryTitle}")`,
        `text=${entryTitle}`,
      ],
      10000,
      document,
      {
        beforeMoveMin: 180,
        beforeMoveMax: 360,
        movePauseMin: 120,
        movePauseMax: 240,
        holdPauseMin: 120,
        holdPauseMax: 220,
        afterClickMin: 320,
        afterClickMax: 700,
      },
    );

    await sleep(1000);

    await clickFirst(
      [
        isVideo ? "button._upload-btn_1j3uy_87" : "button._upload-btn_ysbff_57",
        `button:has-text("${uploadLabel}")`,
        `[role="button"]:has-text("${uploadLabel}")`,
        `div:has-text("${uploadLabel}")`,
        `text=${uploadLabel}`,
      ],
      10000,
      document,
      {
        beforeMoveMin: 160,
        beforeMoveMax: 320,
        movePauseMin: 100,
        movePauseMax: 220,
        holdPauseMin: 100,
        holdPauseMax: 180,
        afterClickMin: 260,
        afterClickMax: 520,
      },
    ).catch(() => null);

    await sleep(700);
  }

  function assertKuaishouLoginStillValid() {
    const pageText = normalize(document.body?.innerText || document.body?.textContent || "");
    if (pageText.includes("您的登录状态已过期") || pageText.includes("点击确定重新登录")) {
      throw new Error("快手登录已失效，请重新登录后再发布");
    }
  }

  function isKuaishouProfilePage() {
    return window.location.href.startsWith("https://cp.kuaishou.com/profile");
  }

  function isKuaishouEditorPage(isVideo) {
    const inputSelectors = isVideo
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
        ];
    return Boolean(
      queryFirst(
        [
          "div#work-description-edit",
          'div[contenteditable="true"]#work-description-edit',
          ...inputSelectors,
        ],
        document,
        false,
      ),
    );
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
    if (!window.location.hostname.includes("cp.kuaishou.com")) {
      await gotoUrl("https://cp.kuaishou.com/profile");
    }
    if (isKuaishouProfilePage()) {
      await ensureKuaishouPublishReady(isVideo);
    } else if (!isKuaishouEditorPage(isVideo)) {
      await gotoUrl("https://cp.kuaishou.com/profile");
      await ensureKuaishouPublishReady(isVideo);
    }
    assertKuaishouLoginStillValid();
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
    assertKuaishouLoginStillValid();
    await sleep(3200);
    await fillKuaishouDescription(job);
    await clickFirst(
      [
        'div._button_3a3lq_1._button-primary_3a3lq_60',
        'button:has-text("发布")',
        'div[role="button"]:has-text("发布")',
        'div:has-text("发布")',
        'text=发布',
      ],
      10000,
      document,
      {
        beforeMoveMin: 180,
        beforeMoveMax: 340,
        movePauseMin: 120,
        movePauseMax: 240,
        holdPauseMin: 130,
        holdPauseMax: 220,
        afterClickMin: 320,
        afterClickMax: 620,
      },
    );
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
