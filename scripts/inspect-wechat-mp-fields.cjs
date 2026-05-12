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

async function waitForFrame(page, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const frame = page.frames().find((item) =>
      item.url().includes("/micro/content/post/finderNewLifeCreate"),
    );
    if (frame) {
      const ready = await frame
        .evaluate(() => {
          const text = String(document.body?.innerText || "");
          return !text.includes("doesn't work properly without JavaScript enabled");
        })
        .catch(() => false);
      if (ready) {
        return frame;
      }
    }
    await page.waitForTimeout(1000);
  }

  throw new Error("Timed out waiting for wechat micro frame");
}

async function main() {
  const context = await chromium.launchPersistentContext(
    path.join(os.tmpdir(), "ai-superweb-edge-wechat-inspect"),
    {
      executablePath: resolveExecutablePath(),
      headless: false,
      viewport: null,
      args: ["--disable-blink-features=AutomationControlled"],
    },
  );

  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => undefined);
    const frame = await waitForFrame(page, 60000);
    await page.waitForTimeout(2000);

    const result = await frame.evaluate(() => {
      function normalize(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
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

      function visible(elements) {
        return Array.from(elements)
          .filter((element) => element instanceof HTMLElement)
          .filter((element) => {
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return (
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              Number(style.opacity || "1") > 0 &&
              rect.width > 0 &&
              rect.height > 0
            );
          })
          .map((element) => ({
            tag: element.tagName.toLowerCase(),
            text: normalize(element.textContent),
            placeholder: element.getAttribute("placeholder") || "",
            dataPlaceholder: element.getAttribute("data-placeholder") || "",
            className: element.getAttribute("class") || "",
            contenteditable: element.getAttribute("contenteditable") || "",
            xpath: getXPath(element),
          }));
      }

      return {
        titleRelated: visible(
          document.querySelectorAll(
            'input[placeholder*="标题"], textarea[placeholder*="标题"], .weui-desktop-form__input',
          ),
        ),
        descRelated: visible(
          document.querySelectorAll(
            'textarea, [contenteditable="true"], [data-placeholder*="描述"], [placeholder*="描述"], [placeholder*="内容"]',
          ),
        ),
        publishButtons: visible(
          Array.from(document.querySelectorAll("button, [role='button']")).filter((element) =>
            normalize(element.textContent).includes("发表") || normalize(element.textContent).includes("发布"),
          ),
        ),
      };
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await context.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
