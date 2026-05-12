const { chromium } = require("playwright-core");
(async () => {
  const sessionPath = "D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/.runtime/publishing-platform-sessions/cmoiaf42m0001fgu982qay3zp";
  const executablePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  const context = await chromium.launchPersistentContext(sessionPath, { headless: true, executablePath });
  try {
    const page = context.pages().find((item) => !item.isClosed()) || await context.newPage();
    await page.goto("https://creator.douyin.com/creator-micro/content/publish", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const hq = page.locator('text=高清发布').first();
    if (await hq.count().catch(() => 0)) { await hq.click().catch(() => {}); await page.waitForTimeout(1500); }
    const imageTab = page.locator('text=发布图文').first();
    if (await imageTab.count().catch(() => 0)) { await imageTab.click().catch(() => {}); await page.waitForTimeout(2000); }
    const result = await page.evaluate(() => Array.from(document.querySelectorAll('input[type="file"]')).map((node, index) => ({
      index,
      accept: node.getAttribute('accept') || '',
      cls: node.getAttribute('class') || '',
      outer: node.outerHTML.slice(0, 320),
      parent: node.parentElement?.outerHTML?.slice(0, 320) || ''
    })));
    console.log(JSON.stringify(result, null, 2));
  } finally { await context.close(); }
})();
