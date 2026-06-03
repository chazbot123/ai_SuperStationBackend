# Debug Session: douyin-publish-idle [OPEN]

## Symptom
- 点击发布后，已打开抖音创作者页面，但页面没有继续自动执行发布动作。

## Expected
- 打开目标页面后，扩展应完成 runtime 绑定、拉取发布命令，并触发页面自动化发布流程。

## Hypotheses
- H1: 后端已创建 runtime session，但扩展侧没有成功 `pull-command`。
- H2: 扩展已拉到命令，但没有成功 dispatch 到当前抖音标签页。
- H3: 页面 content script 已收到命令，但 `executePublishSession` 未真正启动或中途异常退出。
- H4: 当前运行中的扩展不是仓库最新代码，导致已有修复未实际生效。
- H5: runtime session / tab 绑定错位，命令发到了错误标签页或失效标签页。

## Plan
- 先补最小插桩，覆盖后端下发命令、扩展拉取命令、扩展分发命令、页面接收命令 4 个关键点。
- 用户复现一次发布。
- 对照日志判断卡点，再做最小修复。

## Status
- 已创建调试会话。
- 已启动 Debug Server: `http://127.0.0.1:7777`
- 已补发布链路插桩文件：
  - `scripts/browser-extension/platform-login-helper/background.js`
  - `scripts/browser-extension/platform-login-helper/content.js`
- 已确认链路证据：
  - 后端已创建并排队发布命令
  - 扩展后台已 dispatch 命令
  - 页面 content 已收到命令并启动 `executePublishSession`
  - 命令停留在 `acked`，未进入 `completed/failed`
- 已确认卡点：
  - 扩展发布自动化存在卡死风险，导致 runtime 锁不释放
  - 素材拉取步骤使用浏览器侧 `fetch(url)`，对 `localhost:9000` 一类地址存在长时间挂起风险
- 已实施修复：
  - `publish-automation.js` 增加素材下载超时
  - `content.js` 增加 BitBrowser 发布总超时，超时后回传失败
  - 已手动关闭卡住的 `runtime_62rpz6by` 释放当前锁
