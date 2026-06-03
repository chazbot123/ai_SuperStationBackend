# Debug Session: douyin-window-no-page

- Status: OPEN
- User symptom: 点击抖音登录后，只打开 BitBrowser 窗口，但没有真正打开抖音页面
- Scope:
  - `server/src/modules/publishing/**`
  - `server/src/modules/bitbrowser/**`
  - `scripts/browser-extension/platform-login-helper/**`

## Hypotheses

1. 后端已创建 runtime，但打开目标 URL 的步骤没有真正执行，窗口只停在空白或默认页。
2. 目标抖音登录 URL 已下发，但 `findDebugPageTarget/openPage` 命中了错误 tab，导致看起来像“只开窗不进抖音”。
3. BitBrowser 本地网关返回成功，但内部打开页面动作失败，当前链路没有把失败细节抛到前端。
4. 扩展 page-ready / runtime-ready 绑定未完成，后端过早认为窗口已就绪，实际抖音页未导航。
5. 登录页被平台或本地环境拦截后跳回空页/默认页，当前缺少 URL 级别取证。

## Plan

1. 检查抖音登录入口的 runtime 打开链路。
2. 对比已有抖音登录调试记录，确认是否已有同类根因。
3. 先补最小埋点，只记录 open-profile / open-page / target-url / debug-url / 当前页 URL。
4. 复现后根据日志判断是“没发起导航”还是“导航失败/跳走”。
