[OPEN] platform-login-link

## Goal
- 联调平台登录页到本地 Agent / BitBrowser / 扩展登录链路。

## Scope
- 仅收集运行时证据。
- 在确认根因前不改业务逻辑。

## Hypotheses
- H1: 平台登录页接口返回异常数据，前端进入错误分支。
- H2: 点击平台卡片后，没有真正发起到本地 Agent 的启动请求。
- H3: 后端登录入口命中了，但 A/B 槽位或共享 Profile 复用逻辑异常。
- H4: BitBrowser 已启动，但扩展桥接或 runtime session 未 ready。
- H5: 登录态或权限态异常，页面无法稳定进入联调入口。

## Evidence Log
- 2026-05-25: `http://127.0.0.1:5173` 返回 200。
- 2026-05-25: `http://127.0.0.1:3001/api/health` 返回 `{\"status\":\"ok\"}`。
- 2026-05-25: `http://127.0.0.1:3210/health` 返回本地 Agent 在线。
- 2026-05-25: `POST http://127.0.0.1:54345/health` 返回 BitBrowser Local API 在线。

## Next
- 复现 `publishing/platform-login` 页面。
- 观察登录后页面是否可进入、是否显示本地客户端已连接。
- 准备在最小范围内补运行日志，再做一次点击联调。
