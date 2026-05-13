# 平台登录说明

## 做什么
- 平台登录页同时支持两条入口：
  - 本地扩展登录
  - 官方 OAuth 登录

## 在哪里
- 页面：`src/pages/PublishingPlatformLogin.tsx`
- 后端入口：`server/src/modules/publishing/publishing.controller.ts`
- 后端逻辑：`server/src/modules/publishing/publishing.service.ts`

## 怎么做
- 本地扩展登录：
  - 点击“发起平台登录”
  - 打开对应平台官网
  - 扩展回传 Cookie
- 官方 OAuth 登录：
  - 点击“连接新频道”
  - 当前先展示全平台占位卡片
  - 抖音、快手、B 站、微信公众号已预留官方 OAuth 入口
  - 前端调用 `GET /api/publishing/platform-accounts/official-oauth/start`
  - 后端返回平台官方授权地址
  - 浏览器新开页跳转到平台授权页，完成后回调并自动保存账号

## 当前配置
- `PLATFORM_OAUTH_APP_BASE_URL`
- `DOUYIN_OPEN_CLIENT_KEY`
- `DOUYIN_OPEN_CLIENT_SECRET`
- `DOUYIN_OPEN_SCOPE`
- `KUAISHOU_OPEN_APP_ID`
- `KUAISHOU_OPEN_APP_SECRET`
- `KUAISHOU_OPEN_SCOPE`
- `BILIBILI_OPEN_CLIENT_ID`
- `BILIBILI_OPEN_CLIENT_SECRET`
- `BILIBILI_OPEN_SCOPE`
- `WECHAT_OPEN_COMPONENT_APP_ID`
- `WECHAT_OPEN_COMPONENT_APP_SECRET`
- `WECHAT_OPEN_AUTH_TYPE`
- `WECHAT_OPEN_PRE_AUTH_CODE`
- `WECHAT_OPEN_COMPONENT_ACCESS_TOKEN`
- `WECHAT_OPEN_BIZ_APP_ID`

## 当前边界
- 小红书、微信视频号、TikTok、YouTube、Twitter、Facebook、Instagram、Threads、Pinterest、LinkedIn 当前先做灰色占位
- 抖音、快手、B 站、微信公众号已接官方 OAuth
- 微信公众号必须先具备第三方平台票据与预授权码链路，否则会提示配置缺失
- 本地扩展登录链路不受影响
