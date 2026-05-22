# Review Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight unified review center for material reviews and product reviews with sub-navigation, route-synced tabs, focused detail views, and approve/reject actions.

**Architecture:** Keep `/reviews` as the shared review-center shell, split material and product review behaviors into focused panel components, and sync the active panel through nested routes and tabs. Reuse existing front-end stores and UI primitives instead of adding a new audit domain backend, while adding targeted tests around route behavior and review interactions.

**Tech Stack:** React, TypeScript, React Router, Zustand, Vitest, Testing Library

---

## File Structure

### Existing files to modify

- `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\App.tsx`
  Purpose: add review-center child routes and redirects.
- `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\components\layout\Sidebar.tsx`
  Purpose: convert the review-center nav item into an expandable parent with `素材审核` and `商品审核` children.
- `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\Reviews.tsx`
  Purpose: reduce to a route-aware page shell that renders tabs and the active review panel.

### New files to create

- `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\reviewCenter\MaterialReviewsPanel.tsx`
  Purpose: material-review filters, list, detail drawer, and approve/reject actions.
- `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\reviewCenter\ProductReviewsPanel.tsx`
  Purpose: product-review filters, list, detail drawer, and approve/reject actions.
- `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\reviewCenter\ReviewStatusBadge.tsx`
  Purpose: shared badge mapping for pending, approved, and rejected review states.
- `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\reviewCenter\reviewCenterModels.ts`
  Purpose: pure helpers for mapping `ContentItem` into material-review view models and for shared review filter utilities.
- `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\reviewCenter\reviewCenterModels.test.ts`
  Purpose: pure-function coverage for material-review mapping and filter logic.
- `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\Reviews.test.tsx`
  Purpose: route-aware review-center shell coverage.

### Existing tests to evaluate and potentially extend

- `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\Publishing.test.ts`
  Purpose: reference style for page tests in this repo.

## Task 1: Map review-center routes and shell behavior

**Files:**
- Modify: `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\App.tsx`
- Modify: `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\Reviews.tsx`
- Test: `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\Reviews.test.tsx`

- [ ] **Step 1: Write the failing route-shell test**

```tsx
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import Reviews from "@/pages/Reviews";

test("shows the material tab by default for /reviews", () => {
  render(
    <MemoryRouter initialEntries={["/reviews"]}>
      <Routes>
        <Route path="/reviews" element={<Reviews />} />
      </Routes>
    </MemoryRouter>
  );

  expect(screen.getByRole("tab", { name: "素材审核" })).toHaveAttribute("data-state", "active");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- src/pages/Reviews.test.tsx`

Expected: FAIL because the current `Reviews.tsx` does not expose route-synced tab behavior.

- [ ] **Step 3: Write the minimal review-shell implementation**

```tsx
const reviewTabs = [
  { key: "materials", label: "素材审核", to: "/reviews/materials" },
  { key: "products", label: "商品审核", to: "/reviews/products" },
];

const pathname = location.pathname;
const activeTab = pathname.startsWith("/reviews/products") ? "products" : "materials";
```

Add nested routing in `App.tsx`:

```tsx
<Route path="reviews" element={<RequirePageAccess pageKey="reviews"><Reviews /></RequirePageAccess>}>
  <Route index element={<Navigate to="/reviews/materials" replace />} />
  <Route path="materials" element={<MaterialReviewsPanel />} />
  <Route path="products" element={<ProductReviewsPanel />} />
</Route>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm.cmd test -- src/pages/Reviews.test.tsx`

Expected: PASS for the default material-tab route case.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/pages/Reviews.tsx src/pages/Reviews.test.tsx
git commit -m "feat: add review center shell routes"
```

## Task 2: Add shared material-review mapping helpers

**Files:**
- Create: `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\reviewCenter\reviewCenterModels.ts`
- Test: `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\reviewCenter\reviewCenterModels.test.ts`

- [ ] **Step 1: Write the failing model test**

```ts
import { describe, expect, it } from "vitest";
import { buildMaterialReviewItem } from "@/pages/reviewCenter/reviewCenterModels";

it("classifies a content item with images and body as an image-text material submission", () => {
  const result = buildMaterialReviewItem({
    id: "c1",
    type: "copy",
    title: "春季素材单",
    body: "封面文案",
    images: ["https://example.com/a.png"],
    videoUrl: undefined,
    reviewStatus: "submitted",
    submittedByName: "张三",
    submittedAt: "2026-04-29T08:00:00.000Z",
    platformStyle: "xiaohongshu",
    createdAt: "2026-04-29T07:00:00.000Z",
    syncedToLeads: false,
  });

  expect(result.materialTypeLabel).toBe("图文");
  expect(result.status).toBe("pending");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- src/pages/reviewCenter/reviewCenterModels.test.ts`

Expected: FAIL because the helper file does not exist yet.

- [ ] **Step 3: Write the minimal mapping implementation**

```ts
export type ReviewListStatus = "pending" | "approved" | "rejected";

export function buildMaterialReviewItem(content: ContentItem) {
  const hasImages = content.images.length > 0;
  const hasVideo = Boolean(content.videoUrl);
  const materialTypeLabel = hasImages && hasVideo ? "混合" : hasVideo ? "视频" : hasImages ? "图文" : "文案";

  return {
    id: content.id,
    title: content.title,
    body: content.body,
    images: content.images,
    videoUrl: content.videoUrl ?? null,
    tags: extractTags(content.body),
    materialTypeLabel,
    status: mapMaterialStatus(content.reviewStatus),
    submittedByName: content.submittedByName ?? "-",
    submittedAt: content.submittedAt ?? content.createdAt,
    rejectReason: content.rejectReason ?? null,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm.cmd test -- src/pages/reviewCenter/reviewCenterModels.test.ts`

Expected: PASS for the mapping case.

- [ ] **Step 5: Commit**

```bash
git add src/pages/reviewCenter/reviewCenterModels.ts src/pages/reviewCenter/reviewCenterModels.test.ts
git commit -m "feat: add review center model helpers"
```

## Task 3: Implement the material-review panel with TDD

**Files:**
- Create: `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\reviewCenter\MaterialReviewsPanel.tsx`
- Modify: `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\Reviews.test.tsx`
- Modify: `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\Reviews.tsx`

- [ ] **Step 1: Write the failing panel interaction test**

```tsx
test("filters material submissions by status and opens the detail view", async () => {
  renderReviewRoute("/reviews/materials");

  await userEvent.selectOptions(screen.getByLabelText("状态"), "approved");
  expect(screen.getByText("已通过")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "查看详情" }));
  expect(screen.getByText("提交信息")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- src/pages/Reviews.test.tsx`

Expected: FAIL because the material panel and its filters do not exist.

- [ ] **Step 3: Write the minimal panel implementation**

```tsx
const rawItems = useAppStore((s) => s.contents);
const items = rawItems.map(buildMaterialReviewItem);
const filteredItems = items.filter(matchesMaterialFilters);

<Select aria-label="状态" value={statusFilter} onChange={...}>
  <option value="pending">待审核</option>
  <option value="approved">已通过</option>
  <option value="rejected">已驳回</option>
</Select>
```

Add approve/reject actions with `updateContent` in the detail drawer:

```tsx
updateContent(selected.id, {
  reviewStatus: "approved",
  rejectReason: null,
  reviewedAt: new Date().toISOString(),
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm.cmd test -- src/pages/Reviews.test.tsx`

Expected: PASS for status filtering and detail opening.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Reviews.tsx src/pages/Reviews.test.tsx src/pages/reviewCenter/MaterialReviewsPanel.tsx
git commit -m "feat: add material review panel"
```

## Task 4: Implement the product-review panel with TDD

**Files:**
- Create: `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\reviewCenter\ProductReviewsPanel.tsx`
- Modify: `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\Reviews.test.tsx`

- [ ] **Step 1: Write the failing product-review test**

```tsx
test("shows product review details and allows reject entry", async () => {
  renderReviewRoute("/reviews/products");

  await userEvent.click(screen.getByRole("button", { name: "查看详情" }));
  expect(screen.getByText("商品主图")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "驳回" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- src/pages/Reviews.test.tsx`

Expected: FAIL because the product review panel does not exist yet.

- [ ] **Step 3: Write the minimal product-panel implementation**

```tsx
const products = useProductsStore((s) => s.items);
const pendingOrReviewed = products.filter((item) => ["submitted", "live", "rejected"].includes(item.status));
```

Wire actions:

```tsx
await approveProduct(selected.id);
await rejectProduct(selected.id, rejectReason);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm.cmd test -- src/pages/Reviews.test.tsx`

Expected: PASS for product-detail rendering and reject action visibility.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Reviews.test.tsx src/pages/reviewCenter/ProductReviewsPanel.tsx
git commit -m "feat: add product review panel"
```

## Task 5: Update sidebar review-center navigation

**Files:**
- Modify: `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\components\layout\Sidebar.tsx`
- Modify: `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\Reviews.test.tsx`

- [ ] **Step 1: Write the failing navigation test**

```tsx
test("shows review-center sub-navigation entries", () => {
  renderSidebar();

  expect(screen.getByText("素材审核")).toBeInTheDocument();
  expect(screen.getByText("商品审核")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- src/pages/Reviews.test.tsx`

Expected: FAIL because the sidebar still renders a single review-center link.

- [ ] **Step 3: Write the minimal sidebar implementation**

```tsx
const [reviewsExpanded, setReviewsExpanded] = useState(location.pathname.startsWith("/reviews"));
const reviewsActive = location.pathname.startsWith("/reviews");
```

Render children:

```tsx
<SubNavItem to="/reviews/materials" label="素材审核" />
<SubNavItem to="/reviews/products" label="商品审核" />
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm.cmd test -- src/pages/Reviews.test.tsx`

Expected: PASS for review-center child navigation visibility.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/pages/Reviews.test.tsx
git commit -m "feat: split review center sidebar navigation"
```

## Task 6: Refine shared review visuals and regression coverage

**Files:**
- Create: `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\reviewCenter\ReviewStatusBadge.tsx`
- Modify: `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\reviewCenter\MaterialReviewsPanel.tsx`
- Modify: `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\reviewCenter\ProductReviewsPanel.tsx`
- Modify: `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb\src\pages\Reviews.test.tsx`

- [ ] **Step 1: Write the failing status-visual test**

```tsx
test("renders unified pending and rejected badges in both review tabs", async () => {
  renderReviewRoute("/reviews/materials");
  expect(screen.getByText("待审核")).toBeInTheDocument();

  renderReviewRoute("/reviews/products");
  expect(screen.getByText("已驳回")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm.cmd test -- src/pages/Reviews.test.tsx`

Expected: FAIL because the panels do not yet share a single badge mapping.

- [ ] **Step 3: Write the minimal shared visual implementation**

```tsx
export default function ReviewStatusBadge({ status }: { status: ReviewListStatus }) {
  if (status === "pending") return <Badge variant="amber">待审核</Badge>;
  if (status === "approved") return <Badge variant="green">已通过</Badge>;
  return <Badge variant="red">已驳回</Badge>;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm.cmd test -- src/pages/Reviews.test.tsx`

Expected: PASS for shared badge rendering.

- [ ] **Step 5: Commit**

```bash
git add src/pages/reviewCenter/ReviewStatusBadge.tsx src/pages/reviewCenter/MaterialReviewsPanel.tsx src/pages/reviewCenter/ProductReviewsPanel.tsx src/pages/Reviews.test.tsx
git commit -m "feat: unify review status visuals"
```

## Final Verification

- [ ] Run focused review-center tests

Run: `npm.cmd test -- src/pages/Reviews.test.tsx`

Expected: PASS

- [ ] Run review-center model tests

Run: `npm.cmd test -- src/pages/reviewCenter/reviewCenterModels.test.ts`

Expected: PASS

- [ ] Run the related existing review page test surface if added during implementation

Run: `npm.cmd test -- src/pages/Reviews.test.tsx src/pages/reviewCenter/reviewCenterModels.test.ts`

Expected: PASS with 0 failures

## Spec Coverage Check

- Unified review center with two tabs: covered in Tasks 1, 3, and 4.
- Sidebar split into `素材审核` and `商品审核`: covered in Task 5.
- Material review as submission-level approval: covered in Tasks 2 and 3.
- Product review with approve/reject only: covered in Task 4.
- Shared lightweight interactions and status visuals: covered in Task 6.
- No overview page, no batch review, no workflow engine: preserved by scope of Tasks 1-6.
