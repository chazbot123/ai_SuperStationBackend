# Xiaohongshu Image Publish Design

## Background

The project already has a browser-driven publishing flow for platform accounts and a working Douyin image publish path. Xiaohongshu account login and profile capture already exist, but automatic publish is still blocked at the final platform automation layer. The latest requirement is to support Xiaohongshu image-note publish and to convert each system tag into a real platform tag by triggering the platform suggestion list and clicking the first candidate item for each tag.

## Goal

- Support Xiaohongshu image-note auto publish in the existing one-click publishing pipeline.
- Reuse the current `draftTitle`, `draftBody`, `draftTags`, and `draftImages` payload shape.
- Convert each system tag into a platform-recognized Xiaohongshu tag by opening suggestions and clicking the first visible candidate.
- Keep the existing Douyin flow stable and isolated from Xiaohongshu-specific selectors.

## Non-Goals

- Do not build a cross-platform generic tag engine in this change.
- Do not redesign front-end publishing data structures.
- Do not expand this work to WeChat Channels or Kuaishou.
- Do not add broad front-end UI changes beyond what is needed for the existing backend flow to run.

## Approach Options

### Option A: Minimal inline Xiaohongshu support

Add Xiaohongshu directly into the current publish switch and place all selectors inline with minimal helper extraction.

Pros:
- Smallest code diff.
- Fastest path to a working publish flow.

Cons:
- Xiaohongshu logic would be harder to debug later.
- Selector maintenance would be mixed with unrelated platform logic.

### Option B: Platform-specific Xiaohongshu flow

Add Xiaohongshu to the supported auto-publish set, create a dedicated Xiaohongshu publish method, and add a dedicated tag append helper parallel to the Douyin topic helper.

Pros:
- Keeps Douyin and Xiaohongshu logic separated.
- Easier to refine selectors and retries per platform.
- Matches the current requirement closely without over-generalizing.

Cons:
- Slightly larger change than the minimal path.

### Option C: Shared platform tag action framework

Build a generic platform tag adapter abstraction and plug Xiaohongshu into it.

Pros:
- Best long-term reuse if many platforms need the same behavior.

Cons:
- More design and code cost than the current requirement justifies.
- Higher risk of disturbing the already-working Douyin path.

Recommended: Option B.

## Data Flow

`PublishingService.buildPublishDraftPayload()` remains the source of `draftTitle`, `draftBody`, `draftTags`, `draftImages`, and `draftVideoUrl`.

For Xiaohongshu:

- `draftTags` remain the normalized system tags array.
- `draftBody` should use the plain body with existing raw `#tag` text removed.
- Actual platform tag conversion happens inside browser automation, not in service-layer string formatting.

This keeps stored draft data stable while allowing platform-specific interaction behavior.

## Browser Automation Design

### Publish Entry

Xiaohongshu publish should open the creator homepage and enter the image-note flow by clicking the “发布图文笔记” card or equivalent publish CTA before file upload.

### Form Fill

The flow fills these fields in order:

1. Upload images.
2. Fill the title input.
3. Fill the rich-text editor body.
4. Append tags one by one as platform tags.
5. Scroll to and click the final publish button.

### Tag Conversion Rule

For each system tag:

1. Normalize to a plain tag name without leading `#`.
2. Focus the Xiaohongshu body editor.
3. Type `#标签名`.
4. Wait for the suggestion popup.
5. Click the first visible candidate item.
6. Continue to the next tag.

If suggestions do not appear, log the issue and keep the typed `#标签名` text as fallback instead of aborting the whole publish job.

### Candidate Selection Rule

The code should not require exact text matching for Xiaohongshu candidates. The selected behavior is always “first visible candidate item,” because the requirement is to convert each system tag into the first platform suggestion.

The candidate search must be global enough to catch portal/floating-layer DOM, not only descendants of the editor node.

### Publish Finalization

Before clicking the final publish button:

- Scroll toward the bottom action area.
- Re-locate the button after scrolling.
- Click only when it is visible and enabled.

The success check should accept either a clear publish success message or a navigation/result-state change that indicates the note was submitted successfully.

## Service-Layer Changes

- Add `LeadPublishPlatform.xiaohongshu` to the supported auto-publish set.
- Extend `PlatformLoginBrowserService.publish()` to dispatch Xiaohongshu to a dedicated publish method.
- Keep `normalizeDraftBody()` behavior for Xiaohongshu aligned with the current “plain body plus runtime tag conversion” approach by not re-appending formatted tag strings to the body.

## Error Handling

- If the Xiaohongshu publish entry card is missing, fail the job with a clear page-state error.
- If image upload fails, preserve the current job failure behavior.
- If a single tag cannot resolve to a suggestion candidate, log and continue.
- If the publish button cannot be found or clicked, mark the job failed with the captured message in `lastError`.

## Testing Strategy

### Service Tests

Add focused tests around `PublishingService.buildPublishDraftPayload()` and the supported-platform gate:

- Xiaohongshu becomes an allowed auto-publish platform.
- Xiaohongshu draft body strips raw `#tag` text instead of appending formatted tags.
- Douyin behavior remains unchanged.

### Browser-Service Tests

Given the current codebase, browser automation is better validated through targeted method-level unit coverage where feasible and manual observable runs for final selector verification.

### Manual Verification

Use an authenticated Xiaohongshu session to verify:

1. Entry into “发布图文笔记”.
2. Title and body fill.
3. Each tag triggers suggestions and clicks the first candidate.
4. Final publish button is reached and clicked.

## Risks

- Xiaohongshu editor and suggestion popup selectors may change frequently.
- Suggestion items may render in a floating layer outside the editor subtree.
- Timing is sensitive because tag suggestions appear after typing and may need short waits between tags.

## Acceptance Criteria

- A queued Xiaohongshu publish job can run through the same one-click publishing pipeline as Douyin.
- The Xiaohongshu job uploads images, fills title and body, and processes every system tag one by one.
- Each tag attempts to click the first platform suggestion candidate.
- Failures in a single tag suggestion do not automatically abort the whole publish flow.
- Douyin behavior remains available and unchanged from the user’s perspective.
