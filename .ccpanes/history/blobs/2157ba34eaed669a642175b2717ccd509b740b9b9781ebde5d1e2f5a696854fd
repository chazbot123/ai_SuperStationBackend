[OPEN] douyin-home-return

# 调试目标

- 症状：抖音发布再次失败，页面退回 `home`
- 期望：进入上传/发布链路后继续执行，不回到 `home`
- 当前阶段：仅取证，不修改业务逻辑

# 当前假设

- H1：页面真实发生了 `upload -> home` 回跳，不是 background 没发命令
- H2：runtime dispatch / page-ready 时机过早，命令在错误页面执行
- H3：登录态或平台校验失效，进入上传页后被平台强制带回 `home`
- H4：旧的 pending publish / resume 逻辑误触发，覆盖了当前页面状态
- H5：`.dbg` 接收链异常，导致现象判断基于不完整日志

# 取证计划

- 检查 `.dbg` 最近日志是否持续写入
- 检查 `server/.runtime/bitbrowser/bitbrowser.store.json` 最近 runtime / command
- 对照 background / content 的已存在调试点判断命令链和页面跳转链

# 当前进度

- 已创建调试会话文件
- 尚未修改业务逻辑
- 已确认 `7777` 调试接收器当前未监听
- 已发现新样本：`runtime_a7ucx740 / cmd_51ah5w25`
- 已确认该样本中：
- 命令状态为 `acked`
- runtime 状态为 `ready`
- 页面到达 `https://creator.douyin.com/creator-micro/content/upload?default-tab=3`
- 当前缺口：没有这次样本对应的 `.dbg` 扩展侧后续日志，暂不能证明是否又从 upload 回退到 home
- 已恢复调试接收器并抓到完整新样本：`runtime_8d0oiw9g / cmd_yc4jnzhn`
- 新样本证据：
- 后端为抖音发布下发的 `targetUrl` 仍是 `https://creator.douyin.com/creator-micro/home`
- content 在 `home` 页收到并开始执行 `PUBLISH_EXECUTE`
- 页面随后经历 `home -> content/upload?default-tab=3 -> content/post/image?... -> home`
- `pending publish` 在命令执行前为空，说明不是旧恢复逻辑误触发

# 假设结论

- H1：确认。页面真实发生了 `home -> upload/post -> home` 回跳
- H2：确认。当前命令入口仍在 `home` 页启动，发布执行不是从上传页入口开始
- H3：未确认。日志已证明有页面回跳，但还未证明是否由抖音登录态/风控校验直接触发
- H4：基本排除。旧 pending publish 恢复链未误触发
- H5：排除。此次已抓到完整新日志
