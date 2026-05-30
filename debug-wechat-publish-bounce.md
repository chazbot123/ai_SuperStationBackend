# [OPEN] wechat-publish-bounce

## 症状
- 视频号发布命令已下发
- 页面会进入 `https://channels.weixin.qq.com/platform/post/finderNewLifeCreate`
- 随后又回到 `https://channels.weixin.qq.com/platform`
- 最新已排除同页重复派发导致的“请求过于频繁”主因

## 预期
- 进入 `finderNewLifeCreate` 后稳定停留
- 内容脚本接住发布命令
- 继续上传、填写、发表

## 本轮假设
- H1: 内容脚本在 `finderNewLifeCreate` 页面拿不到待发布数据，导致页面虽进入创建页但自动化没有接管
- H2: 视频号创建页进入后立即触发页面内重定向或守卫，主动把页面打回 `platform`
- H3: 扩展消息已送达，但 `publishWechatMp()` 在创建页早期抛错或提前返回，导致未真正开始上传/填写
- H4: 创建页有平台侧错误提示或接口返回，当前埋点未覆盖，所以只看到页面回退

## 当前证据
- `runtime_2a6bwi3s` 已拉到 `PUBLISH_EXECUTE`
- 已进入 `finderNewLifeCreate`
- 随后退回 `platform`
- 另一路 `runtime_uddmbz8p` 为登录/页面心跳噪声，不是本次主发布链路

## 下一步
- 只补埋点，不改业务逻辑
- 补 3 类证据：
  - `finderNewLifeCreate` 页内是否真正收到并持有待发布命令
  - 页内是否出现错误提示、关键 DOM、history/hash/url 变化
  - `publishWechatMp()` 是否启动、是否早退、是否抛错

## 已完成
- 已在 `content.js` 补充视频号专项埋点：
  - 命令接收前后
  - pending 写入与清理
  - 创建页快照
  - `pagehide / beforeunload / visibilitychange / popstate / hashchange`
  - `history.pushState / history.replaceState`
- 当前尚未修改业务逻辑，等待下一次复现收集证据

## 新证据
- 视频号页面最终进入 `finderNewLifePostList`，页面侧发布已成功
- `publish-automation.js` 本身会在执行结束后发送 `status: "success"`
- 旧发布链路通过 `AI_SUPERWEB_EXTENSION_PUBLISH_STATUS -> syncPublishResult()` 更新作业
- 新 BitBrowser 链路通过 `AI_SUPERWEB_BITBROWSER_COMMAND_STATUS` 只收口 runtime command，未同步发布作业

## 根因结论
- 发布记录未收口成“已完成”的根因不是页面没成功，而是新 BitBrowser 状态消息缺少到 `syncPublishResult()` 的桥接

## 已修复
- 已在 `background.js` 为 `AI_SUPERWEB_BITBROWSER_COMMAND_STATUS` 补齐发布作业同步
- 新链路现在会把 `running / success / failed` 同步到 `/api/publishing/extension/publish-jobs/sync`
