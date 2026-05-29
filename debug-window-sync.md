# Debug Session: window-sync

Status: OPEN

## Symptoms
- 平台账号登录后，后台列表出现很慢
- 登录成功后，BitBrowser 窗口名没有按平台账号名更新
- 删除平台账号后，对应窗口没有关闭

## Hypotheses
- H1: 登录成功后并没有稳定进入“重命名/关窗”代码分支，链路提前返回或被吞错。
- H2: 后端发给 BitBrowser 的 `browser/update` / `browser/close` 请求成功语义与实际运行行为不一致。
- H3: 当前运行窗口对应的 `profileId` 与仓库存储/账号落库记录不一致，导致改名和关窗打到了旧 profile。
- H4: 平台账号列表显示慢的根因在扩展侧同步触发时机，页面信息和 Cookie 采集要等多次重试后才满足条件。

## Plan
- 给登录同步、改名、关窗三条链路加运行时日志
- 复现一次登录和删除
- 对照日志确认是“没调用”“调用失败”还是“接口成功但行为不生效”
