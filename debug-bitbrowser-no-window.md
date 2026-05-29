[OPEN] BitBrowser login opens client only, no window

## Session
- session_id: `bitbrowser-no-window`
- started_at: `2026-05-25`
- repo_root: `D:\zhilin_project`

## Symptom
- 点击登录后只打开 BitBrowser 客户端。
- 没有打开具体窗口。

## Expected
- 点击登录后应创建或打开对应 BitBrowser 窗口，并进入平台登录页。

## Hypotheses
1. 后端在创建或打开 profile 前已失败。
2. BitBrowser Local API 可连接，但 `browser/update`、`browser/detail` 或 `browser/open` 返回异常。
3. 本地 Agent 只拉起了 BitBrowser 客户端，没有带起可用 profile。
4. 最近的窗口名规范化改动影响了已有 binding/profile 打开链路。

## Evidence Plan
- 先确认 `3001/3012/3210/54345` 是否在线。
- 读取后端最近日志，确认请求是否进入 `startPlatformExtensionLogin`。
- 对 BitBrowser Local API 做最小健康检查与 profile 打开链路检查。
- 必要时只加运行时插桩，不先改业务逻辑。

## Status
- pending evidence collection
