# 进度记录

## 2026-04-30
- 已恢复规划文件并确认本轮新任务：将“前台配置中心”改名为“超级站配置中心”，并开始开发“运营指标”
- 已确认现状：`/personalization/*` 即当前配置中心；`运营指标` 仅存在于 `Personalization.tsx` 内部 `useState`，尚未进入统一配置
- 规划辅助脚本在当前环境路径缺失，已跳过该步骤，改为直接基于仓库现状继续推进
- 已完成前端改名与运营指标配置首轮开发，前端构建通过
- 已新增后端 `super-site-settings` 模块，提供 `GET /api/super-site-settings/me` 与 `PUT /api/super-site-settings/me`
- 已新增 Prisma `SuperSiteSetting` 模型并完成 `prisma generate`
- 已执行 `npm exec prisma db push`，数据库已同步
- 已补后端单测 `super-site-settings.service.spec.ts`，2 项通过
- 已执行后端 `npm run build`，构建通过
- 已删除 AI企业名片前后端代码、Prisma 表、RBAC 页面键、前端菜单路由与配置字段
- 已执行 `prisma generate`、清理旧 `business_card` 权限数据并再次 `db push`，数据库删除已同步
- 已执行前端 `npm run build` 与后端 `npm run build`，均通过

## 2026-05-01
- 已执行 `git fetch`，确认本地 `main` 落后 `origin/main` 1 个提交
- 已按要求先提交当前工作区本地快照，再开始合并远端
- 已进入 `git merge origin/main` 的冲突处理阶段
- 已完成 9 个冲突文件的冲突块定位，准备开始逐个合并
- 已解决 `docs / Prisma / ai 模块 / 前端 UI` 冲突并清空全部冲突标记
- 已执行前端 `npm run build`，构建通过
- 已执行后端 `npm run prisma:generate` 与 `npm install`
- 已执行后端 `npm run build`，构建通过

## 2026-05-02
- 已恢复规划文件并确认新任务：将“视频草稿箱”改成正式后端落库，同时承接 `产品视频生成` 与 `真人口播视频生成`
- 已确认当前视频草稿箱主数据仍在前端 `videoDraftStore` 本地持久化，后端仅有真人口播任务表 `VideoMainTask / VideoSubTask`
- 已确认可直接复用图文草稿实现模式：`Prisma 模型 + ai.controller 路由 + ai.service CRUD + src/lib/ai.ts 封装`
- 已新增 Prisma `VideoDraft` 模型、`VideoDraftSource / VideoDraftStatus` 枚举和增量脚本 `scripts/add-video-drafts-module.sql`
- 已补 `GET/POST/PATCH /api/ai/video-drafts`、`POST /api/ai/video-drafts/:id/submit`、`POST /api/ai/video-drafts/:id/mark-synced`
- 已将 `VideoGenerationWorkspace.tsx` 与 `VideoDrafts.tsx` 改为后端草稿为主，本地 store 为缓存，并把轮询状态回写到后端
- 已执行相关文件诊断，结果为空
- 已执行 `npm run prisma:generate`、前端 `npm run build`、后端 `npm run build`，全部通过
- 已执行 `npm exec prisma db execute -- --file ..\scripts\add-video-drafts-module.sql`，本地开发数据库视频草稿表已落地

## 2026-05-03
- 已恢复规划文件并确认新任务：行业信息来源统一切 RSS，补更多 RSS 源，并给列表增加来源与日期筛选
- 已确认当前后端只有 `量子位 HTML / 雷峰网 HTML` 两个非 RSS 源，列表查询还缺 `sourceKey / 日期范围` 条件
- 已验证可直接使用的 RSS 包括 `量子位 / 雷峰网 / InfoQ / 爱范儿 / 少数派 / 极客公园`
- 已验证 `小宇宙` 暂未找到可直接复用的标准 feed 地址，本轮先不接，避免引入不稳定抓取
- 规划辅助脚本在当前环境路径缺失，已继续沿用仓库内 `task_plan.md / findings.md / progress.md` 维护当前任务
- 已完成后端来源定义切换、来源配置合并兼容、列表 `sourceKey / startDate / endDate` 筛选
- 已完成前端默认源同步与行业信息列表筛选 UI
- 已执行前端构建、后端 `nest build`，均通过
- 已重启后端并实测 `industry-sync` 抓取 `量子位 RSS / 雷峰网 RSS / InfoQ RSS` 成功，返回 `createdCount: 35, updatedCount: 15`
- 已实测 `GET /api/super-site-settings/me/industry-items?sourceKey=infoq_rss&startDate=2026-05-01&endDate=2026-05-03` 正常返回 5 条记录

## 2026-05-05
- 已恢复规划文件并确认新任务：将仪表盘的静态说明块替换为已有功能的数据化看板与统计图
- 已确认当前 `Dashboard.tsx` 仍包含“功能总览 / 审核概览 / 商品运营概览”三块静态内容
- 已确认项目内暂未接入现成图表库，本轮优先考虑轻量自绘统计图或现有 UI 组合实现
- 已完成 `Dashboard.tsx` 重构，原 3 个静态区块已替换为 `获客与发布 / 客户与客服 / 商品与知识库` 三组数据看板
- 已接入真实统计来源：`商品 / 获客发布 / 客户线索 / AI 客服 / 知识库`
- 已补轻量柱状图与近 7 天趋势图，无新增图表依赖
- 已执行 `GetDiagnostics`，页面诊断为 0
- 已执行前端 `npm run check`，类型检查通过
- 已恢复规划文件并确认新任务：将图文文案系统提示词统一调整为“小红书软种草”风格
- 已确认 `generateCopy()` 被 `社媒图文生成` 与 `商品图与详情图生成` 共用，本轮修改会同步影响两条图文链路
- 已将图文文案系统提示词拆成独立 helper，并补充热门文案节奏、情绪词/口语化、爆点结构、反差/痛点/场景切入、典型句式示例等明确规则
- 已执行 `GetDiagnostics`，`ai.service.ts / ai.service.spec.ts` 诊断为 0
- 已执行后端定向测试 `npm test -- ai/ai.service.spec.ts --runInBand`，6 项全部通过
- 已恢复规划文件并确认新任务：给 1级代理 开放仪表盘与模型配置功能
- 已确认控制点分两层：后端 `DEFAULT_PERMISSION_MATRIX` 控制默认 pageKey 可见；前端 `Rules.tsx` 还额外写死了“仅主公司可维护”
- 已放开 `level1_agent` 的 `dashboard / rules` 默认权限，并同步更新前端模型配置页的可维护判断
- 已执行 `GetDiagnostics`，`Rules.tsx / permissions.ts / rbac.constants.ts` 诊断为 0
- 已执行前端 `npm run check` 与后端 `npm run build`，均通过
- 已恢复规划文件并确认新任务：模型配置改为按账号独立，图文生成草稿图片补下载按钮
- 已确认模型配置原实现为 Redis 全局 key，共享给所有账号；图文草稿图片无来源字段，但可用 MinIO 托管 URL 识别“手动上传图片”
- 已将后端模型配置缓存改为按 `userId` 维度读写，并同步更新模型配置接口、图文生成、图片生成、视频生成、平台元数据、BGM 推荐、视频任务查询及真人口播后台续跑链路的配置读取逻辑
- 已将前端模型配置 store 绑定当前登录账号，切换账号时重置为该账号独立配置视图
- 已为 `StudioDrafts` 图片卡片增加右下角下载按钮，仅在后端标记为可下载的生成图片上显示，手动上传图片不显示
- 已执行 `GetDiagnostics`，本轮改动文件诊断为 0
- 已执行前端 `npm run check` 与后端 `npm run build`，均通过
- 已恢复规划文件并确认新任务：修复一级代理图文提审后主公司审核中心不显示的问题
- 已确认根因：一级代理提审接口会正确把后端草稿 `reviewStage` 改为 `submitted`，但主公司审核中心素材页仍只读取前端本地 `appStore.contents`，没有接后端 `SocialGeneratedPost / ProductImageDraft / VideoDraft`
- 已新增主公司专用素材审核接口：后端聚合 `social / product / video` 三类已提审记录，并提供通过/驳回处理
- 已将 `MaterialReviewsPanel` 切到后端审核数据源，主公司现在可直接查看一级代理提审的图文/商品图/视频草稿
- 已执行 `GetDiagnostics`，本轮审核中心相关改动文件诊断为 0
- 已执行前端 `npm run check` 与后端 `npm run build`，均通过
- 已确认当前仓库实际 Git 根目录为 `D:\zhilin_project\AI-SuperWeb\AI-SuperWeb`，外层仍套了一层 `AI-SuperWeb`
- 已盘点环境文件现状：原先只有根目录 `.env.docker.example` 与 `server/.env.example`
- 用户已确认目标是把项目最终整理到 `D:\zhilin_project`，并按“标准化”方式整理环境文件
- 已确认当前工作区规则不允许直接写入仓库根目录外，因此暂不能直接执行跨目录迁移，需先由用户确认放开路径限制或改为输出迁移方案
- 已完成仓库内整理：新增根目录 `.env.example`、新增 `docs/environment-files.md`、扩充 `docs/project-rules.md`、补 `scripts/migrate-project-root.ps1`
- 已删除重复的 `.env.docker.example`，根目录环境标准入口改为 `.env.example`

## 2026-05-07
- 已恢复规划文件并确认新任务：给知识库管理补更明确的删除入口，并排查“为什么有的文档只切到 1 个切片、是否调用大模型”
- 已确认前端 `Assets.tsx` 列表页原本已接通删除接口，但删除逻辑以内联方式散在列表按钮中，详情抽屉还缺同入口
- 已完成前端知识库删除动作收口：新增统一 `handleDeleteDocument()`、补 `deletingId` 状态、列表按钮与详情抽屉均可删除
- 已执行 `GetDiagnostics`，`Assets.tsx` 诊断为 0
- 已确认知识库切片链路为“先调 `AiService.generateTextReply()` 做智能切片，失败回退固定规则切片”，不是纯固定切片
- 已确认知识库 embedding 当前仍是本地哈希向量 `local_hash_v1`，不是调用大模型 embedding
- 已确认某些文档只切到 1 个切片通常是因为解析后的有效文本较短，或当前语义切片结果本身只需要 1 个片段
- 已将知识库智能切片提示词升级为“先识别真实文字结构，再决定切片边界”
- 已新增行级结构标注输入，向文字模型显式提示 `HEADING / LIST / QA / TABLE / TEXT / NOISE`
- 已执行 `GetDiagnostics` 与后端 `npm run build`，本轮切片策略改动通过
