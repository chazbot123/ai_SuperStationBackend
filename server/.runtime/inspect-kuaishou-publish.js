const { chromium } = require('playwright-core');
(async () => {
  const sessionPath = 'D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/.runtime/publishing-platform-sessions/cmoi8exa500017ou9tceae5jw';
  const executablePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const context = await chromium.launchPersistentContext(sessionPath, { headless: true, executablePath });
  try {
    const page = context.pages().find((item) => !item.isClosed()) || await context.newPage();
    await page.goto('https://cp.kuaishou.com/article/publish/video?origin=www.kuaishou.com', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(4000);
    const result = await page.evaluate(() => ({
      url: location.href,
      title: document.title,
      text: (document.body.innerText || '').slice(0, 3500),
      buttons: Array.from(document.querySelectorAll('button, [role="button"], div, span')).map((node) => ({
        text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
        cls: node.getAttribute('class') || '',
        tag: node.tagName,
      })).filter((item) => item.text && (item.text.includes('发布') || item.text.includes('保存') || item.text.includes('草稿') || item.text.includes('话题') || item.text.includes('标题'))).slice(0, 120),
      inputs: Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]')).map((node) => ({
        tag: node.tagName,
        placeholder: node.getAttribute('placeholder') || '',
        cls: node.getAttribute('class') || '',
        aria: node.getAttribute('aria-label') || '',
        outer: node.outerHTML.slice(0, 220),
      })).slice(0, 120)
    }));
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await context.close();
  }
})();
