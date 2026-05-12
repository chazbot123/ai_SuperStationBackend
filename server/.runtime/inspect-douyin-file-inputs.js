const { chromium } = require("playwright-core");
(async () => {
  const sessionPath = "D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/.runtime/publishing-platform-sessions/cmoiaf42m0001fgu982qay3zp";
  const executablePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  const context = await chromium.launchPersistentContext(sessionPath, { headless: true, executablePath });
  try {
    const page = context.pages().find((item) => !item.isClosed()) || await context.newPage();
    await page.goto("https://creator.douyin.com/creator-micro/content/publish", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const result = await page.evaluate(() => Array.from(document.querySelectorAll('input')).map((node, index) => ({
      index,
      type: node.getAttribute('type') || '',
      accept: node.getAttribute('accept') || '',
      cls: node.getAttribute('class') || '',
      hidden: node.hidden,
      disabled: node.disabled,
      outer: node.outerHTML.slice(0, 220)
    })).filter((item) => item.type === 'file' || /upload-btn-input|upload/i.test(item.cls) || /image|video/i.test(item.accept)));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await context.close();
  }
})();
