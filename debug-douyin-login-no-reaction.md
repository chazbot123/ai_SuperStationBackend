# [OPEN] douyin-login-no-reaction

## 症状
- 点击抖音登录后，只打开 BitBrowser 客户端。
- 没有自动打开抖音登录页，也没有进一步登录反应。

## 复现路径
- 打开平台登录页。
- 点击抖音登录。
- 观察 BitBrowser 是否仅启动客户端而未进入抖音登录页。

## 当前假设
- H1: 前端点击后没有成功调用后端 `extension-login/start`，链路停在本地 Agent 拉起 BitBrowser。
- H2: 后端已创建 runtime，但 `openPage` 没真正打开目标抖音页面。
- H3: 扩展已收到 runtime tick，但没有成功 pull 到 `LOGIN_EXECUTE` 或命令被立即失败。
- H4: 扩展没有把当前 tab 识别成抖音页面，导致登录会话未建立也未触发同步。
- H5: BitBrowser Local API 或 3012 bridge 有一段请求失败，但前端没有把错误显式展示出来。

## 调试计划
- 先补最小埋点，只加运行时日志，不改业务逻辑。
- 复现一次抖音登录。
- 按日志证据淘汰假设。
- 再做最小修复并二次验证。
