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
