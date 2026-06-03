[OPEN] publish-automation-bugs

# Debug Session

- Session ID: `publish-automation-bugs`
- Started: 2026-05-29
- Scope:
  - Douyin one-click publish enters editor then suddenly refreshes back to home
  - Xiaohongshu one-click publish fills title/body but stops before final publish click

# Rules

- Steps 1-4 only collect runtime evidence
- No business logic change before instrumentation evidence
- First logical diff must be instrumentation only

# Hypotheses

1. Douyin editor page is being interrupted by extension resume/recovery logic that navigates back to home.
2. Douyin editor page redirects by platform itself, but runtime command state is not reattached correctly after navigation.
3. Xiaohongshu publish flow lacks a final submit/click-publish implementation path.
4. Xiaohongshu final publish step exists, but selector or readiness detection for the publish button is wrong.
5. Xiaohongshu publish button remains disabled by unmet preconditions, and current runtime logs do not capture button state or validation blockers.

# Evidence Plan

- Instrument Douyin publish navigation transitions around editor/home/recovery path
- Instrument Xiaohongshu final publish decision path, including selector hit, button state, and blocker text
- Reproduce both flows and compare runtime logs

# Status

- Current phase: instrumentation planning
- Next action: inspect publish automation and add runtime debug points only
