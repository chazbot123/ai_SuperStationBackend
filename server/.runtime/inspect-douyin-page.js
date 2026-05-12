const { chromium } = require('playwright-core');
(async () => {
  const sessionPath = 'D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/.runtime/publishing-platform-sessions/cmoiaf42m0001fgu982qay3zp';
  const executablePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const context = await chromium.launchPersistentContext(sessionPath, { headless: true, executablePath });
  try {
    const page = context.pages().find((item) => !item.isClosed()) || await context.newPage();
    await page.goto('https://creator.douyin.com/creator-micro/content/publish', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(5000);
    const url = page.url();
    const title = await page.title().catch(() => '');
    const buttons = await page.locator('button, [role="button"], .semi-button, a').evaluateAll((nodes) => nodes.map((node) => ({
      text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
      tag: node.tagName,
      cls: node.getAttribute('class') || '',
      aria: node.getAttribute('aria-label') || '',
    })).filter((item) => item.text || item.aria).slice(0, 200));
    const inputs = await page.locator('input, textarea, [contenteditable="true"]').evaluateAll((nodes) => nodes.map((node) => ({
      tag: node.tagName,
      placeholder: node.getAttribute('placeholder') || '',
      aria: node.getAttribute('aria-label') || '',
      cls: node.getAttribute('class') || '',
    })).slice(0, 100));
    const text = await page.locator('body').innerText().catch(() => '');
    console.log(JSON.stringify({ url, title, buttons, inputs, text: text.slice(0, 4000) }, null, 2));
  } finally {
    await context.close();
  }
})();
