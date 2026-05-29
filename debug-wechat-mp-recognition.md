[OPEN] wechat-mp-recognition

# Debug Session

- Session ID: `wechat-mp-recognition`
- Started: 2026-05-29
- Scope:
  - 视频号登录后账号识别不正确

# Rules

- Steps 1-4 only collect runtime evidence
- No business logic change before instrumentation evidence
- First logical diff must be instrumentation only

# Hypotheses

1. 扩展在视频号页面提取到的账号文本本身不正确。
2. 视频号文本前缀清洗或平台关键词过滤误伤了有效账号。
3. 服务端在 `accountName / externalAccountId / displayName` 的取值优先级上选错了字段。
4. 登录链路仍保留了占位账号 `pending_wechat_mp...`，真实账号没有成功覆盖。
5. 当前错误已经体现在运行时 store / 登录结果里，可直接从现有数据定位。

# Evidence Plan

- 检查扩展视频号资料提取逻辑
- 检查服务端视频号身份清洗与落库映射
- 读取当前运行时 store 和账号落库数据，确认识别结果在哪一层变错

# Status

- Current phase: evidence collection
- Next action: inspect extraction and persisted account data
