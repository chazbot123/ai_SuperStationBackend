const { chromium } = require('../node_modules/playwright-core');
(async () => {
  const sessionPath = 'D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/.runtime/publishing-platform-sessions/cmoic1mba0003o8u9lhwgsfov';
  const executablePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const context = await chromium.launchPersistentContext(sessionPath, { headless: true, executablePath });
  try {
    const page = context.pages().find((item) => !item.isClosed()) || await context.newPage();
    await page.goto('https://creator.douyin.com/creator-micro/content/post/image?default-tab=3&enter_from=publish_page&media_type=image&type=new', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(3000);

    const collect = async (label) => {
      const data = await page.evaluate((phase) => {
        const text = (node) => (node.textContent || '').replace(/\s+/g, ' ').trim();
        const isVisible = (node) => {
          if (!(node instanceof HTMLElement)) return false;
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };
        const nodes = Array.from(document.querySelectorAll('input,div,li,span,button,[role="option"],[class*="topic"],[class*="search"],[class*="recommend"]'));
        return {
          phase,
          hits: nodes.filter((node) => {
            const t = text(node);
            const p = node instanceof HTMLInputElement ? (node.placeholder || '') : '';
            return isVisible(node) && (t.includes('话题') || t.includes('好物') || t.includes('推荐') || p.includes('话题'));
          }).map((node) => ({
            tag: node.tagName,
            cls: node.getAttribute('class') || '',
            role: node.getAttribute('role') || '',
            text: text(node),
            placeholder: node instanceof HTMLInputElement ? node.placeholder : '',
            outer: node.outerHTML.slice(0, 500)
          })).slice(0, 80)
        };
      }, label);
      console.log(JSON.stringify(data, null, 2));
    };

    await collect('before_click');
    const topicButton = page.locator('div.toolbar-button-spPS4r').filter({ hasText: '#添加话题' }).first();
    console.log('topicButtonCount=', await topicButton.count().catch(() => 0));
    if (await topicButton.count().catch(() => 0)) {
      await topicButton.click({ timeout: 5000 }).catch((e) => console.log('clickTopicButtonError=', e.message));
      await page.waitForTimeout(800);
    }
    await collect('after_click');

    const topicInput = page.locator('input[placeholder*="话题"], input[placeholder*="搜索"], input[placeholder*="输入"]').first();
    console.log('topicInputCount=', await topicInput.count().catch(() => 0));
    if (await topicInput.count().catch(() => 0)) {
      await topicInput.fill('好物推荐', { timeout: 5000 }).catch((e) => console.log('fillError=', e.message));
      await page.waitForTimeout(1500);
      await collect('after_fill');
    }
  } finally {
    await context.close().catch(() => undefined);
  }
})();
