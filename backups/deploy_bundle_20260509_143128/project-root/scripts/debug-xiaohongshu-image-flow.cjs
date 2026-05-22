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
        .split(/[\s,]+/)
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
  node scripts/debug-xiaohongshu-image-flow.cjs --account-id=<accountId> [options]
  node scripts/debug-xiaohongshu-image-flow.cjs --session=<sessionDir> [options]

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
  await locator
    .evaluate(
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
    )
    .catch(() => undefined);
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

async function enterImagePublish(page) {
  if (page.url().includes("/publish/publish")) {
    console.log("[INFO] 当前已在小红书发布页");
    return;
  }

  await page.waitForTimeout(2000);
  const publishEntry = await findFirst(page, [
    'div.publish-card:has-text("发布图文笔记")',
    "text=发布图文笔记",
    'button:has-text("发布笔记")',
    "text=发布笔记",
  ]);

  if (publishEntry) {
    console.log(`[MATCH] 发布图文笔记入口: ${publishEntry.selector}#${publishEntry.index}`);
    await highlight(publishEntry.locator, "#fe2c55");
    await humanClick(publishEntry.locator);
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(1200);
    return;
  }

  const bodyText = ((await page.locator("body").textContent().catch(() => "")) || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  console.log("[WARN] 首页未找到发布图文笔记入口，准备回退直达发布页");
  console.log("[INFO] 当前页面 =", page.url());
  console.log("[INFO] 页面摘要 =", bodyText);

  await page.goto(
    "https://creator.xiaohongshu.com/publish/publish?from=homepage&target=image&openFilePicker=true",
    {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    },
  );
  await page.waitForTimeout(1800);
}

async function uploadImageFiles(page, images) {
  if (images.length === 0) {
    console.log("[SKIP] 未提供图片路径，跳过上传");
    return;
  }

  const imageInput = await findFirst(
    page,
    [
      'input[type="file"][accept*="image/png"]',
      'input[type="file"][accept*="image/jpeg"]',
      'input[type="file"][accept*="image/*"]',
      'input[accept*="image/png"]',
      'input[accept*="image/jpeg"]',
      'input[accept*="image/*"]',
      'input[type="file"]',
    ],
    false,
  );

  if (!imageInput) {
    throw new Error("未找到小红书图片上传 input");
  }

  console.log(`[MATCH] 图片上传控件: ${imageInput.selector}#${imageInput.index}`);
  await imageInput.locator.setInputFiles(images);
  await page.waitForTimeout(2500);
}

async function fillTitle(page, title) {
  if (!title) {
    console.log("[SKIP] 未提供标题，跳过填写");
    return;
  }

  const matched = await findFirst(page, [
    "div.input input.d-text",
    'input[placeholder*="标题"]',
    'textarea[placeholder*="标题"]',
    'input[type="text"]',
  ]);

  if (!matched) {
    throw new Error("未找到小红书标题输入框");
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
    "div.tiptap.ProseMirror",
    'div[role="textbox"]',
    'div[contenteditable="true"]',
    '[class*="editor"] [contenteditable="true"]',
  ]);

  if (!matched) {
    throw new Error("未找到小红书正文输入框");
  }

  console.log(`[MATCH] 正文输入框: ${matched.selector}#${matched.index}`);
  await highlight(matched.locator, "#fa8c16");
  await humanType(matched.locator, body, { clearExisting: true });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function clickFirstVisibleTopicCandidate(page, tag) {
  const excludedTexts = ["#话题", "# 话题", "话题", "@用户", "@ 用户", "用户", "表情", "更多"];
  const selectors = [
    '[class*="suggest"] [role="option"]',
    '[class*="topic"] [role="option"]',
    '[class*="popover"] [class*="item"]',
    '[class*="panel"] [class*="item"]',
    'div[role="listbox"] > *',
  ];
  const normalizedTag = String(tag || "").replace(/^#+/, "").trim();
  const preferredMatchers = normalizedTag
    ? [
        new RegExp(`#\\s*${escapeRegex(normalizedTag)}`),
        new RegExp(escapeRegex(normalizedTag)),
      ]
    : [];

  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      const text = ((await candidate.textContent().catch(() => "")) || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!text || excludedTexts.some((item) => text.includes(item))) {
        continue;
      }

      const isVisible = await candidate.isVisible().catch(() => false);
      if (!isVisible) {
        continue;
      }
      if (preferredMatchers.length > 0 && !preferredMatchers.some((matcher) => matcher.test(text))) {
        continue;
      }

      console.log(`[MATCH] 标签候选: ${selector}#${index} -> ${text}`);
      await highlight(candidate, "#52c41a");
      await humanClick(candidate);
      return true;
    }
  }

  return false;
}

async function dumpTopicCandidates(page, tag) {
  const selectors = [
    '[class*="suggest"] [role="option"]',
    '[class*="topic"] [role="option"]',
    '[class*="popover"] [class*="item"]',
    '[class*="panel"] [class*="item"]',
    'div[role="listbox"] > *',
  ];

  console.log(`[DEBUG] 未命中标签候选，开始转储候选层文本: ${tag}`);
  for (const selector of selectors) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    const values = [];
    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);
      const isVisible = await candidate.isVisible().catch(() => false);
      if (!isVisible) {
        continue;
      }
      const text = ((await candidate.textContent().catch(() => "")) || "")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) {
        continue;
      }
      values.push(`${index}:${text}`);
      if (values.length >= 8) {
        break;
      }
    }
    if (values.length > 0) {
      console.log(`[DEBUG] ${selector}`);
      for (const value of values) {
        console.log(`  - ${value}`);
      }
    }
  }
}

async function dumpTopicControls(page) {
  const controls = await page
    .evaluate(() => {
      const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
      return Array.from(document.querySelectorAll("button, div, span"))
        .map((node) => {
          if (!(node instanceof HTMLElement)) {
            return null;
          }
          const text = normalize(node.innerText || node.textContent);
          if (!text || (!text.includes("话题") && !text.includes("用户") && !text.includes("表情"))) {
            return null;
          }
          const rect = node.getBoundingClientRect();
          if (rect.width < 20 || rect.height < 20 || rect.bottom < 0 || rect.top > window.innerHeight) {
            return null;
          }
          return {
            tag: node.tagName.toLowerCase(),
            text,
            cls: node.className || "",
            top: Math.round(rect.top),
            left: Math.round(rect.left),
          };
        })
        .filter(Boolean)
        .slice(0, 20);
    })
    .catch(() => []);

  if (!controls.length) {
    console.log("[DEBUG] 当前页面未抓到含 话题/用户/表情 的可见控件");
    return;
  }

  console.log("[DEBUG] 当前页面相关控件:");
  for (const item of controls) {
    console.log(`  - <${item.tag}> top=${item.top} left=${item.left} class=${item.cls} text=${item.text}`);
  }
}

async function tryAppendTopics(page, tags) {
  if (!tags.length) {
    console.log("[SKIP] 未提供标签，跳过平台标签转换");
    return;
  }

  const editor = await findFirst(page, [
    "div.tiptap.ProseMirror",
    'div[role="textbox"]',
    'div[contenteditable="true"]',
    '[class*="editor"] [contenteditable="true"]',
  ]);

  if (!editor) {
    throw new Error("未找到小红书正文编辑器，无法追加标签");
  }

  console.log(`[MATCH] 标签输入编辑器: ${editor.selector}#${editor.index}`);
  await highlight(editor.locator, "#722ed1");
  await dumpTopicControls(page);

  for (const tag of tags) {
    const topicButton = await findFirst(page, [
      "div.topic-container",
      "div.btns .topic-container",
      'div[class*="topic-container"]',
      'button:has-text("#话题")',
      'div:has-text("#话题")',
      'span:has-text("#话题")',
      'button:has-text("话题")',
      'div:has-text("话题")',
      'span:has-text("话题")',
      "text=#话题",
      "text=话题",
    ]);
    if (topicButton) {
      console.log(`[MATCH] 话题按钮: ${topicButton.selector}#${topicButton.index}`);
      await highlight(topicButton.locator, "#1677ff");
      await humanClick(topicButton.locator);
      await page.waitForTimeout(250);
    }

    await humanClick(editor.locator);
    console.log(`[INFO] 输入标签并选择第一个候选: ${tag}`);
    await page.keyboard.type(topicButton ? `${tag}` : ` #${tag}`, { delay: 60 }).catch(() => undefined);
    await page.waitForTimeout(500);
    const clicked = await clickFirstVisibleTopicCandidate(page, tag);
    if (!clicked) {
      console.log(`[WARN] 未找到标签候选，保留纯文本标签: ${tag}`);
      await dumpTopicCandidates(page, tag);
    }
    await page.waitForTimeout(350);
  }
}

async function highlightFinalButtons(page) {
  await page
    .evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
    })
    .catch(() => undefined);
  await page.waitForTimeout(600);

  const publishButton = await findFirst(page, [
    'button.d-button:has-text("发布")',
    'div.publish-page-publish-btn button:has-text("发布")',
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
  await page.goto("https://creator.xiaohongshu.com/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  }).catch(() => undefined);

  await waitForStep(page, "进入图文发布页", options.pauseMs, async () => {
    await enterImagePublish(page);
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

  await waitForStep(page, "逐个转换标签", options.pauseMs, async () => {
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

  console.log("\n[DONE] 小红书调试链路执行完成");
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
