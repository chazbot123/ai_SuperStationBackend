# 调研记录

## 当前项目现状
- 入口页面主要是 `建材.html`，另有 `apple-scroll.html` 作为另一个独立页面。
- 页面样式和脚本均内联在 HTML 中，尚未形成模块化前端工程。
- 资源主要分布在 `assets/` 与 `tp/`。
- 根目录存在多个 Python 脚本、测试文本和 Markdown 文件，明显带有处理素材或临时产物性质。

## 已识别的整理方向
- 保留页面入口与正式资源。
- 将历史脚本、草稿文档、临时文本移出根目录或归档。
- 为后续 API 接入预留 `src/`、`services/`、`types/`、`components/` 等工程化位置。

## 已完成整理
- 正式入口已调整为 `index.html`。
- 实验页已移动到 `pages/experiments/apple-scroll.html`。
- 页面正式图片统一归到 `assets/images/landing`。
- 产品图统一归到 `assets/images/products`。
- 原始素材统一归到 `assets/images/raw`。
- 历史 Python 脚本归档到 `scripts/archive`。
- 根目录测试文本已删除。

## 框架判断
- 当前页面仍是单 HTML 内联样式与脚本，不适合继续承载真实 API 和持续迭代。
- 后续若接真实 API，至少应迁移到 `Vue 3 + Vite + TypeScript`。
- 若未来重点是 SEO、多页面落地和服务端渲染，优先考虑 `Nuxt 3`。

## 2026-05-07 恢复交互补充
- 旧稿完整交互逻辑已保存在 `docs/legacy-home.html`，包含滚动动画、作品集筛选、案例详情弹层、悬浮客服和市场切换。
- 旧稿中存在缺失图片引用：`assets/images/products/prod2.png`，当前项目内未找到对应文件。
- `assets/images` 当前只有 `landing` 目录；若要让旧稿在新项目里原样跑起来，需要把这些图片作为前台静态资源直接暴露。
- 恢复旧稿全部交互的最低风险做法，是在新项目里原样承载旧 HTML，而不是本轮继续拆成大量 React 组件。

## 2026-05-07 客服接口接入补充
- 前台客服可直接复用公开接口：`POST /api/support/public/sessions`、`GET /api/support/public/sessions/:id`、`POST /api/support/public/sessions/:id/messages`、`POST /api/support/public/sessions/:id/handoff`、`GET /api/support/public/sessions/:id/queue`。
- 会话创建接口需要：`visitorSessionId`，可选 `visitorName`、`visitorContact`、`sourcePage`。
- 发消息接口只需要 `message`；后端返回完整会话，消息列表已包含访客消息、AI 回复、系统消息。
- 旧稿聊天面板当前是纯前端模拟回复，替换为真实客服接口时可直接重绘 `messages`，无需自己拼接假消息。
