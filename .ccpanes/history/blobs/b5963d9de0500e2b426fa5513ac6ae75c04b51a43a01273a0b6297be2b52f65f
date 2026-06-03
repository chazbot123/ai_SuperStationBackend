# Debug Session: xiaohongshu-publish-submit

## Status
- OPEN

## Scope
- 目标：定位小红书进入编辑页后，最后一步未真正发布的原因。
- 边界：只补最终发布前后的运行时日志，不修改前半段发布业务逻辑。

## Symptoms
- 已进入小红书编辑页。
- 最终未看到成功发布结果。
- `runtime` 停留在发布页，`command` 为 `acked`，但没有 `completed` 或 `failed`。

## Hypotheses
- H1: 发布按钮 selector 未命中，实际未点击到发布按钮。
- H2: 发布按钮已命中，但按钮处于禁用状态，点击不会触发提交。
- H3: 点击发布后被页面校验拦截，页面存在错误提示但当前未记录。
- H4: 点击后已触发提交，但 `waitForHints()` 未覆盖当前实际成功/失败文案。

## Evidence
- 待补充

## Actions
- 核对小红书最后一步代码与已有日志点。
- 在点击发布前后补按钮状态与页面提示日志。
- 复现后对比按钮状态、点击结果和页面提示。
