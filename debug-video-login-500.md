# Debug Session: video-login-500 [OPEN]

## Symptoms
- 点击视频号“重新登录”后，前端仍显示 `Internal server error`
- 点击“活跃账号”后，状态识别仍不稳定
- 点击小红书“重新登录”后，账号信息没有正确回填到平台列表

## Expected
- 视频号重新登录应复用原绑定 profile，并返回可读错误或成功打开登录窗口
- 活跃账号结果应正确识别登录态，不出现异常聚合
- 小红书重新登录完成后，应正确写回账号名、展示名等身份信息

## Hypotheses
1. `startPlatformExtensionLogin()` -> `startLoginRuntime()` 链路中存在普通异常，未转成业务异常，最终被包装为 500
2. 视频号账号绑定的 `externalGroupId / profileBinding / owner` 未正确命中原 profile，导致重登打开失败
3. 小红书扩展同步登录时上报的身份字段为空或弱值，后端 fallback 采集也未命中真实页面
4. 保活接口返回结构或保活采集结果与前端展示预期不一致，导致“活跃账号没识别成功”

## Plan
1. 启动 Debug Server
2. 在视频号重登、保活接口、小红书登录回填链路加最小埋点
3. 请用户按路径复现
4. 分析日志后再做最小修复

## Evidence
- `video-login-500` 新会话未生成日志文件，但旧会话日志在复现时间点继续更新，说明当前本地运行中的后端进程仍是旧代码，未加载本次新埋点
- 旧日志 `trae-debug-log-douyin-login-no-reaction.ndjson` 在时间戳 `1780303938212` 记录到：
  - `bitbrowser.service.ts:prepareOwnerRuntime:lock-released-on-error`
  - `taskId = publishing-login:wechat_mp:B:1780303937804`
  - `profileId = 0e41ce0404a4473a990e6fceb5ae6d03`
  - `error = 浠婃棩鎵撳紑绐楀彛娆℃暟宸茶揪涓婇檺`
- 该错误为乱码，但语义可对应 BitBrowser “今日打开窗口次数已达上限”
- 同一时段前端仅记录：
  - `src/lib/publishing.ts:startExtensionPlatformLogin:error`
  - `error = Internal server error`
- 说明视频号当前不是“找不到原 profile”，而是“命中了原 profile，但 BitBrowser 打开窗口阶段失败，前端只看到了被包装后的 500”
- 同时间段小红书 / 抖音日志只出现了 `bitbrowser.gateway:openProfile:before`，没有对应 `openProfile:after`
- 这说明它们也卡在 BitBrowser 打开 profile 阶段，和视频号属于同类底层问题
