[OPEN] multi-platform-login

## 症状
- 点击小红书登录完成后，平台账号列表没有展示出来。
- 登录成功后，窗口名没有改成“平台名 + 账号名”。
- 视频号也存在相同现象。

## 本轮假设
- H1：小红书、视频号扩展已完成 page-ready，但没有成功绑定到 runtimeSession，导致后续 ready / complete-command / 入库链路都没走通。
- H2：扩展已经把登录结果回传到 bridge，但后端按平台写入平台账号时因为字段缺失、平台映射或去重条件不一致，导致未入库。
- H3：登录成功后后端确实执行了“改窗口名”分支，但 BitBrowser 对当前平台 profile 的 update/partial 调用失败，或成功后运行中窗口标题不刷新。
- H4：小红书、视频号的 content/background 提取账号标识字段与抖音不同，当前同步逻辑拿不到稳定 accountName / externalAccountId，导致同一登录会话无法完成闭环。
- H5：平台登录成功事件已经发生，但 complete-command 没有完成，runtimeSession 长时间停在 awaiting_extension / acked，导致列表与窗口名都不会进入最终状态。

## 计划
- 先读本次复现后的运行时日志和 store，不修改业务逻辑。
- 只在证据不足的位置补最小埋点。
- 证据确认后再做最小修复。
