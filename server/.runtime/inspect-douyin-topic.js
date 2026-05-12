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
    const topicBtn = page.locator('text=#添加话题').first();
    const hasTopicBtn = await topicBtn.count().catch(() => 0);
    if (hasTopicBtn) { await topicBtn.click().catch(() => {}); await page.waitForTimeout(1500); }
    const result = await page.evaluate(() => ({
      url: location.href,
      text: (document.body.innerText || '').slice(0, 2500),
      inputs: Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]')).map((node, index) => ({
        index,
        tag: node.tagName,
        placeholder: node.getAttribute('placeholder') || '',
        aria: node.getAttribute('aria-label') || '',
        cls: node.getAttribute('class') || '',
        dataPlaceholder: node.getAttribute('data-placeholder') || '',
        outer: node.outerHTML.slice(0, 220)
      })).slice(0, 80),
      buttons: Array.from(document.querySelectorAll('button, [role="button"], div, span')).map((node) => ({
        text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
        cls: node.getAttribute('class') || '',
        tag: node.tagName,
      })).filter((item) => item.text.includes('添加话题') || item.text.includes('发布') || item.text.includes('上传图文') || item.text.includes('话题')).slice(0, 80)
    }));
    console.log(JSON.stringify({ hasTopicBtn, ...result }, null, 2));
  } finally { await context.close(); }
})();
