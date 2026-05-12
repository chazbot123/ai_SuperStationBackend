const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("../server/node_modules/playwright-core");

const ROOT_DIR = path.resolve(__dirname, "..");
const SERVER_DIR = path.join(ROOT_DIR, "server");
const SESSION_ROOT = path.join(
  SERVER_DIR,
  ".runtime",
  "publishing-platform-sessions",
);

function parseArgs(argv) {
  const options = {
    pauseMs: 1500,
    finalAction: "none",
    keepOpen: true,
    images: [],
    tags: [],
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg.startsWith("--session=")) {
      options.sessionPath = arg.slice("--session=".length).trim();
      continue;
    }
    if (arg.startsWith("--account-id=")) {
      options.accountId = arg.slice("--account-id=".length).trim();
      continue;
    }
    if (arg.startsWith("--images=")) {
      options.images = arg
        .slice("--images=".length)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }
    if (arg.startsWith("--title=")) {
      options.title = arg.slice("--title=".length);
      continue;
    }
    if (arg.startsWith("--body=")) {
      options.body = arg.slice("--body=".length);
      continue;
    }
    if (arg.startsWith("--tags=")) {
      options.tags = arg
        .slice("--tags=".length)
        .split(/[\s,，]+/)
        .map((item) => item.replace(/^#+/, "").trim())
        .filter(Boolean);
      continue;
    }
    if (arg.startsWith("--pause-ms=")) {
      options.pauseMs = Number(arg.slice("--pause-ms=".length)) || options.pauseMs;
      continue;
    }
    if (arg.startsWith("--final-action=")) {
      options.finalAction = arg.slice("--final-action=".length).trim() || "none";
      continue;
    }
    if (arg === "--close-on-finish") {
      options.keepOpen = false;
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/debug-douyin-image-flow.cjs --account-id=<accountId> [options]
  node scripts/debug-douyin-image-flow.cjs --session=<sessionDir> [options]

Common options:
  --account-id=xxx
  --session=/absolute/path
  --images=a.jpg,b.jpg
  --title=Title
  --body=Body
  --tags=tag1,tag2        supports comma or whitespace, e.g. "#tag1 tag2"
  --pause-ms=1500
  --final-action=none     none | draft | publish
  --close-on-finish
`);
}

function resolveSessionPath(options) {
  if (options.sessionPath) {
    return path.resolve(options.sessionPath);
  }
  if (options.accountId) {
    return path.join(SESSION_ROOT, options.accountId);
  }
  throw new Error("Must provide --account-id or --session");
}

function resolveExecutablePath() {
  const fromEnv = process.env.PUBLISHING_BROWSER_EXECUTABLE_PATH?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv;
  }

  const candidates = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  ];

  const matched = candidates.find((item) => fs.existsSync(item));
  if (!matched) {
    throw new Error("No usable Edge/Chrome found");
  }

  return matched;
}

async function waitForStep(page, label, pauseMs, action) {
  console.log(`\n[STEP] ${label}`);
  const result = await action();
  if (pauseMs > 0) {
    await page.waitForTimeout(pauseMs);
  }
  return result;
}

async function findFirst(page, selectors, visibleOnly = true) {
  for (const selector of selectors) {
    const matched = page.locator(selector);
    const count = await matched.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const locator = matched.nth(index);
      if (!visibleOnly) {
        return { locator, selector, index };
      }
      if (await locator.isVisible().catch(() => false)) {
        return { locator, selector, index };
      }
    }
  }
  return null;
}

async function highlight(locator, color) {
  await locator.evaluate(
    (node, value) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      node.scrollIntoView({ behavior: "instant", block: "center", inline: "center" });
      const previousOutline = node.style.outline;
      const previousTransition = node.style.transition;
      node.style.transition = "outline 0.2s ease";
      node.style.outline = `3px solid ${String(value)}`;
      setTimeout(() => {
        node.style.outline = previousOutline;
        node.style.transition = previousTransition;
      }, 2500);
    },
    color,
  ).catch(() => undefined);
}

async function humanClick(locator) {
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await locator.hover({ timeout: 3000 }).catch(() => undefined);
  await locator.focus().catch(() => undefined);
  await locator.click({ timeout: 5000, delay: 80 }).catch(async () => {
    await locator.click({ timeout: 5000, force: true, delay: 80 });
  });
}

async function humanClear(locator) {
  await locator.press("Control+A").catch(() => undefined);
  await locator.press("Backspace").catch(() => undefined);
  await locator.press("Delete").catch(() => undefined);
}

async function humanType(locator, value, options = {}) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return;
  }

  const perCharDelay = options.perCharDelay ?? 45;
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  await locator.click({ timeout: 3000, delay: 60 }).catch(() => undefined);
  await locator.focus().catch(() => undefined);

  if (options.clearExisting) {
    await humanClear(locator);
  }

  const tagName = await locator.evaluate((node) => node.tagName.toLowerCase()).catch(() => "");
  if (tagName === "input" || tagName === "textarea") {
    await locator.pressSequentially(normalized, { delay: perCharDelay }).catch(async () => {
      await locator.fill(normalized, { timeout: 5000 });
    });
    return;
  }

  await locator.pressSequentially(normalized, { delay: perCharDelay }).catch(async () => {
    await locator.evaluate((node, text) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      node.focus();
      node.innerText = String(text);
      node.dispatchEvent(new InputEvent("input", { bubbles: true, data: String(text) }));
    }, normalized);
  });
}

async function clickFirst(page, selectors, label) {
  const matched = await findFirst(page, selectors, true);
  if (!matched) {
    throw new Error(`未找到${label}`);
  }
  console.log(`[MATCH] ${label}: ${matched.selector}#${matched.index}`);
  await highlight(matched.locator, "#fe2c55");
  await humanClick(matched.locator);
  return matched.locator;
}

async function uploadImageFiles(page, images) {
  if (images.length === 0) {
    console.log("[SKIP] 未提供图片路径，跳过上传");
    return;
  }

  const uploadButton = await findFirst(page, [
    'button:has-text("上传图文")',
    '.container-drag-upload-tL99XD button',
    'text=上传图文',
  ]);
  if (uploadButton) {
    console.log(`[MATCH] 上传图文按钮: ${uploadButton.selector}#${uploadButton.index}`);
    await highlight(uploadButton.locator, "#1677ff");
    await uploadButton.locator.click({ timeout: 5000 }).catch(() => undefined);
  }

  const imageInput = await findFirst(
    page,
    [
      'input[type="file"][accept*="image/png"]',
      'input[type="file"][accept*="image/jpeg"]',
      'input[type="file"][multiple]',
      'input[accept*="image/png"]',
      'input[accept*="image/jpeg"]',
      'input[accept*="image"]',
    ],
    false,
  );

  if (!imageInput) {
    throw new Error("未找到图文上传 input");
  }

  console.log(`[MATCH] 图文上传控件: ${imageInput.selector}#${imageInput.index}`);
  await imageInput.locator.setInputFiles(images);
}

async function fillTitle(page, title) {
  if (!title) {
    console.log("[SKIP] 未提供标题，跳过填写");
    return;
  }

  const matched = await findFirst(page, [
    'input[placeholder="添加作品标题"]',
    'input.semi-input[placeholder*="添加作品标题"]',
    'input[placeholder*="作品标题"]',
    'textarea[placeholder*="作品标题"]',
  ]);

  if (!matched) {
    throw new Error("未找到标题输入框");
  }

  console.log(`[MATCH] 标题输入框: ${matched.selector}#${matched.index}`);
  await highlight(matched.locator, "#00b96b");
  await humanType(matched.locator, title, { clearExisting: true });
}

async function fillBody(page, body) {
  if (!body) {
    console.log("[SKIP] 未提供文案，跳过填写");
    return;
  }

  const matched = await findFirst(page, [
    'div.zone-container[contenteditable="true"][data-placeholder="添加作品描述..."]',
    'div[contenteditable="true"][data-placeholder="添加作品描述..."]',
    '[class*="editor-kit"] [contenteditable="true"]',
    'div[contenteditable="true"]',
  ]);

  if (!matched) {
    throw new Error("未找到文案输入框");
  }

  console.log(`[MATCH] 文案输入框: ${matched.selector}#${matched.index}`);
  await highlight(matched.locator, "#fa8c16");
  await humanType(matched.locator, body, { clearExisting: true });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function clickFirstVisibleMatchingText(locator, matcher, excludedTexts = []) {
  const count = await locator.count().catch(() => 0);
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    const text = ((await candidate.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    if (!text || excludedTexts.some((item) => text.includes(item)) || !matcher.test(text)) {
      continue;
    }

    const isVisible = await candidate.isVisible().catch(() => false);
    if (!isVisible) {
      continue;
    }

    await highlight(candidate, "#52c41a");
    await humanClick(candidate).catch(async () => {
      const clickableParent = candidate.locator('xpath=ancestor-or-self::div[contains(@class,"tag-dVUDkJ")][1]').first();
      if (await clickableParent.count().catch(() => 0)) {
        await humanClick(clickableParent).catch(() => undefined);
      }
    });
    return true;
  }

  return false;
}

async function clickTopicOption(page, tag) {
  const normalizedTag = tag.replace(/^#+/, "").trim();
  const exactMatchers = [
    new RegExp(`^\\s*${escapeRegex(normalizedTag)}\\s*$`),
    new RegExp(`^\\s*#\\s*${escapeRegex(normalizedTag)}\\s*$`),
  ];
  const partialMatchers = [
    new RegExp(`^\\s*${escapeRegex(normalizedTag)}`),
    new RegExp(`#\\s*${escapeRegex(normalizedTag)}`),
    new RegExp(escapeRegex(normalizedTag)),
  ];

  const topicNameGroups = [
    page.locator(".mention-suggest-mount-dom .tag-hash-view-name-DwMEe8"),
    page.locator(".mention-suggest-mount-dom .tag-dVUDkJ.tag-hash-o0tpyE"),
    page.locator('.mention-suggest-mount-dom [class*="tag-hash-view-name"]'),
    page.locator('.mention-suggest-mount-dom [class*="tag-hash"]'),
  ];

  for (const group of topicNameGroups) {
    for (const matcher of exactMatchers) {
      if (await clickFirstVisibleMatchingText(group, matcher)) {
        return;
      }
    }
  }

  for (const group of topicNameGroups) {
    for (const matcher of partialMatchers) {
      if (await clickFirstVisibleMatchingText(group, matcher)) {
        return;
      }
    }
  }

  await page.keyboard.press("ArrowDown").catch(() => undefined);
  await page.waitForTimeout(150);
  await page.keyboard.press("Enter").catch(() => undefined);
}

async function tryAppendTopics(page, tags) {
  if (!tags.length) {
    console.log("[SKIP] 未提供话题，跳过 #添加话题");
    return;
  }

  const button = await findFirst(page, [
    'div:has-text("#添加话题")',
    '[class*="toolbar-button"]:has-text("#添加话题")',
    'text=#添加话题',
  ]);

  if (!button) {
    console.log("[WARN] 未找到 #添加话题 按钮，跳过");
    return;
  }

  console.log(`[MATCH] 话题按钮: ${button.selector}#${button.index}`);
  await highlight(button.locator, "#722ed1");

  for (const tag of tags) {
    await button.locator.click({ timeout: 5000 }).catch(() => undefined);
    await page.waitForTimeout(300);

    const input = await findFirst(page, [
      'input[placeholder*="话题"]',
      'input[placeholder*="搜索"]',
      'input[placeholder*="输入"]',
      ".mention-suggest-mount-dom input",
      '[class*="topic"] input',
    ]);

    if (input) {
      console.log(`[MATCH] 话题输入框: ${input.selector}#${input.index} -> ${tag}`);
      await humanType(input.locator, tag, { clearExisting: true, perCharDelay: 60 });
    } else {
      const editor = await findFirst(page, [
        'div.zone-container[contenteditable="true"][data-placeholder="添加作品描述..."]',
        'div[contenteditable="true"][data-placeholder="添加作品描述..."]',
        '[class*="editor-kit"] [contenteditable="true"]',
        'div[contenteditable="true"]',
      ]);

      if (!editor) {
        console.log(`[WARN] 点击话题按钮后既无输入框也找不到正文编辑器，停止补写话题: ${tag}`);
        return;
      }

      console.log(`[MATCH] 正文编辑器: ${editor.selector}#${editor.index} -> ${tag}`);
      await highlight(editor.locator, "#fa8c16");
      await humanClick(editor.locator);
      await page.keyboard.type(tag, { delay: 60 }).catch(() => undefined);
    }

    await page.waitForTimeout(500);
    await clickTopicOption(page, tag);
    await page.waitForTimeout(400);
  }
}

async function highlightFinalButtons(page) {
  const publishButton = await findFirst(page, [
    'button:has-text("发布")',
    "text=发布",
  ]);
  const draftButton = await findFirst(page, [
    "text=暂存离开",
    "text=暂存",
    "text=保存并离开",
  ]);

  if (publishButton) {
    console.log(`[MATCH] 发布按钮: ${publishButton.selector}#${publishButton.index}`);
    await highlight(publishButton.locator, "#ff4d4f");
  }
  if (draftButton) {
    console.log(`[MATCH] 暂存按钮: ${draftButton.selector}#${draftButton.index}`);
    await highlight(draftButton.locator, "#13c2c2");
  }

  return { publishButton, draftButton };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const sessionPath = resolveSessionPath(options);
  if (!fs.existsSync(sessionPath)) {
    throw new Error(`Session directory not found: ${sessionPath}`);
  }

  const executablePath = resolveExecutablePath();
  console.log("[INFO] sessionPath =", sessionPath);
  console.log("[INFO] executablePath =", executablePath);

  const context = await chromium.launchPersistentContext(sessionPath, {
    headless: false,
    executablePath,
  });

  const close = async () => {
    await context.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);

  const page = context.pages().find((item) => !item.isClosed()) || (await context.newPage());
  await page.goto("https://creator.douyin.com/creator-micro/content/publish", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  }).catch(() => undefined);

  await waitForStep(page, "进入高清发布", options.pauseMs, async () => {
    const highQualityButton = await findFirst(page, ["text=高清发布"], true);
    if (highQualityButton) {
      await highlight(highQualityButton.locator, "#1677ff");
      await highQualityButton.locator.click({ timeout: 5000 });
    }
  });

  await waitForStep(page, "切换发布图文", options.pauseMs, async () => {
    await clickFirst(page, ["text=发布图文"], "发布图文标签");
  });

  await waitForStep(page, "上传图文", options.pauseMs, async () => {
    await uploadImageFiles(page, options.images);
  });

  await waitForStep(page, "填写标题", options.pauseMs, async () => {
    await fillTitle(page, options.title);
  });

  await waitForStep(page, "填写文案", options.pauseMs, async () => {
    await fillBody(page, options.body);
  });

  await waitForStep(page, "添加话题", options.pauseMs, async () => {
    await tryAppendTopics(page, options.tags);
  });

  const finals = await waitForStep(page, "定位最终按钮", options.pauseMs, async () =>
    highlightFinalButtons(page),
  );

  if (options.finalAction === "draft" && finals.draftButton) {
    await waitForStep(page, "点击暂存按钮", options.pauseMs, async () => {
      await humanClick(finals.draftButton.locator);
    });
  } else if (options.finalAction === "publish" && finals.publishButton) {
    await waitForStep(page, "点击发布按钮", options.pauseMs, async () => {
      await humanClick(finals.publishButton.locator);
    });
  } else {
    console.log("[INFO] finalAction =", options.finalAction, "，本次不点击最终按钮");
  }

  console.log("\n[DONE] 调试链路执行完成");
  console.log("[INFO] 当前页面 =", page.url());

  if (!options.keepOpen) {
    await context.close();
    return;
  }

  console.log("[INFO] 浏览器保持打开，便于继续人工观察；按 Ctrl+C 退出脚本");
  await new Promise(() => undefined);
}

module.exports = {
  parseArgs,
};

if (require.main === module) {
  main().catch((error) => {
    console.error("[ERROR]", error?.message || error);
    process.exitCode = 1;
  });
}
