# Debug Session: keepalive-cookie-timeout

- Status: [OPEN]
- Started: 2026-06-02
- Symptom: 点击“活跃账号”失败，提示“扩展保活采集 Cookie 超时”
- Scope: BitBrowser 保活 runtime bridge / 扩展命令拉取 / cookie 回传链路

## Hypotheses

1. `KEEPALIVE_COLLECT` 命令没有成功入队或没有被扩展拉取
2. runtime session 未真正 ready，导致扩展没有进入命令派发阶段
3. 扩展未命中 `KEEPALIVE_COLLECT` 分支，或命令状态没有正确 ack/complete
4. 扩展已执行采集，但 `complete-command` 请求失败，后端一直等待超时
5. `collectPlatformCookies()` / `collectPlatformCookiePayload()` 执行失败或卡住

## Plan

1. 为保活 runtime 命令链路加最小调试埋点
2. 重启后端并让用户复现一次
3. 对比 pre-fix 运行时日志，确认阻塞点
4. 基于证据做最小修复

## Log Evidence

- `K1` 已确认保活命令成功入队：`runtime_395emfwa / cmd_uvldomr1`
- `K3` 显示失败会话的命令状态一直停在 `queued`
- `K4` 显示该命令在 20s 后仍为 `queued`，不是采集函数内部报错
- store 记录中：
  - 失败会话 `runtime_395emfwa` 的 `lastHeartbeatAt = 2026-06-02T02:01:13.655Z`
  - 命令 `cmd_uvldomr1` 的 `createdAt = 2026-06-02T02:01:19.121Z`
  - 说明命令入队时扩展心跳已停，扩展没有继续拉命令
- 成功会话 `runtime_c7ioz81l / cmd_cpzbm1g0` 已进入 `completed`

## Conclusion

- 已排除“命令未入队”
- 已排除“采集函数内部直接报错”
- 当前确认根因：保活把 `KEEPALIVE_COLLECT` 入队放在 `simulate + sleep + inspectProfileFromDebugPort` 之后，时机过晚，部分会话在此之前已停止心跳，导致命令永远留在 `queued`

## Fix Direction

- 最小修复：将扩展 cookie 采集前置到 `inspectProfileFromDebugPort` 之前
- 保留页面状态识别，但不再让 DevTools 检查阻塞扩展采集命令的入队时机
