# 调研记录

## 2026-04-30
- 当前“前台配置中心”入口位于 `src/components/layout/navigationLabels.ts`，导航路径为 `/personalization/*`
- 当前 `Personalization.tsx` 已收口为 `布局与模板 / 运营指标 / 行业与招商`
- 当前“运营指标”配置仅是页面局部 `useState(metricSeed)`，刷新即丢失，也未与 `appStore` 或预览联动
- 当前路由和权限仍以 `personalization` 为 pageKey；若直接改键名会扩大改动范围
- 后端已不再保留 `BusinessCards` 模块；超级站配置当前统一走 `super-site-settings` 的 `GET/PUT me`
- `SuperSiteSetting` 适合以“单用户唯一配置”建模；当前数组类配置先用 `Json` 落库，便于快速承接现有前端结构
- `AI企业名片` 已从 Prisma `BusinessCard` 表、RBAC `business_card` 页面键、前端菜单路由和超级站配置字段中移除
- Prisma 新模型生成后，Nest 构建若仍提示缺少 delegate，可先清理 `tsconfig.tsbuildinfo` 再重新构建

## 2026-05-01
- 合并冲突共 9 个文件，主要分为文档、Prisma 模型、AI 模块、前端 UI/页面四类
- `server/prisma/schema.prisma` 冲突本质是两条并行开发线：本地新增 `LeadContent/Publishing/CustomerManagement/Support`，远端新增 `VideoMainTask/VideoSubTask`
- `server/src/modules/ai/ai.controller.ts` 与 `ai.module.ts` 适合做并集合并，不应选单边
- `server/src/modules/ai/ai.service.ts` 是最大冲突点，既有本地图文/草稿能力，也有远端 AI 视频工作流
- `src/lib/ai.ts` 同时包含本地 `prompt-polish`、商品图草稿接口，以及远端视频任务接口，需统一导出
- `src/pages/VideoDrafts.tsx` 冲突是“同步获客内容池”与“视频任务状态/ETA 展示”两条前端行为并行

## 2026-05-02
- `src/store/videoDraftStore.ts` 当前是 `zustand persist`，存储键为 `video_drafts_v1`，视频草稿箱主数据仍是前端本地持久化
- `src/components/video/VideoGenerationWorkspace.tsx` 在生成视频前先本地 `prependDraft(next)`，后续通过 `updateDraft(...)` 写入 `taskId / status / videoUrl`
- `src/pages/VideoDrafts.tsx` 页面直接读取 `useVideoDraftStore().items`，不是走后端列表接口
- 后端当前只有 `VideoMainTask / VideoSubTask` 两张真人口播任务表，没有视频草稿表
- `server/src/modules/ai/ai.controller.ts` 已有图文草稿风格接口：`social-posts`、`product-image-drafts`；视频草稿适合继续挂在 `ai` 模块下，保持同样风格
- 视频草稿正式落库后，前端仍保留 `videoDraftStore` 作为页面缓存，但页面启动时会先从后端 `video-drafts` 接口回填
- 产品视频与真人口播视频共用 `VideoDraft` 表；真人口播原有 `VideoMainTask / VideoSubTask` 继续负责执行队列，不与草稿表冲突
- 生成页与草稿箱页的任务轮询已改为“查任务 -> 回写后端草稿 -> 同步本地缓存”，刷新页面后仍能恢复处理状态

## 2026-05-03
- 行业信息当前默认源定义在 `server/src/modules/super-site-settings/super-site-industry.types.ts`，现状为 `虎嗅 RSS / 36氪 RSS / 量子位 HTML / 雷峰网 HTML`
- `ListSuperSiteIndustryItemsQueryDto` 目前只支持 `page / limit / q / sourceType`，还不支持按 `sourceKey` 和日期范围筛选
- `SuperSiteIndustryService.listIndustryItems()` 已具备分页与 `sourceType` 过滤，适合继续追加 `sourceKey / publishedAt` 条件
- 已验证可访问 RSS：`qbitai.com/feed`、`leiphone.com/feed`、`infoq.cn/feed`、`ifanr.com/feed`、`sspai.com/feed`、`geekpark.net/rss`
- 已验证不可直接复用：`leiphone.com/rss` 返回 `404`，`leiphone.com/category/ai/feed` 返回 `500`，`xiaoyuzhoufm.com` 暂未确认可直接抓取的标准 RSS feed

## 2026-05-05
- `src/pages/Dashboard.tsx` 当前顶部已有 8 个数字卡片，但下方仍是 3 个说明型区块：`功能总览 / 审核概览 / 商品运营概览`
- `Dashboard` 当前直接依赖 `useAppStore().contents / publishJobs` 和 `useProductsStore().items`，适合先围绕“素材、发布、商品”做首版数据化改造
- 仓库内暂未发现现成图表库引用，做图应优先采用轻量组件或原生 `div`/`svg` 实现，避免新增重依赖
- 当前真实可复用的仪表盘数据源已确认包括：`products`、`publishing contents/jobs/platform accounts`、`customer leads`、`support conversations`、`knowledge documents`
- `appStore` 仍是本地 persist + seed 数据，不适合作为主仪表盘统计来源
- 仪表盘首版图表采用轻量 `div` 柱状图和 7 天趋势条图，无需新增依赖即可完成数据化展示
- 图文文案生成统一走 `server/src/modules/ai/ai.service.ts` 的 `generateCopy()`；`社媒图文生成` 和 `商品图与详情图生成` 都复用这一套文案提示词
- 当前 `generateCopy()` 系统提示词偏“通用营销文案”，只约束了 JSON 结构、标题长度、正文不带标签，未明确要求“小红书软种草”的节奏、句式、口语化和爆点结构
- 1级代理页面访问主控制点有两层：后端 `DEFAULT_PERMISSION_MATRIX` 决定默认 pageKey 可见，前端 `RequirePageAccess` 与 `Sidebar` 按 pageKey 控制路由和菜单
- “模型配置”虽然对应 `rules` pageKey，但 `Rules.tsx` 页面内还额外写死了 `user?.roleKey === "main_company"`，只改权限矩阵仍无法给 1级代理真正开放
- 模型配置当前后端仍是全局共享实现：`listActiveModelConfigs / listSavedModelConfigs / activateModelConfig / getEffectiveModelConfig` 都直接读写 `modelConfigCache` 的全局 key，没有 `userId` 维度
- 当前图文草稿图片只有 `images: string[]`，没有单独来源字段；手动上传图片统一走 `products/upload-image`，会落到 MinIO 托管公开地址，可用“是否为托管 URL”区分手传图与模型生成图
- 一级代理图文提审当前后端确实会把 `reviewStage` 改为 `submitted`，提交动作本身没问题
- 主公司审核中心素材页当前完全依赖前端本地 `appStore.contents`，没有读取 `SocialGeneratedPost / ProductImageDraft / VideoDraft`，因此主公司账号看不到一级代理提审记录
- 当前目录结构是双层 `AI-SuperWeb`：Git 根目录位于 `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb`
- 外层 `D:\zhilin_project\AI-SuperWeb` 还包含一份 `.tools` 与顶层 `.gitignore`，并不只是单纯空壳目录
- 当前仓库内原先只有两份环境示例文件：根目录 `.env.docker.example` 与 `server/.env.example`
- 当前已将根目录标准环境示例统一为 `.env.example`，`.env.docker.example` 已删除
- 当前已补 `docs/environment-files.md` 说明根目录和 `server/` 环境文件分工
- 若把项目整体迁移到 `D:\zhilin_project`，属于跨出当前固定仓库根目录的目录迁移，不能在当前工作区规则下直接执行

## 2026-05-07
- 超级站前台第一版目标模块为：`运营指标 / 行业新闻 / 产品 / 客服`
- `super-site-settings/public` 当前只开放了 `GET :userId/industry-items`，公开行业资讯已可直接复用
- `support/public` 当前已开放 `POST sessions`、`GET sessions/:id`、`POST sessions/:id/messages`、`POST sessions/:id/handoff`、`GET sessions/:id/queue`，超级站客服第一版主链路已具备
- `products.controller.ts` 顶部使用了 `@UseGuards(JwtAuthGuard)`，现有 `/api/products` 全部是后台鉴权接口，超级站前台不能直接复用
- 超级站运营指标当前存放在 `SuperSiteSetting.siteMetrics`，但还缺一个公开读取整站配置的接口；前台若要渲染运营指标、特价商品、模块开关，至少要补公开 settings 接口
- 第一版若产品模块展示真实商品，后端至少要补 `public products list/detail`；若只展示超级站配置里的 `specialOffers`，则可先跟随公开 settings 一起返回
- `src/pages/Assets.tsx` 当前知识库列表其实已经接了 `removeKnowledgeDocument()`，只是删除逻辑原先以内联方式写在列表按钮里
- 本轮已把知识库删除动作收口为统一 `handleDeleteDocument()`，列表和详情抽屉都能触发，并补了 `删除中...` 状态
- `KnowledgeService.buildChunks()` 当前会先调用 `buildChunksWithAi()`，内部通过 `AiService.generateTextReply()` 尝试做智能语义切片
- 智能切片失败时会回退到固定规则切片：按段落聚合到约 `800` 字，段间保留约 `120` 字重叠
- 知识库 embedding 当前不是大模型向量；入库时写死为 `embeddingModel: local_hash_v1`，并由 `buildEmbedding()` 生成本地哈希向量
- 某些文档只生成 1 个切片的常见原因包括：解析后的有效文本较短、段落本就只有一个完整语义单元、或 OCR/解析抽出的内容偏少
- 当前代码真实状态与之前结论不一致：`KnowledgeService.buildChunks()` 现在直接返回 `buildChunksFallback(text)`，并未先调用 `buildChunksWithAi()`
- 现有固定切片仍是通用 `recursiveCharacterSplit`，主要依赖换行、句号、逗号和字符长度，不区分“手册 / 文档 / 公司简章 / FAQ / 制度 / 流程”这类长文结构
- 前端知识库页面当前没有切片策略配置 UI，切片策略调整可优先收敛在后端实现与页面说明文案
- `ZL_Supersite` 前台商品区当前在 `legacy-home.html` 中实现，原本是静态 HTML 卡片 + 运行时从 DOM 提取 `offerProjects`
- 后台/后端产品链路已完整：后台 `Products.tsx` 对应后端 `products` 模块，字段包含 `name / englishName / summary / description / priceText / specialOfferEnabled / originalPriceText / specialPriceText / specialTag / images / status`
- 前台商品区对接最小方案适合新增公开接口 `GET /api/products/public/:userId`，只返回指定账号下 `live` 商品，前台继续保留现有样式和详情/咨询交互
- `StudioDrafts.tsx` 的 `getVisibleImages()` 之前只接受 `http/https/data:image//根路径`，会把协议缺失 URL、协议相对 URL 或普通相对路径图片直接过滤掉
- 图文草稿编辑弹窗之前使用“过滤后的图片下标”执行删除和下载，但状态数组仍按原始 `editImages` 存储，存在明显索引错位风险
- `AiService.generateSocialPost()` 当前把 `generateImages()` 返回的 `urls` 直接写入草稿；在本轮修复前，后端没有先把这些上游图片地址固化到自有 MinIO
- `server/.env` 当前 `MINIO_ENDPOINT=127.0.0.1`，图片公开地址默认会被拼成 `http://127.0.0.1:9000/...`

## 2026-05-08
- `Publishing.tsx` 的“上传超级站”此前直接读取 `import.meta.env.VITE_SUPERSITE_URL`，不是后台可维护配置
- 现有 `super-site-settings` 的 `GET/PUT me` 已是最适合承接“超级站前台地址”的现成链路，无需新建独立设置模块
- `Personalization.tsx` 当前页面内仍写死“仅主公司可见”，即使路由权限放开，一级代理也会被页面内判断挡住
- 后端 `level1_agent` 默认 `personalization` 权限原本为 `false`；仅改常量不一定自动覆盖已有数据库权限记录
- `Login.tsx` 当前“快捷进入预设账号”完全是前端界面层能力，移除后不影响真实后端登录接口
- 登录前增加“同意并阅读用户协议”最小实现可直接收口在 `Login.tsx` 前端校验，无需改后端认证接口
- 用户协议阅读页可作为匿名公开路由挂在 `/user-agreement`，不需要登录态
- `PublishingService.publishContent` 原先在接口请求内串行 `await executeDraftSave(job.id)`，这是“页面卡住”的直接原因
- 发布记录页原先只在初始化时读取一次 `listPublishingJobs`，没有对 `queued/running` 任务自动轮询刷新
- 抖音链路最脆弱的 3 个点集中在：图文/视频模式切换、上传完成识别、发布成功结果页识别
- 仓库里已有 `scripts/debug-douyin-image-flow.cjs`，其中抖音调试选择器与正式实现一致，可作为稳定性修复参照
- 当前 `docker-compose.yml` 只定义了 `postgres / redis / minio` 三个基础服务容器，前端和后端应用仍按宿主机进程方式部署
- 根目录后台前端 `package.json` 默认端口是 `5173`，`ZL_Supersite/package.json` 默认端口是 `5180`，后端默认端口是 `3000`
- 当前两个前端构建默认都更适合部署在域名根路径；若上线时不改 Vite `base`，建议使用两个域名或二级域名，而不是直接挂到同域名子路径
- 后端 `server/src/main.ts` 中 `CORS_ORIGIN` 当前直接作为单值 `origin` 传入 `enableCors()`，没有现成多域名白名单解析
- `AiModelConfigCacheService` 当前把模型配置直接存进 Redis `ai:model-config:*` 键；如果要保留测试环境现有模型配置，Redis 也应纳入迁移范围
- 当前业务文件和图片资源由 MinIO 承载，数据库中的 `storageUrl / objectKey` 仅保存引用；若只恢复 PostgreSQL 不同步 MinIO，对应资源会在新环境失效
- 当前本地 `docker-compose.yml` 使用宿主机目录挂载：`PostgreSQL -> D:\zhilin_project\data\postgres`、`Redis -> D:\zhilin_project\data\redis`、`MinIO -> D:\zhilin_project\data\minio`
- 本次实际备份目录已落在 `D:\zhilin_project\backups\20260508_231808`；其中 SQL 采用 `pg_dump` 导出，Redis 与 MinIO 采用宿主机数据目录复制

## 2026-05-09
- 当前运行包部署已可不依赖 `git clone`；服务器只需接收本机整理好的 `dist + server/dist + server/node_modules + docker-compose.yml + .env.example`
- 本轮真实可用的本地运行包目录为 `D:\zhilin_project\backups\deploy_bundle_20260509_143128\project-root`
- 当前可直接用于迁移的备份真实结构是 `backups/sql/ai_superweb.sql`、`backups/redis/data`、`backups/minio/data`，不再是之前文档里的 `.dump / .tar.gz`
- 当前普通 SQL 备份应通过 `psql` 恢复；`Redis` 与 `MinIO` 备份应通过停服务后覆盖数据目录恢复
- 按用户最新要求，本轮服务器项目部署根目录应统一使用 `/data/ai-superweb`
- 超级站前台 `LegacyHomePage.tsx` 当前会串行加载 `gsap / ScrollTrigger / lenis / p5 / legacy-home.js`；此前 `gsap / ScrollTrigger / lenis / p5` 都依赖外部 CDN
- 若任一外部脚本加载失败，`legacy-home.js` 启动链路会中断，`.page-loader` 无法被关闭，页面会一直停在 `CHILINTECH` 加载层
- 本地浏览器复测显示 `/` 与 `/products` 路径都能渲染完整页面，但该问题在服务器环境具有明显的 CDN 依赖敏感性
- 最小稳定修复方案是把依赖脚本改为 `ZL_Supersite/public/vendor/*` 本地静态资源，并为加载层增加失败/超时兜底隐藏

## 2026-05-11
- 当前工作区仍有多处历史未提交改动，但本轮关键链路的最小验证已通过，可继续基于现状推进
- `task_plan.md` 此前存在阶段 `129` 已完成但状态仍写成 `in_progress` 的记录残留，已修正
- 本轮追加复核显示后台前端类型检查、后端构建、超级站前端类型检查均通过，当前更适合进入下一项明确需求，而不是继续追加无目标改动
- 现有 Ubuntu 运行包部署文档仍按 `pm2 start dist/main.js` 托管后端，尚未覆盖 `Xvfb`、Chrome 和虚拟显示
- 平台登录当前要想在 Linux 服务器使用可视浏览器，部署侧需要同时满足 `Xvfb + Chrome + DISPLAY`
- 适合当前项目的最小落地方案是：`PM2` 托管 shell 脚本，脚本先确保 `Xvfb :99` 存在，再导出 `DISPLAY=:99` 启后端
- 后端部署时应显式配置 `PUBLISHING_BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome` 与 `PUBLISHING_BROWSER_HEADLESS=false`

## 2026-05-11 平台登录链路补充
- 当前 PublishingPlatformLogin.tsx 原实现并不是本地浏览器登录，而是调用 /api/publishing/platform-accounts/*/hosted-login/*，由服务端 Playwright 托管浏览器。
- 后端其实早已支持直接保存 Cookie/Token：createPlatformAccount() 与 updatePlatformAccount() 可直接写入 uthPayload，alidatePlatformAccount() 负责最小格式校验并更新状态。
- 因此最小可交付方案不是继续折腾服务器可视浏览器，而是前端直接在本机打开平台登录页，再把用户手动获取的 Cookie/Token 提交给现有后端保存。

## 2026-05-11 浏览器扩展方案补充
- 仓库当前没有现成浏览器扩展实现，也没有 manifest、content script、cookies 权限声明。
- 后端已有可复用存储层：createPlatformAccount / updatePlatformAccount / validatePlatformAccount 已支持接收并保存 Cookie/Token。
- 若走扩展自动回传，建议新增扩展专用最小接口，而不是继续复用服务端托管浏览器登录。
- 浏览器扩展方案当前采用 Chrome/Edge Manifest V3 最小实现：页面按钮保持不变，点击后打开平台官网；扩展通过 content script + background 监听平台页并读取 Cookie，再调用后端扩展同步接口保存。
- 后端新增两段式接口：受 JWT 保护的 extension-login/start 负责签发 5 分钟短时会话 token；不带 JWT 的 extension-login/sync 只接受短时 token 回传 Cookie。
- 平台登录页当前已不再依赖服务端托管浏览器完成登录，服务端浏览器继续仅用于后续自动发布。
- 浏览器扩展已补 4 平台账号识别：在平台页直接按 DOM + 页面文本提取 ccountName/displayName，再随 Cookie 一起回传后端。
- 识别口径沿用原先后端 PlatformLoginBrowserService.readAccountProfile() 的平台关键词和正则思路：小红书号 / 抖音号 / 视频号ID / 快手号。

## 2026-05-12 自动发布与扩展登录断点补充
- 当前 4 平台自动发布链路已真实接通到 `PlatformLoginBrowserService.publish()`，不是只创建任务或只落草稿记录
- 扩展登录保存的是平台账号 `authPayloadEncrypted`，不会自动生成 `browserSessionPath`
- 自动发布此前仍依赖 `sessionPath` 启动 Playwright 持久上下文，未把扩展保存的 Cookie 注入上下文；若账号只有 Cookie、没有会话目录，自动发布会天然失去登录态
- 最小修复方案是在发布前将账号 Cookie 按平台发布域名注入 Playwright `BrowserContext`
- 该修复为平台通用逻辑，同时覆盖抖音、小红书、视频号、快手

## 2026-05-12 本地扩展发布链路补充
- 用户已明确最新目标：一键发布应由用户自己桌面浏览器执行，不再以服务端 Playwright 作为主执行端
- 用户要求“发布步骤按照以前”，即 4 平台现有自动发布主链路的步骤顺序和平台差异逻辑需要尽量沿用
- 前端一键发布入口仍在 `src/pages/Publishing.tsx -> confirmPublish()`，调用的是 `src/lib/publishing.ts -> publishLeadContent()`
- 浏览器扩展当前只具备 `PING / START_LOGIN` 登录回传能力，相关桥接在 `src/lib/platformLoginExtension.ts`，扩展目录在 `scripts/browser-extension/platform-login-helper`
- 扩展 background/content 目前只处理 Cookie 读取和登录回传，没有“本地执行发布脚本”的消息协议
- 旧的 4 平台发布步骤仍集中在 `server/src/modules/publishing/platform-login-browser.service.ts`：`publishXiaohongshu* / publishDouyinContent / publishWechatMp* / publishKuaishou*`

## 2026-05-12 快手发布链路补充
- 用户提供的快手真实发布路径应从 `https://cp.kuaishou.com/profile` 进入，而不是旧的 `/article/publish/video`
- 图文发布真实步骤为：点击 `发布图文` 卡片 -> 点击 `上传图片` 按钮 -> 上传图片 -> 点击 `#work-description-edit` 描述区 -> 输入标题/回车/文案/回车 -> 每个标签输入后点击候选 `span` -> 点击 `发布`
- 视频发布真实步骤为：点击 `发布视频` 卡片 -> 点击 `上传视频` 按钮 -> 上传视频 -> 点击 `#work-description-edit` 描述区 -> 输入标题/回车/文案/回车 -> 每个标签输入后点击候选 `span` -> 点击 `发布`
- 快手当前描述区是 `div[contenteditable="true"]#work-description-edit`，不是常规 `input/textarea`
- 快手标签候选当前可优先按 `span[class*="at-tag-name"]` 与示例类 `span._at-tag-name_eho7l_222` 识别
- 用户额外要求快手步骤需做模拟鼠标点击且速度不要太快；因此扩展本地发布与后端备用 Playwright 都需使用更慢的人类化点击节奏
- 当前扩展后台对发布会话只在第一次 `AI_SUPERWEB_PLATFORM_PAGE_READY` 时下发一次 `EXECUTE_PUBLISH`
- 快手从 `/profile` 点击 `发布图文/发布视频` 卡片后会进入新页面，原页面脚本上下文会被销毁；若后台不在新页面再次下发执行指令，流程会卡在跨页步骤附近

## 2026-05-12 AiToEarn 源码迁移评估
- AiToEarn 当前主链路不是本地浏览器扩展发帖，而是 `Relay OAuth + 渠道账号 + PublishRecord + 队列任务` 的服务端架构
- `docker-compose.yml` 暴露的是 `aitoearn-web + aitoearn-server + aitoearn-ai + MongoDB + Redis + RustFS`，不是单体发布脚本
- `src/core/channel/publish.controller.ts` 会把本地发布记录和 Relay 侧发布记录合并返回，说明“自部署 + 官方 Relay”是混合架构
- `src/core/relay/relay-oauth.controller.ts` 负责接收官方 Relay OAuth 回调并在本地创建账号，`relay-client.service.ts` 用 `x-api-key` 访问官方 `RELAY_SERVER_URL`
- `src/core/channel/publishing/publishing.service.ts` 创建发布任务时若账号带 `relayAccountRef` 会直接抛异常，说明 Relay 账号与本地直发账号是两套分流逻辑，不是简单同库同流程
- `src/core/channel/publishing/providers/douyin.service.ts` 依赖抖音开放能力与 share schema；`providers/kwai.service.ts` 依赖快手 OAuth token + 分片上传 + 官方发布接口
- 当前公开源码能看到 `douyin / kwai / bilibili / youtube / facebook / instagram / threads / twitter / pinterest / wx-gzh` 等 provider，但未看到你们现阶段最关键的“本机扩展 + Cookie 回传 + 页面自动化”实现
- 对你们现有系统而言，可借鉴的是“账号模型、任务队列、平台 provider 分层”；不能低成本直接迁的是“授权体系、数据模型、基础设施、发布执行方式”

## 2026-05-12 AiToEarn MCP 公开工具补充
- README 中公开给 Claude/Cursor 的 MCP 地址是 `/api/unified/mcp`，统一入口不是单独 publish API
- `UnifiedMcpModule` 当前把 `AccountMcpController + PublishMcpController + ContentMcpController` 聚合到 `apiPrefix: unified`
- 同时还存在 3 个单独 MCP 模块：`account`、`publish`、`content`
- 已确认账号类工具 2 个：`getAccountGroupList`、`getAccountListByGroupId`
- 已确认内容类工具 4 个：`getMediaGroupInfoByName`、`createMedia`、`getDraftGroupInfoByName`、`createDraft`
- 已确认发布类工具至少 12 个：`getPublishingTaskStatus`、`publishRestrictions`、`publishPostToBilibili`、`publishPostToWxGzh`、`publishPostToYoutube`、`publishPostToPinterest`、`publishPostToThreads`、`publishPostToTiktok`、`publishPostToFacebook`、`publishPostToInstagram`、`publishPostToKwai`、`publishPostToTwitter`
- 从当前 `publish.mcp.controller.ts` 可见导入判断，未确认公开 MCP 里存在 `publishPostToDouyin`、`publishPostToXhs`、`视频号` 相关工具；至少当前已抓到的 controller 片段里没有这些 schema 导入
- “一键发布”能力是有的，但形态是“按平台的 publishPostTo* 工具逐个创建发布任务”，不是你们系统里那种多平台单按钮聚合接口
- “查状态”能力已确认有：`getPublishingTaskStatus(flowId)`
- “渠道账号”能力已确认有基础查询：账号分组与分组下账号列表；未确认有“直接创建/发起 OAuth 登录账号”的 MCP 工具

## 2026-05-12 草稿箱编辑页 UI 对齐补充
- 图文草稿箱编辑弹窗在 `src/pages/StudioDrafts.tsx`，当前仍是旧的“标题/文案/标签/图片”表单堆叠布局
- 视频草稿箱编辑弹窗在 `src/pages/VideoDrafts.tsx`，当前结构是“状态徽标 -> 标签区 -> 标题区 -> 主内容预览 -> 文案编辑”的统一结果页样式
- 图文草稿箱若要模仿视频草稿箱 UI，最小改造点集中在 `StudioDrafts.tsx` 的编辑 `Modal`，无需改后端或草稿读写接口
