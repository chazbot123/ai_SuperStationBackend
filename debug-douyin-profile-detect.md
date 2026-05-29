# [OPEN] douyin-profile-detect

## 现象
- 抖音账号登录后，平台账号列表仍显示 `auto_douyin_*`
- 头像、抖音号、粉丝信息未按真实账号回写

## 期望
- 扩展从抖音创作者页面识别出真实 `externalAccountId`、`displayName`、`avatarUrl`、`followerCount`
- 后端保存后，平台账号列表显示真实个人信息

## 假设
- H1: 扩展内容脚本在当前抖音创作者页面没有命中正确选择器，返回了空的账号信息
- H2: 扩展已识别到真实信息，但 `background.js -> sync` 请求体没有把关键字段传给后端
- H3: 后端收到了真实信息，但 `resolveExtensionAccountName()` 或后续保存逻辑把值回退成了 `auto_douyin_*`
- H4: 当前运行中的扩展不是最新版本，实际执行的仍是旧识别逻辑
- H5: 平台账号校验/自动刷新又把已识别的真实信息覆盖回了旧的兜底值

## 当前阶段
- 待加日志
- 待用户复现
- 待读取运行时证据
