const { chromium } = require("playwright-core");
(async () => {
  const sessionPath = "D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/.runtime/publishing-platform-sessions/cmoiaf42m0001fgu982qay3zp";
  const executablePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  const context = await chromium.launchPersistentContext(sessionPath, { headless: true, executablePath });
  try {
    const page = context.pages().find((item) => !item.isClosed()) || await context.newPage();
    await page.goto("https://creator.douyin.com/creator-micro/content/publish", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const before = await page.locator('body').innerText().catch(() => '');
    const btn = page.locator('text=高清发布').first();
    const hasBtn = await btn.count().catch(() => 0);
    if (hasBtn) {
      await btn.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(3000);
    }
    const afterUrl = page.url();
    const afterText = await page.locator('body').innerText().catch(() => '');
    const fileInputs = await page.evaluate(() => Array.from(document.querySelectorAll('input[type="file"]')).map((node, index) => ({ index, accept: node.getAttribute('accept') || '', cls: node.getAttribute('class') || '', outer: node.outerHTML.slice(0, 200) })));
    console.log(JSON.stringify({ hasBtn, afterUrl, before: before.slice(0, 1200), after: afterText.slice(0, 1800), fileInputs }, null, 2));
  } finally {
    await context.close();
  }
})();
