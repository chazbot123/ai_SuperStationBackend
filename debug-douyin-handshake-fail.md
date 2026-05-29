# [OPEN] douyin-handshake-fail

## 症状
- 点击“抖音立即登录”后，平台账号列表没有新增抖音账号。
- 当前真实运行服务目录为 `D:\zhilin_project\`。

## 已知现象
- `runtimeSession` 多次进入 `failed`
- `.runtime/bitbrowser/bitbrowser.store.json` 中 `extensionInstanceId/tabId/handshakeAt` 都为空
- `runtimeCommands` 为空

## 当前假设
1. `content.js` 已注入页面，但没有读到 `ai_superweb_runtime_session_id`
2. `content.js` 发出了消息，但 `background.js` 没有收到或没有进入 `syncRuntimeBridgeSession`
3. `background.js` 收到消息，但调用 `/api/bitbrowser/extension/ready` 失败
4. 扩展握手失败后，fallback 执行了，但当前 debug target 中没有 `creator.douyin.com` 页面

## 本轮计划
1. 在 `content.js` 记录 runtime 参数解析结果
2. 在 `background.js` 记录 page-ready/tick 接收与 ready 调用结果
3. 在 `publishing-bitbrowser.service.ts` 记录 fallback 失败的具体原因
