const { chromium } = require('playwright-core');
(async () => {
  const sessionPath = 'D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/.runtime/publishing-platform-sessions/cmoiaf42m0001fgu982qay3zp';
  const executablePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const context = await chromium.launchPersistentContext(sessionPath, { headless: true, executablePath });
  try {
    const page = context.pages().find((item) => !item.isClosed()) || await context.newPage();
    await page.goto('https://creator.douyin.com/creator-micro/content/publish', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(5000);
    const inputs = await page.locator('input').evaluateAll((nodes) => nodes.map((node) => ({
      type: node.getAttribute('type') || '',
      accept: node.getAttribute('accept') || '',
      cls: node.getAttribute('class') || '',
      id: node.getAttribute('id') || '',
      name: node.getAttribute('name') || '',
      placeholder: node.getAttribute('placeholder') || '',
      hidden: node.hidden,
      disabled: node.disabled,
      style: node.getAttribute('style') || '',
    })));
    const uploadLike = await page.locator('[class*="upload"], [class*="Upload"], text=点击上传, text=或直接将视频文件拖入此区域').evaluateAll((nodes) => nodes.map((node) => ({
      tag: node.tagName,
      text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
      cls: node.getAttribute('class') || '',
    })).slice(0, 100));
    console.log(JSON.stringify({ inputs, uploadLike }, null, 2));
  } finally {
    await context.close();
  }
})();
