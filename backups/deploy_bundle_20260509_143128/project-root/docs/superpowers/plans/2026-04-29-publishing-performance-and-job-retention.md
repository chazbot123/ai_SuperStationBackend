# Publishing Performance And Job Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve `/publishing` and `/publishing/platform-login` responsiveness while adding automatic retention-based cleanup for old publish records.

**Architecture:** Keep the existing `publishing` domain module, but separate read-only list APIs from expensive login-completion logic, paginate heavy list endpoints, and add a back-end scheduled cleanup worker for `LeadPublishJob`. The cleanup policy should be configuration-driven, skip active jobs, and default to removing only terminal-state records older than the retention window.

**Tech Stack:** React 18, TypeScript, Vite, NestJS 11, Prisma, PostgreSQL

---

### Task 1: Define the lean list API contract and retention policy

**Files:**
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/publishing/dto/list-platform-accounts-query.dto.ts`
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/publishing/dto/list-publishing-jobs-query.dto.ts`
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/publishing/dto/list-publishing-contents-query.dto.ts`
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/src/lib/publishing.ts`

- [ ] **Step 1: Write the failing DTO/client tests**

```ts
describe('publishing list query contracts', () => {
  it('accepts page and limit for publish jobs', () => {
    expect(true).toBe(false);
  });

  it('accepts loginStatus and autoComplete flags for platform accounts', () => {
    expect(true).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- --runInBand publishing.service.spec.ts`
Expected: FAIL because the new query properties and client wrappers do not exist yet.

- [ ] **Step 3: Define the target contract**

```ts
// list-platform-accounts-query.dto.ts
platform?: LeadPlatformStyle;
status?: PlatformAccountStatus;
loginStatus?: PlatformAccountLoginStatus;
autoComplete?: 'none' | 'pending';
page = 1;
limit = 20;
```

```ts
// list-publishing-jobs-query.dto.ts
platform?: LeadPlatformStyle;
status?: LeadPublishStatus;
contentId?: string;
page = 1;
limit = 20;
```

```ts
// front-end lib
listPublishingJobs({ accessToken, page, limit, status })
listPlatformAccounts({ accessToken, status, loginStatus, page, limit, autoComplete })
```

- [ ] **Step 4: Record retention assumptions in code comments and plan notes**

```ts
// only delete terminal-state jobs older than retention cutoff
const CLEANUP_TARGET_STATUSES = ['success', 'failed'] as const;
// default retention: 30 days unless overridden by env
```

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/publishing/dto/list-platform-accounts-query.dto.ts server/src/modules/publishing/dto/list-publishing-jobs-query.dto.ts server/src/modules/publishing/dto/list-publishing-contents-query.dto.ts src/lib/publishing.ts
git commit -m "plan prep: define publishing list query contract"
```

### Task 2: Make publishing read APIs cheap and predictable

**Files:**
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/publishing/publishing.controller.ts`
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/publishing/publishing.service.ts`
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/publishing/publishing.service.spec.ts`

- [ ] **Step 1: Write the failing back-end tests**

```ts
it('lists platform accounts without auto-completing pending sessions by default', async () => {
  await service.listPlatformAccounts(user, {});
  expect(tryAutoCompleteSpy).not.toHaveBeenCalled();
});

it('paginates publish jobs', async () => {
  const result = await service.listJobs(user, { page: 1, limit: 20 });
  expect(result.pagination.limit).toBe(20);
});

it('lists lead contents without embedding publishJobs by default', async () => {
  const result = await service.listContents(user, { page: 1, limit: 20, status: 'active' });
  expect(result.items[0].publishJobs).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- --runInBand publishing.service.spec.ts`
Expected: FAIL because the service still auto-completes pending accounts, returns unpaginated jobs, and serializes nested publish jobs for content list items.

- [ ] **Step 3: Implement the minimal service changes**

```ts
async listPlatformAccounts(user, query) {
  const items = await this.prisma.leadPlatformAccount.findMany({
    where: { ... },
    orderBy: [{ updatedAt: 'desc' }],
    skip: (query.page - 1) * query.limit,
    take: query.limit,
    include: leadPlatformAccountInclude,
  });

  const normalizedItems =
    query.autoComplete === 'pending'
      ? await Promise.all(items.map((item) => item.loginStatus === 'pending' ? this.tryAutoCompletePlatformLogin(item) : item))
      : items;

  return { items: normalizedItems.map((item) => this.serializePlatformAccount(item)), pagination: { ... } };
}
```

```ts
async listJobs(user, query) {
  const [items, total] = await Promise.all([
    this.prisma.leadPublishJob.findMany({ where, orderBy: [{ createdAt: 'desc' }], skip, take, include: leadPublishJobInclude }),
    this.prisma.leadPublishJob.count({ where }),
  ]);
  return { items: items.map((item) => this.serializePublishJob(item)), pagination: { page, limit, total } };
}
```

```ts
// for listContents only
const leadContentListInclude = {
  creator: { select: { id: true, username: true, displayName: true, role: true } },
} satisfies Prisma.LeadContentInclude;
```

- [ ] **Step 4: Add an explicit pending-account completion endpoint**

```ts
@Post('platform-accounts/:id/hosted-login/check')
checkPlatformLogin(@Req() req, @Param('id') id: string) {
  return this.publishingService.completePlatformLogin(req.user, id);
}
```

Use this route only when the client intentionally wants to resolve one pending session instead of piggybacking on every list request.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/publishing/publishing.controller.ts server/src/modules/publishing/publishing.service.ts server/src/modules/publishing/publishing.service.spec.ts
git commit -m "feat: optimize publishing read apis"
```

### Task 3: Add scheduled cleanup for old publish records

**Files:**
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/package.json`
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/app.module.ts`
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/publishing/publishing.module.ts`
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/publishing/publishing.service.ts`
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/publishing/publishing.service.spec.ts`
- Create: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/publishing/publishing-cleanup.service.ts`
- Create: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server/src/modules/publishing/publishing-cleanup.service.spec.ts`

- [ ] **Step 1: Write the failing cleanup tests**

```ts
it('deletes only success/failed jobs older than the cutoff', async () => {
  await cleanupService.cleanupExpiredPublishJobs();
  expect(deleteManySpy).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({
      status: { in: ['success', 'failed'] },
    }),
  }));
});

it('does not delete queued or running jobs even when old', async () => {
  await cleanupService.cleanupExpiredPublishJobs();
  expect(deleteManySpy.mock.calls[0][0].where.status.in).not.toContain('queued');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- --runInBand publishing-cleanup.service.spec.ts`
Expected: FAIL because the cleanup service and scheduler wiring do not exist.

- [ ] **Step 3: Add scheduler dependency and module wiring**

```ts
// package.json
"@nestjs/schedule": "^5.x"
```

```ts
// app.module.ts
ScheduleModule.forRoot()
```

```ts
// publishing.module.ts
providers: [PublishingService, PlatformLoginBrowserService, PublishingCleanupService]
```

- [ ] **Step 4: Implement the cleanup worker**

```ts
@Injectable()
export class PublishingCleanupService {
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupExpiredPublishJobs() {
    const retentionDays = this.resolveRetentionDays();
    if (retentionDays <= 0) return;
    const cutoff = subDays(new Date(), retentionDays);
    return this.prisma.leadPublishJob.deleteMany({
      where: {
        status: { in: [LeadPublishStatus.success, LeadPublishStatus.failed] },
        updatedAt: { lt: cutoff },
      },
    });
  }
}
```

Environment variables to support in the service:

```env
PUBLISH_JOB_RETENTION_DAYS=30
PUBLISH_JOB_CLEANUP_ENABLED=true
```

- [ ] **Step 5: Commit**

```bash
git add server/package.json server/src/app.module.ts server/src/modules/publishing/publishing.module.ts server/src/modules/publishing/publishing.service.ts server/src/modules/publishing/publishing.service.spec.ts server/src/modules/publishing/publishing-cleanup.service.ts server/src/modules/publishing/publishing-cleanup.service.spec.ts
git commit -m "feat: add publish job retention cleanup"
```

### Task 4: Update `/publishing` and `/publishing/platform-login` to use the cheaper APIs

**Files:**
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/src/lib/publishing.ts`
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/src/pages/Publishing.tsx`
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/src/pages/PublishingPlatformLogin.tsx`
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/src/pages/publishingPlatformLoginActions.ts`
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/src/pages/publishingPlatformLoginActions.test.ts`

- [ ] **Step 1: Write the failing front-end tests**

```ts
it('loads only the first page of publish jobs and contents on mount', async () => {
  expect(listPublishingContents).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
  expect(listPublishingJobs).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
});

it('polls only when there is a pending account and checks one account at a time', async () => {
  expect(checkHostedPlatformLogin).toHaveBeenCalledWith(expect.objectContaining({ id: 'pending_id' }));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm.cmd test -- src/pages/publishingPlatformLoginActions.test.ts`
Expected: FAIL because the new client call and reduced polling flow do not exist.

- [ ] **Step 3: Implement the lean front-end loading flow**

```ts
// Publishing.tsx
const [contentResult, jobResult, accountResult] = await Promise.all([
  listPublishingContents({ accessToken, status: 'active', page: 1, limit: 20 }),
  listPublishingJobs({ accessToken, page: 1, limit: 20 }),
  listPlatformAccounts({ accessToken, status: 'valid', loginStatus: 'authenticated', page: 1, limit: 50 }),
]);
```

```ts
// PublishingPlatformLogin.tsx
const result = await listPlatformAccounts({ accessToken, page: 1, limit: 50, autoComplete: 'none' });
```

```ts
// polling
// choose the oldest or first pending account id
// call explicit check endpoint for that id
// stop polling when no pending account remains
```

- [ ] **Step 4: Keep page UX stable while data volume shrinks**

```tsx
// Publishing.tsx
// render table as-is, but add pagination metadata placeholders if needed
// no nested publishJobs dependency from content rows
```

```tsx
// PublishingPlatformLogin.tsx
// preserve current actions: restart, validate, delete, manual complete
// replace background whole-list auto-complete with single-account check loop
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/publishing.ts src/pages/Publishing.tsx src/pages/PublishingPlatformLogin.tsx src/pages/publishingPlatformLoginActions.ts src/pages/publishingPlatformLoginActions.test.ts
git commit -m "feat: reduce publishing page load cost"
```

### Task 5: Verification and rollout notes

**Files:**
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/docs/superpowers/plans/2026-04-29-publishing-performance-and-job-retention.md`
- Modify: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/docs/progress.md` (only if the team uses it for rollout notes)

- [ ] **Step 1: Run targeted back-end tests**

Run: `npm.cmd test -- --runInBand publishing.service.spec.ts`
Expected: PASS

Run: `npm.cmd test -- --runInBand publishing-cleanup.service.spec.ts`
Expected: PASS

- [ ] **Step 2: Run targeted front-end tests**

Run: `npm.cmd test -- src/pages/publishingPlatformLoginActions.test.ts`
Expected: PASS

- [ ] **Step 3: Run app builds**

Run: `npm.cmd run build`
Expected: exit 0

Run: `npm.cmd run build`
Workdir: `D:/zhilin_project/AI-SuperWeb/AI-SuperWeb/server`
Expected: Nest build exit 0

- [ ] **Step 4: Manual verification**

Check:
- `http://localhost:5175/publishing` first paint is faster and shows only recent contents/jobs
- `http://localhost:5175/publishing/platform-login` no longer hangs while scanning pending sessions
- a pending account can still be completed manually
- a seeded old `success` job older than retention gets removed by cleanup
- a seeded old `running` job remains untouched

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "feat: optimize publishing performance and add job retention"
```

## Self-review checklist

- Spec coverage: includes platform account list decoupling, `/publishing` first-screen slimming, and scheduled deletion of old publish records.
- Placeholder scan: no `TODO`/`TBD`; all tasks identify concrete files and commands.
- Type consistency: retention cleanup targets `LeadPublishJob`; read-path optimization stays within the existing `publishing` module.

## Implementation notes

- Retention should be configurable, but the safe default is `30` days.
- Cleanup should target only terminal states by default: `success`, `failed`.
- If the business later wants to retain failure history longer than success history, split the env vars rather than hard-coding that branch now.
- If `/publishing` still feels slow after these changes, the next likely step is adding DB-level indexes for `LeadPlatformAccount(creatorId, updatedAt)` and a composite index optimized for the exact list filters now used by the client.
