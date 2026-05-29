# [OPEN] douyin-home-return

## 现象

- 抖音图文发布命令已下发并被页面 ack。
- 页面会短暂进入 `content/upload`，随后又回到 `home`。
- 当前不会再在 `home` 和发布页之间来回跳，但仍未稳定进入编辑页。

## 期望

- 从创作者首页进入图文发布后，稳定停留在图文编辑页。
- 后续继续执行上传素材、填写内容、点击发布。

## 当前阶段

- Step 1: 仅收集证据，不修改业务逻辑。
- Step 2: 已补 `pending publish` 持久化/恢复链路取证，等待复现后判定具体断点。
- Step 3: 已根据证据做最小修复，抖音图文入口改为先走稳定上传路由，再回退首页点击入口。
- Step 4: 已根据最新证据修复恢复时机，`content.js` 在脚本初始化时立即尝试恢复发布执行。
- Step 5: 已修复 `page-resume` 重复直跳 upload 路由，避免在已进入上传页时再次 `gotoUrl(upload)` 导致回退 `home`。

## 待验证假设

- 假设 1：`enterDouyinPublishFromHome()` 已触发跳转，但跳转后页面初始化未完成，脚本过早结束或上下文被替换。
- 假设 2：首页点击命中的仍不是最终稳定入口，导致抖音先打开上传路由又主动回退到 `home`。
- 假设 3：`isOnDouyinPublishPage()` 的成功判定过早，把“短暂命中 upload URL”误当成“已进入编辑态”。
- 假设 4：`content.js` 的恢复逻辑虽然不再循环，但新页面没有成功继续接管这次发布执行。
- 假设 5：页面侧还存在未记录的导航/网络异常，导致进入上传路由后马上被平台重定向回首页。

## 已有证据

- 最新一轮日志里已看到 `executeImage:start`，但没有 `executeImage:after-enter`。
- 同一轮里只看到一次 `content/upload?default-tab=3` 心跳，随后立即回到 `home`。
- 最新取证已确认：
  - `persistPendingBitBrowserPublish:success` 已出现，说明挂起会话已成功写入。
  - 没有任何 `content/*` 页的恢复日志，说明问题不在 pending 存储，而在进入编辑页前就回退。
  - `runtime_dzmo23ma` 中出现了 `home -> upload -> home` 的短暂跳转，但仍没有 `executeImage:after-enter`。
  - `runtime_t6wzzu3a` 中已看到 `enterDouyinImagePublishFromHome:direct-route-start`，也看到了 `content/upload` 心跳。
  - 但仍没有 `direct-route-result`，说明旧执行上下文在路由切换后未返回，且新页面恢复触发太晚。
  - `runtime_ja69e4oa` 中已确认：
    - `page-resume` 成功在 `content/upload?default-tab=3` 接住执行。
    - 之后又再次出现 `enterDouyinImagePublishFromHome:direct-route-start`。
    - 紧接着页面回到 `home`，且没有 `direct-route-result`。
  - 这说明新问题不是恢复失败，而是恢复后重复进入“直跳 upload 路由”，把已到达的上传页重新打断。
- 当前已经补充：
  - `persistPendingBitBrowserPublish:success|failed`
  - `readPendingBitBrowserPublish:empty|invalid|success|parse-failed`
  - `maybeResumePendingBitBrowserPublish:skip-*|start`

## 本轮修复

- 文件：`scripts/browser-extension/platform-login-helper/publish-automation.js`
- 调整：
  - 抖音图文入口先直接跳转 `content/upload?default-tab=3`
  - 仅当该路由未稳定停留时，再回退到首页卡片点击逻辑
  - 新增“发布路由稳定停留”判定，避免把一闪而过的 upload 路由误当成成功进入
- 文件：`scripts/browser-extension/platform-login-helper/content.js`
- 调整：
  - 页面脚本初始化时立即执行一次 `maybeResumePendingBitBrowserPublish()`
  - 保留原有 `300ms / 1200ms / load` 恢复尝试，缩短短暂上传页的恢复空窗
- 文件：`scripts/browser-extension/platform-login-helper/publish-automation.js`
- 调整：
  - 如果当前已经在 `content/upload` 或 `content/publish`，则不再重复执行 `gotoUrl(upload)`
  - 只在真正仍停留 `home` 时才走“直跳 upload”逻辑
