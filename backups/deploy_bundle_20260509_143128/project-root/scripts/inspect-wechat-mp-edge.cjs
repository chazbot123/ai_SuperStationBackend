const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("../server/node_modules/playwright-core");

const TARGET_URL = "https://channels.weixin.qq.com/platform/post/finderNewLifeCreate";

function resolveExecutablePath() {
  const candidates = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  ];

  const matched = candidates.find((item) => fs.existsSync(item));
  if (!matched) {
    throw new Error("No usable Edge found");
  }

  return matched;
}

function quoteXPathLiteral(value) {
  if (!String(value).includes("'")) {
    return `'${value}'`;
  }

  const parts = String(value).split("'");
  return `concat(${parts.map((part, index) => `${index > 0 ? `,"'",` : ""}'${part}'`).join("")})`;
}

async function waitForReadyPage(page, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const currentUrl = page.url();
    if (currentUrl.includes("/platform/post/finderNewLifeCreate")) {
      return;
    }

    await page.waitForTimeout(1000);
  }

  throw new Error("Timed out waiting for Wechat image publish page");
}

async function waitForMicroAppReady(page, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const targetFrame = page
      .frames()
      .find((frame) => frame.url().includes("/micro/content/post/finderNewLifeCreate"));

    if (targetFrame) {
      const state = await targetFrame
        .evaluate(() => {
          const text = String(document.body?.innerText || "").replace(/\s+/g, " ").trim();
          const inputCount = document.querySelectorAll("input, textarea, [contenteditable='true']").length;
          const buttonCount = document.querySelectorAll("button, [role='button']").length;
          return { text, inputCount, buttonCount };
        })
        .catch(() => ({ text: "", inputCount: 0, buttonCount: 0 }));

      const jsFallback = state.text.includes("doesn't work properly without JavaScript enabled");
      if (!jsFallback && (state.inputCount > 0 || state.buttonCount > 0)) {
        return;
      }
    }

    await page.waitForTimeout(1000);
  }

  throw new Error("Timed out waiting for Wechat micro app frame to become interactive");
}

async function inspectPage(page) {
  return page.evaluate(() => {
    function normalizeSpace(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    }

    function isVisible(element) {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || "1") > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    }

    function getXPath(element) {
      if (!(element instanceof Element)) {
        return "";
      }
      if (element.id) {
        return `//*[@id="${element.id}"]`;
      }
      const segments = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE) {
        let index = 1;
        let sibling = current.previousElementSibling;
        while (sibling) {
          if (sibling.tagName === current.tagName) {
            index += 1;
          }
          sibling = sibling.previousElementSibling;
        }
        segments.unshift(`${current.tagName.toLowerCase()}[${index}]`);
        current = current.parentElement;
      }
      return `/${segments.join("/")}`;
    }

    function collect(elements) {
      return Array.from(elements)
        .filter((element) => element instanceof Element)
        .filter((element) => isVisible(element))
        .map((element) => {
          const text = normalizeSpace(
            element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
              ? element.value || element.placeholder || element.getAttribute("aria-label") || element.textContent
              : element.textContent,
          );
          return {
            tag: element.tagName.toLowerCase(),
            text,
            placeholder: element.getAttribute("placeholder") || "",
            role: element.getAttribute("role") || "",
            contenteditable: element.getAttribute("contenteditable") || "",
            className: element.getAttribute("class") || "",
            xpath: getXPath(element),
          };
        })
        .slice(0, 10);
    }

    const titleCandidates = collect(
      document.querySelectorAll(
        'input, textarea, [contenteditable="true"], [placeholder*="标题"], [placeholder*="填写标题"]',
      ),
    ).filter((item) => item.placeholder.includes("标题") || item.text.includes("标题") || item.tag === "input");

    const descriptionCandidates = collect(
      document.querySelectorAll(
        'textarea, [contenteditable="true"], [placeholder*="描述"], [placeholder*="内容"], [data-placeholder*="描述"]',
      ),
    ).filter(
      (item) =>
        item.placeholder.includes("描述") ||
        item.text.includes("描述") ||
        item.contenteditable === "true" ||
        item.tag === "textarea",
    );

    const uploadCandidates = collect(
      Array.from(document.querySelectorAll("input[type=file], div, span, button")).filter((element) =>
        normalizeSpace(element.textContent).includes("发布图片动态") ||
        normalizeSpace(element.textContent).includes("上传") ||
        (element instanceof HTMLInputElement && element.type === "file"),
      ),
    );

    const publishCandidates = collect(
      Array.from(document.querySelectorAll("button, [role=button], div, span")).filter((element) => {
        const text = normalizeSpace(element.textContent);
        return text === "发表" || text === "发布" || text.includes("发表");
      }),
    );

    return {
      url: location.href,
      titleCandidates,
      descriptionCandidates,
      uploadCandidates,
      publishCandidates,
    };
  });
}

async function inspectFrame(frame) {
  try {
    return await frame.evaluate(() => {
      function normalizeSpace(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
      }

      function isVisible(element) {
        if (!(element instanceof HTMLElement)) {
          return false;
        }
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      }

      function getXPath(element) {
        if (!(element instanceof Element)) {
          return "";
        }
        if (element.id) {
          return `//*[@id="${element.id}"]`;
        }
        const segments = [];
        let current = element;
        while (current && current.nodeType === Node.ELEMENT_NODE) {
          let index = 1;
          let sibling = current.previousElementSibling;
          while (sibling) {
            if (sibling.tagName === current.tagName) {
              index += 1;
            }
            sibling = sibling.previousElementSibling;
          }
          segments.unshift(`${current.tagName.toLowerCase()}[${index}]`);
          current = current.parentElement;
        }
        return `/${segments.join("/")}`;
      }

      function collect(elements) {
        return Array.from(elements)
          .filter((element) => element instanceof Element)
          .filter((element) => isVisible(element))
          .map((element) => ({
            tag: element.tagName.toLowerCase(),
            text: normalizeSpace(element.textContent),
            placeholder: element.getAttribute("placeholder") || "",
            role: element.getAttribute("role") || "",
            contenteditable: element.getAttribute("contenteditable") || "",
            className: element.getAttribute("class") || "",
            id: element.getAttribute("id") || "",
            xpath: getXPath(element),
          }))
          .slice(0, 20);
      }

      return {
        url: location.href,
        bodyText: normalizeSpace(document.body?.innerText || "").slice(0, 1000),
        inputs: collect(document.querySelectorAll("input, textarea, [contenteditable='true']")),
        buttons: collect(document.querySelectorAll("button, [role='button']")),
        uploadAreas: collect(
          Array.from(document.querySelectorAll("div, span, button, input[type='file']")).filter((element) => {
            const text = normalizeSpace(element.textContent);
            return (
              text.includes("发布图片动态") ||
              text.includes("上传") ||
              text.includes("发表") ||
              text.includes("发布")
            );
          }),
        ),
      };
    });
  } catch (error) {
    return {
      url: frame.url(),
      error: String(error?.message || error),
      bodyText: "",
      inputs: [],
      buttons: [],
      uploadAreas: [],
    };
  }
}

async function main() {
  const executablePath = resolveExecutablePath();
  const userDataDir = path.join(os.tmpdir(), "ai-superweb-edge-wechat-inspect");

  console.log(`[inspect-wechat-mp] launching Edge: ${executablePath}`);
  console.log(`[inspect-wechat-mp] target url: ${TARGET_URL}`);
  console.log("[inspect-wechat-mp] please log in with the opened Edge window if needed.");

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: false,
    viewport: null,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => undefined);
    console.log("[inspect-wechat-mp] waiting for the real publish page...");
    await waitForReadyPage(page, 10 * 60 * 1000);
    console.log("[inspect-wechat-mp] waiting for the micro app frame...");
    await waitForMicroAppReady(page, 60 * 1000);
    await page.waitForTimeout(2000);

    const result = await inspectPage(page);
    const frames = page.frames();
    const frameResults = [];
    for (const frame of frames) {
      frameResults.push(await inspectFrame(frame));
    }

    console.log("[inspect-wechat-mp] inspect result:");
    console.log(JSON.stringify(result, null, 2));
    console.log("[inspect-wechat-mp] frame result:");
    console.log(JSON.stringify(frameResults, null, 2));
    console.log("[inspect-wechat-mp] done");
  } finally {
    await context.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error("[inspect-wechat-mp] failed:", error);
  process.exitCode = 1;
});
