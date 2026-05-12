const { chromium } = require("playwright-core");
(async () => {
  const sessionPath = "D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/.runtime/publishing-platform-sessions/cmoiaf42m0001fgu982qay3zp";
  const executablePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  const context = await chromium.launchPersistentContext(sessionPath, { headless: true, executablePath });
  try {
    const page = context.pages().find((item) => !item.isClosed()) || await context.newPage();
    await page.goto("https://creator.douyin.com/creator-micro/content/publish", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const hq = page.locator('text=高清发布').first();
    if (await hq.count().catch(() => 0)) {
      await hq.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(2500);
    }
    const imageTab = page.locator('text=发布图文').first();
    const imageTabCount = await imageTab.count().catch(() => 0);
    if (imageTabCount) {
      await imageTab.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }
    const result = await page.evaluate(() => ({
      url: location.href,
      text: (document.body.innerText || '').slice(0, 2200),
      fileInputs: Array.from(document.querySelectorAll('input[type="file"]')).map((node, index) => ({
        index,
        accept: node.getAttribute('accept') || '',
        cls: node.getAttribute('class') || '',
        outer: node.outerHTML.slice(0, 220)
      }))
    }));
    console.log(JSON.stringify({ imageTabCount, ...result }, null, 2));
  } finally {
    await context.close();
  }
})();
