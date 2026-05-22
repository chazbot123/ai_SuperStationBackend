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
      const bodyText = await frame
        .evaluate(() => String(document.body?.innerText || ""))
        .catch(() => "");
      if (bodyText.includes("图文标题") && bodyText.includes("图文描述")) {
        return frame;
      }
    }
    await page.waitForTimeout(1000);
  }

  throw new Error("Timed out waiting for wechat frame");
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

      function describeElement(element) {
        if (!(element instanceof HTMLElement)) {
          return null;
        }
        return {
          tag: element.tagName.toLowerCase(),
          className: element.className || "",
          text: normalize(element.innerText || element.textContent || ""),
          placeholder: element.getAttribute("placeholder") || "",
          dataPlaceholder: element.getAttribute("data-placeholder") || "",
          contenteditable: element.getAttribute("contenteditable") || "",
          xpath: getXPath(element),
          outerHTML: element.outerHTML.slice(0, 2000),
        };
      }

      function collectByText(keyword) {
        return Array.from(document.querySelectorAll("div, span, label, button"))
          .filter((element) => normalize(element.textContent) === keyword)
          .map((element) => {
            const parent = element.parentElement;
            const container = parent?.parentElement ?? parent;
            return {
              self: describeElement(element),
              parent: describeElement(parent),
              container: describeElement(container),
            };
          })
          .slice(0, 5);
      }

      return {
        titleLabels: collectByText("图文标题"),
        descLabels: collectByText("图文描述"),
        publishLabels: collectByText("发表"),
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
