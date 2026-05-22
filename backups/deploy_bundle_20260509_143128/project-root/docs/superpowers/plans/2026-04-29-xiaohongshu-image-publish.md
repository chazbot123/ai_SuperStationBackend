# Xiaohongshu Image Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Xiaohongshu image-note auto publish to the existing publishing pipeline and convert each system tag into a real platform tag by clicking the first visible suggestion candidate.

**Architecture:** Keep draft payload generation in `PublishingService`, enable Xiaohongshu in the supported auto-publish gate, and implement a Xiaohongshu-specific browser automation path in `PlatformLoginBrowserService`. Use service-layer tests for payload behavior and support gating, then verify the selector-driven flow manually against a live logged-in browser session.

**Tech Stack:** NestJS 11, TypeScript, Prisma, Playwright Core, Jest

---

### Task 1: Lock in service-layer Xiaohongshu draft behavior

**Files:**
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/publishing/publishing.service.ts`
- Create: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/publishing/publishing.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('PublishingService draft payloads', () => {
  it('supports Xiaohongshu as an auto-publish platform', () => {
    expect(service['isAutoPublishPlatformSupported'](LeadPublishPlatform.xiaohongshu)).toBe(true);
  });

  it('removes raw hashtag text from Xiaohongshu draft body and keeps draft tags separate', () => {
    const payload = service['buildPublishDraftPayload'](
      {
        title: '标题',
        body: '正文内容 #露营 #相机',
        tags: ['露营', '相机'],
        images: ['https://example.com/1.jpg'],
        videoUrl: null,
      } as any,
      LeadPublishPlatform.xiaohongshu,
    );

    expect(payload.body).toBe('正文内容');
    expect(payload.tags).toEqual(['露营', '相机']);
  });

  it('keeps Douyin body plain and unchanged by the Xiaohongshu support change', () => {
    const payload = service['buildPublishDraftPayload'](
      {
        title: '标题',
        body: '正文内容 #露营',
        tags: ['露营'],
        images: [],
        videoUrl: null,
      } as any,
      LeadPublishPlatform.douyin,
    );

    expect(payload.body).toBe('正文内容');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- --runInBand src/modules/publishing/publishing.service.spec.ts`
Expected: FAIL because the spec file does not exist and Xiaohongshu is not yet supported.

- [ ] **Step 3: Write minimal implementation**

```ts
const SUPPORTED_AUTO_PUBLISH_PLATFORMS = new Set<LeadPublishPlatform>([
  LeadPublishPlatform.douyin,
  LeadPublishPlatform.xiaohongshu,
]);
```

```ts
private normalizeDraftBody(body: string, tags: string[], platform: LeadPublishPlatform) {
  const normalized = body.replace(/\r\n/g, '\n').trim();
  const plainBody = this.removeTagsFromDraftBody(normalized);
  if (platform === LeadPublishPlatform.douyin || platform === LeadPublishPlatform.xiaohongshu) {
    return plainBody;
  }
  const formattedTags = this.formatDraftTags(tags, platform);
  return [plainBody, formattedTags].filter(Boolean).join('\n').trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- --runInBand src/modules/publishing/publishing.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/publishing/publishing.service.ts server/src/modules/publishing/publishing.service.spec.ts
git commit -m "feat: support xiaohongshu draft payloads"
```

### Task 2: Add a Xiaohongshu-specific browser publish flow

**Files:**
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/publishing/platform-login-browser.service.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('dispatches xiaohongshu publish jobs through a dedicated browser flow', async () => {
  const spy = jest
    .spyOn(service as any, 'publishXiaohongshuImagePost')
    .mockResolvedValue(undefined);

  await service.publish({
    accountId: 'a',
    sessionPath: 'b',
    platform: LeadPublishPlatform.xiaohongshu,
    jobId: 'job',
    title: '标题',
    body: '正文',
    tags: ['露营'],
    images: ['x.jpg'],
    videoUrl: null,
  });

  expect(spy).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- --runInBand src/modules/publishing/publishing.service.spec.ts`
Expected: FAIL because Xiaohongshu publish dispatch does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
switch (input.platform) {
  case LeadPublishPlatform.douyin:
    await this.publishDouyinContent(page, input, uploadFiles);
    break;
  case LeadPublishPlatform.xiaohongshu:
    await this.publishXiaohongshuImagePost(page, input, uploadFiles);
    break;
  default:
    throw new ConflictException('...');
}
```

```ts
private async publishXiaohongshuImagePost(
  page: Page,
  input: PlatformDraftSaveInput,
  uploadFiles: string[],
) {
  await this.enterXiaohongshuImagePublish(page);
  await this.uploadFiles(page, uploadFiles, 'image');
  await this.waitForUploadSettled(page);
  await this.fillFirst(page, [
    'div.input input.d-text',
    'input[placeholder*="标题"]',
    'input[type="text"]',
  ], input.title);
  await this.fillEditor(page, [
    'div.tiptap.ProseMirror',
    'div[role="textbox"]',
    'div[contenteditable="true"]',
  ], input.body);
  await this.tryAppendXiaohongshuTopics(page, input.tags);
  await this.clickXiaohongshuPublish(page);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- --runInBand src/modules/publishing/publishing.service.spec.ts`
Expected: PASS for the new dispatch coverage.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/publishing/platform-login-browser.service.ts
git commit -m "feat: add xiaohongshu browser publish flow"
```

### Task 3: Implement per-tag first-candidate selection for Xiaohongshu

**Files:**
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/publishing/platform-login-browser.service.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('tries each xiaohongshu tag in order and clicks the first visible suggestion', async () => {
  const tags = ['露营', '相机'];
  // stub page evaluate/locator interactions enough to verify per-tag iteration
  // expect helper to process both tags in sequence
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- --runInBand src/modules/publishing/publishing.service.spec.ts`
Expected: FAIL because `tryAppendXiaohongshuTopics` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
private async tryAppendXiaohongshuTopics(page: Page, tags: string[]) {
  const normalizedTags = Array.from(new Set(tags.map((tag) => tag.replace(/^#+/, '').trim()).filter(Boolean)));
  if (normalizedTags.length === 0) {
    return;
  }

  const editor = await this.findAndHighlightFirst(page, [
    'div.tiptap.ProseMirror',
    'div[role="textbox"]',
    'div[contenteditable="true"]',
  ]);

  for (const tag of normalizedTags) {
    await editor.click();
    await page.keyboard.type(` #${tag}`);
    const clicked = await this.clickFirstVisibleXiaohongshuTopicCandidate(page);
    if (!clicked) {
      this.logger.warn(`[xiaohongshu-topic] candidate not found for tag=${tag}`);
    }
    await page.waitForTimeout(300);
  }
}
```

```ts
private async clickFirstVisibleXiaohongshuTopicCandidate(page: Page) {
  const candidates = [
    '[class*="suggest"] [role="option"]',
    '[class*="topic"] [role="option"]',
    '[class*="popover"] [class*="item"]',
    '[class*="panel"] [class*="item"]',
    'div[role="listbox"] > *',
  ];

  for (const selector of candidates) {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    for (let index = 0; index < count; index += 1) {
      const item = locator.nth(index);
      if (await item.isVisible().catch(() => false)) {
        await this.humanClick(item);
        return true;
      }
    }
  }

  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- --runInBand src/modules/publishing/publishing.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/publishing/platform-login-browser.service.ts
git commit -m "feat: append xiaohongshu platform tags"
```

### Task 4: Live-flow verification against the real Xiaohongshu page

**Files:**
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/publishing/platform-login-browser.service.ts` (only if selectors need tuning after manual verification)
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/progress.md` (optional notes only if useful)

- [ ] **Step 1: Run the backend test suite for touched publishing specs**

Run: `npm.cmd test -- --runInBand src/modules/publishing/publishing.service.spec.ts`
Expected: PASS

- [ ] **Step 2: Run a backend build check**

Run: `npm.cmd run build`
Expected: Exit code 0

- [ ] **Step 3: Verify the live Xiaohongshu browser flow**

Run the existing publishing flow with a logged-in Xiaohongshu account and confirm:

```text
1. "发布图文笔记" entry is clicked
2. image upload succeeds
3. title input is filled
4. body editor is filled
5. each tag opens suggestions and clicks the first visible candidate
6. final "发布" button is clicked
```

- [ ] **Step 4: Tune selectors only if the live flow proves a mismatch**

If manual verification reveals selector misses, adjust only the Xiaohongshu-specific helper selectors and rerun Step 3.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/publishing/platform-login-browser.service.ts server/src/modules/publishing/publishing.service.ts server/src/modules/publishing/publishing.service.spec.ts
git commit -m "feat: support xiaohongshu image publishing"
```
