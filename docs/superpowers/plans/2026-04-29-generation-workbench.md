# Generation Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the social-post and product-image generation pages into a screenshot-aligned left-config/right-result workbench and add prompt polish powered by the existing text model pipeline.

**Architecture:** Extend the Nest AI module with a dedicated prompt-polish endpoint that reuses the existing text model provider infrastructure, then update the React workbench pages to consume that endpoint while reshaping their layout into a shared visual pattern. Keep persistence and generation flows unchanged so the new feature is additive and low-risk.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, NestJS 11, Prisma

---

### Task 1: Back-End Prompt Polish API

**Files:**
- Create: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/ai/dto/prompt-polish.dto.ts`
- Create: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/ai/ai.service.spec.ts`
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/ai/ai.controller.ts`
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/ai/ai.service.ts`

- [ ] **Step 1: Write the failing backend tests**

```ts
describe('prompt polish', () => {
  it('returns polished prompt for social post scene', async () => {
    // mock generateTextContent to return polished text
    // expect service output prompt/provider/model
  });

  it('throws when prompt is empty', async () => {
    await expect(service.promptPolish({ prompt: '   ', scene: 'social_post', modelConfig }))
      .rejects.toThrow('提示词不能为空');
  });

  it('throws when upstream returns empty content', async () => {
    // mock generateTextContent to return empty string
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- --runInBand ai.service.spec.ts`
Expected: FAIL because `promptPolish` and its DTO/route do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
@Post('prompt-polish')
promptPolish(@Body() dto: PromptPolishDto) {
  return this.aiService.promptPolish(dto);
}
```

```ts
async promptPolish(dto: PromptPolishDto) {
  const prompt = dto.prompt.trim();
  if (!prompt) throw new BadRequestException('提示词不能为空');
  // resolve text model config
  // build scene-specific system and user prompt
  // call generateTextContent
  // return { prompt: polished, provider, model }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- --runInBand ai.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/ai/dto/prompt-polish.dto.ts server/src/modules/ai/ai.controller.ts server/src/modules/ai/ai.service.ts server/src/modules/ai/ai.service.spec.ts
git commit -m "feat: add prompt polish api"
```

### Task 2: Front-End Prompt Polish Client Helpers

**Files:**
- Create: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/src/pages/generationWorkbench.test.ts`
- Create: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/src/pages/generationWorkbench.ts`
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/src/lib/ai.ts`

- [ ] **Step 1: Write the failing frontend tests**

```ts
it('blocks polish when prompt is blank', async () => {
  const result = await requestPromptPolish({
    prompt: '   ',
    scene: 'social_post',
    hasTextModel: true,
    invoke: vi.fn(),
  });
  expect(result.kind).toBe('validation_error');
});

it('returns polished text when api succeeds', async () => {
  const invoke = vi.fn().mockResolvedValue({ prompt: 'polished' });
  const result = await requestPromptPolish({ prompt: 'raw', scene: 'product_image', hasTextModel: true, invoke });
  expect(result.kind).toBe('success');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- src/pages/generationWorkbench.test.ts`
Expected: FAIL because helper file and API wrapper do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export async function polishPrompt(input) {
  return requestJson('/api/ai/prompt-polish', { ... });
}
```

```ts
export async function requestPromptPolish(...) {
  if (!hasTextModel) return { kind: 'validation_error', message: '...' };
  if (!prompt.trim()) return { kind: 'validation_error', message: '...' };
  const payload = await invoke();
  return { kind: 'success', prompt: payload.prompt };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- src/pages/generationWorkbench.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai.ts src/pages/generationWorkbench.ts src/pages/generationWorkbench.test.ts
git commit -m "feat: add prompt polish client helpers"
```

### Task 3: Social Post Workbench Layout

**Files:**
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/src/pages/Studio.tsx`

- [ ] **Step 1: Write the failing test**

```ts
it('requests polish and returns the polished prompt text', async () => {
  // covered through generationWorkbench helper in Task 2
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- src/pages/generationWorkbench.test.ts`
Expected: Existing coverage protects the new page polish flow while page layout still does not match manually.

- [ ] **Step 3: Write minimal implementation**

```tsx
// reshape into screenshot-like workbench
// left column sections: model / reference images / prompt / params
// right column widened result panel
// add polish button wired to requestPromptPolish(...)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- src/pages/generationWorkbench.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Studio.tsx
git commit -m "feat: refresh social generation workbench"
```

### Task 4: Product Image Workbench Layout

**Files:**
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/src/pages/StudioImages.tsx`

- [ ] **Step 1: Write the failing test**

```ts
it('uses product image scene when polishing prompt', async () => {
  // covered through helper-level scene assertion in Task 2
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- src/pages/generationWorkbench.test.ts`
Expected: Existing helper coverage stays red until product scene support is wired in implementation.

- [ ] **Step 3: Write minimal implementation**

```tsx
// apply the same workbench shell
// keep left-side order fixed
// move product metadata into parameter section
// add product-scene polish button
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm.cmd test -- src/pages/generationWorkbench.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/StudioImages.tsx
git commit -m "feat: refresh product generation workbench"
```

### Task 5: End-to-End Verification

**Files:**
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/docs/progress.md` (only if needed)

- [ ] **Step 1: Run backend targeted tests**

Run: `npm.cmd test -- --runInBand ai.service.spec.ts`
Expected: PASS

- [ ] **Step 2: Run frontend targeted tests**

Run: `npm.cmd test -- src/pages/generationWorkbench.test.ts`
Expected: PASS

- [ ] **Step 3: Run frontend build**

Run: `npm.cmd run build`
Expected: exit 0

- [ ] **Step 4: Manually inspect the running pages**

Run against:
- `http://localhost:5174/studio/social`
- `http://localhost:5174/studio/images`

Expected:
- left panel order is model / uploads / prompt / params
- right result panel is visibly larger
- polish button is present and interactive

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: add prompt polish and generation workbench"
```
