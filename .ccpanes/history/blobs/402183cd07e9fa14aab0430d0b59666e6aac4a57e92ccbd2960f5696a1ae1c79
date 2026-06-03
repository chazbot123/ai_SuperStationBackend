# Debug Session: xiaohongshu-login-recognition
- **Status**: [OPEN]
- **Issue**: 小红书登录后未识别成功，账号同步结果不稳定
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: `.dbg/trae-debug-log-xiaohongshu-login-recognition.ndjson`

## Reproduction Steps
1. 重载 BitBrowser 扩展
2. 点击小红书登录
3. 完成登录流程
4. 观察前端仍提示未识别成功

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| H1 | 小红书页面侧没有提取到有效身份字段 | High | Low | Rejected |
| H2 | 扩展同步时没有把页面提取结果带到后端 | High | Low | Confirmed |
| H3 | 后端 fallback 或清洗逻辑把有效字段降级掉了 | High | Low | Rejected |
| H4 | 后端已返回可用账号，但扩展完成态判断没放行 | Medium | Low | Confirmed |

## Log Evidence
- `pre-fix` 首次同步发生在登录页，扩展上报身份为空：日志 7/8/12 的 `accountName=""`、`displayName=""`
- `pre-fix` 服务端首次返回的是占位账号：日志 1 的 `responseAccountName="auto_xiaohongshu_7042c80515"`
- `pre-fix` 扩展把占位账号当成可完成：日志 2 的 `allowWeakIdentityCompletion=true`
- 页面稍后其实已经提取到真实身份：日志 18 的 `normalizedAccountName="49774975439"`、`normalizedDisplayName="支乌哦"`、`followerCount=16`
- 但在日志 18 之后，没有新的 `H2/H3/H4` 同步记录，说明 session 已提前完成，后续真实身份没有再次同步
- `post-fix` 已经能在真实身份出现后再次发起同步：新日志里 `syncLoginResult:start` 出现 `accountName="49774975439"`、`displayName="支乌哦"`、`sourceUrl="https://creator.xiaohongshu.com/new/home"`
- `post-fix` 当前验证失败不是识别问题，而是网络层失败：同一轮 `syncLoginResult:error` 连续报 `message="Failed to fetch"`
- 本地后端健康检查当时不可达，重启后恢复：`http://127.0.0.1:3001/api/bitbrowser/health` 现已返回 `200`

## Verification Conclusion
- 根因：小红书真实身份出现晚于首次同步；而扩展此前允许“弱身份完成”，导致收到 `auto_xiaohongshu_xxx` 后直接把登录 session 标记为完成，后续真实身份更新无法再同步
- 修复：撤掉小红书 `allowWeakIdentityCompletion` 的提前放行，改为只在拿到真实身份后完成登录同步
- 当前状态：修复后的同步时机已生效，但本轮验证被后端 `3001` 掉线打断，需要在后端恢复后再复现一次确认最终成功

## Current Round Hypotheses
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| H5 | 重新登录后前端/扩展没有真正创建新 login session，仍在复用旧 runtime session | High | Low | Pending |
| H6 | 扩展运行中的 background 脚本没有加载到最新代码，旧 session 终止逻辑未生效 | High | Low | Pending |
| H7 | 前端列表显示“未识别”其实是 401 过期 token 被映射成通用掉线文案，不是页面没提取到身份 | High | Low | Pending |
| H8 | 小红书页面这次确实没提取到真实身份，导致同步输入为空 | Medium | Low | Pending |

## Current Round Evidence
- 最新日志仍然命中旧会话：`runtimeSessionId="runtime_6tnf51cs"`、`sessionId="50dd48b6f197e3110d00751ff268d4d4"`
- 同一轮日志中页面身份其实存在：`accountName="49774975439"`、`externalAccountId="49774975439"`、`followerCount=16`
- 后端在 `before-verify-token` 之后立刻报 `verifyExtensionLoginToken:error`，错误是 `TokenExpiredError` / `jwt expired`
- 扩展侧收到的接口响应仍是 `401`，消息仍然是“扩展登录令牌无效或已过期”
- 目前还没有看到新的 `token-created` / 新 `runtimeSessionId` 证据，因此优先怀疑没有真正进入新 login session
