# Debug Session: keepalive-no-motion
- **Status**: [OPEN]
- **Issue**: 点击“活跃账号”后页面没有切到前台，也没有滚动或轻量交互，保活仍失败
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: `.dbg/trae-debug-log-keepalive-no-motion.ndjson`

## Reproduction Steps
1. 打开平台账号页
2. 点击“活跃账号”
3. 观察页面是否切到前台、是否滚动、是否发生轻量交互

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | 保活根本没执行到交互函数 | High | Low | Pending |
| B | 保活执行了，但命中了错误的 page target | High | Med | Pending |
| C | 交互打到了后台 tab，用户眼前窗口没被激活 | High | Med | Pending |
| D | 保活在 `openProfile/openPlatformHome` 前就提前失败了 | Med | Low | Pending |

## Log Evidence
- 已确认 `keepAliveDedicatedProfile` 确实执行到 `before-simulate-interaction`
- 已确认命中的 page target 为 `https://creator.douyin.com/creator-micro/home`
- 已确认 `bringToFront` 已返回，不是完全没执行
- 真正失败点是 `simulate-interaction-error = DevTools evaluate timeout`
- 初步结论：不是没选中页，而是原交互脚本过重，单次 `Runtime.evaluate` 在目标页超时

## Verification Conclusion
- pre-fix：保活交互卡在单次重 `Runtime.evaluate`，页面无可见动作
- post-fix：已将交互拆成三步轻量操作，待用户复现验证
