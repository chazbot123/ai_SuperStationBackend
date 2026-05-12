const { chromium } = require("playwright-core");
(async () => {
  const sessionPath = "D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/.runtime/publishing-platform-sessions/cmoiaf42m0001fgu982qay3zp";
  const executablePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  const context = await chromium.launchPersistentContext(sessionPath, { headless: true, executablePath });
  try {
    const page = context.pages().find((item) => !item.isClosed()) || await context.newPage();
    await page.goto("https://creator.douyin.com/creator-micro/content/publish", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const result = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input')).map((node) => ({
        type: node.getAttribute('type') || '',
        accept: node.getAttribute('accept') || '',
        cls: node.getAttribute('class') || '',
        hidden: node.hidden,
        disabled: node.disabled,
        outer: node.outerHTML.slice(0, 300),
      }));
      const uploadNodes = Array.from(document.querySelectorAll('[class*="upload"], [class*="Upload"], button, div, span')).map((node) => ({
        text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
        cls: node.getAttribute('class') || '',
        tag: node.tagName,
      })).filter((item) => item.text.includes('点击上传') || item.text.includes('拖入此区域') || /upload/i.test(item.cls)).slice(0, 50);
      return { url: location.href, inputs, uploadNodes };
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await context.close();
  }
})();
