# 获客内容池方案

## 目标
- 建立独立的 `获客内容池` 模块，统一沉淀可复用的获客素材
- 打通当前 `草稿箱 -> 同步到获客内容池` 的正式后端链路
- 支持内容浏览、筛选、预览、编辑、发布任务管理
- 第一阶段不打通 `上传到超级站`

## 本期范围
- 做正式内容池数据模型
- 做内容入池、列表、详情、编辑、上下架/归档
- 做平台发布任务记录
- 复用当前 `社媒图文生成`、`商品图与详情图生成`、后续 `视频生成` 的结果入池
- 保留 `上传超级站` 入口占位，但不接真实链路

## 不做范围
- 不做超级站发布接口对接
- 不做外部平台真实发布 API 接入
- 不做复杂排期审批流
- 不做内容推荐、爆文评分、AB 测试

## 当前现状
- 前端已有页面入口 `Publishing`
- 当前 `Publishing` 主要依赖 `useAppStore.contents` 与 `publishJobs`
- `StudioDrafts` 里的“同步到获客”目前本质上是写前端本地 store
- 后端已有 `SocialGeneratedPost`，但没有正式的“获客内容池”表
- 权限上 `main_company / level1_agent / department_admin` 已可访问 `publishing`

## 设计原则
- 内容池独立于超级站，先把内容资产沉淀做好
- 内容池是“已审核或可运营”的内容仓，不等同于生成草稿
- 生成模块负责产出，内容池负责管理、复用、分发
- 平台发布和超级站投放都作为“内容池之后”的下游动作

## 业务定位

### 内容来源
- 社媒图文生成结果
- 商品图与详情图生成结果
- 视频生成结果
- 后续可扩展人工新建内容

### 核心流程
1. 生成模块产出内容
2. 内容在草稿箱审核/确认
3. 用户点击“同步到获客”
4. 后端写入正式 `获客内容池`
5. 内容池内再做筛选、编辑、预览、发布

## 数据模型建议

### 主表 `LeadContent`
- `id`
- `creatorId`
- `sourceType`
  - `social`
  - `product`
  - `video`
  - `manual`
- `sourceId`
  - 对应原始来源记录 ID
- `title`
- `body`
- `contentType`
  - `copy`
  - `image_text`
  - `video`
  - `product_asset`
- `platformStyle`
  - `xiaohongshu / douyin / wechat_mp / super_site / taobao / jd / pdd`
- `coverImage`
- `images`
- `videoUrl`
- `tags`
- `status`
  - `active`
  - `archived`
  - `deleted`
- `syncStatus`
  - `pending`
  - `synced`
- `createdAt`
- `updatedAt`

### 关联表 `LeadContentSourceRef`
- 用于记录入池来源和追踪关系
- 字段：
  - `id`
  - `leadContentId`
  - `sourceModule`
  - `sourceRecordId`
  - `sourceVersion`
  - `createdAt`

### 发布任务表 `LeadPublishJob`
- `id`
- `leadContentId`
- `platforms` `String[]`
- `status`
  - `queued`
  - `running`
  - `success`
  - `failed`
- `scheduledAt`
- `lastError`
- `createdById`
- `createdAt`
- `updatedAt`

### 编辑历史表 `LeadContentRevision`
- 第一阶段可选
- 若先做最小版本，可先不落表，只保留主表覆盖更新
- 若要增强审计，可记录：
  - `leadContentId`
  - `title`
  - `body`
  - `images`
  - `editedById`
  - `createdAt`

## 与现有模块关系

### 与草稿箱关系
- 草稿箱仍是“生成结果集合”
- 内容池是“正式运营资产集合”
- 草稿箱点击“同步到获客”后，调用后端内容池接口
- 同步后草稿记录只保留“已同步”状态，不再承担内容池存储职责

### 与社媒图文生成关系
- `SocialGeneratedPost` 继续保留为原始生成结果
- 不直接把它当内容池主表
- 内容池通过 `sourceType=social + sourceId` 关联

### 与商品图/视频关系
- 商品图与视频后续也按相同模型入池
- 避免为每个来源单独做一套内容池结构

### 与超级站关系
- 第一阶段不打通上传
- 页面上“上传超级站”按钮建议改成：
  - `暂未接通`
  - 或保留灰态按钮
- 文案上明确“内容池先独立建设”

## 页面方案

### 1. 内容池首页
- 顶部指标：
  - 内容总数
  - 本周新增
  - 已发布数
  - 待发布数
- 列表字段建议：
  - 标题
  - 内容类型
  - 来源模块
  - 平台风格
  - 标签
  - 创建时间
  - 状态
  - 操作

### 2. 内容详情抽屉
- 基础信息
- 正文内容
- 图片/视频预览
- 来源信息
- 发布记录
- 操作按钮：
  - 编辑
  - 归档
  - 创建发布任务
  - 上传超级站（灰态）

### 3. 发布任务区
- 展示内容池发起的发布任务
- 支持按状态筛选
- 展示目标平台、创建时间、结果状态、错误信息

## 筛选能力
- 按来源筛选：社媒 / 商品 / 视频 / 手工
- 按内容类型筛选：图文 / 视频 / 商品素材
- 按平台风格筛选
- 按状态筛选：正常 / 已归档
- 按是否已同步筛选
- 关键词搜索标题和正文

## 后端接口建议

### 内容池
- `GET /api/publishing/contents`
  - 列表
- `GET /api/publishing/contents/:id`
  - 详情
- `POST /api/publishing/contents`
  - 手工新建内容，第一阶段可先预留
- `POST /api/publishing/contents/sync-from-source`
  - 从草稿/生成结果同步入池
- `PATCH /api/publishing/contents/:id`
  - 编辑标题、正文、标签、封面
- `POST /api/publishing/contents/:id/archive`
  - 归档
- `POST /api/publishing/contents/:id/unarchive`
  - 取消归档

### 发布任务
- `GET /api/publishing/jobs`
- `POST /api/publishing/jobs`
  - 创建平台发布任务，先只写任务记录
- `PATCH /api/publishing/jobs/:id`
  - 更新状态，供后续真实发布链路接入

## 前端改造建议

### 第一阶段替换点
- `Publishing.tsx`
  - 从 `useAppStore.contents` 切到真实后端接口
- `StudioDrafts.tsx`
  - “同步到获客”改为调用内容池后端接口
  - 当前本地 `addContent()` 逻辑移除
- `appStore.ts`
  - `contents / publishJobs` 逐步降级为过渡态或移除

### 按钮策略
- `同步到获客`
  - 保留，改为正式后端写入
- `上传超级站`
  - 第一阶段禁用
  - 显示说明：`暂未接通超级站上传`

## 权限建议

### 主公司
- 查看全部内容池内容
- 编辑、归档、创建发布任务

### 代理 / 部门管理员
- 查看自己有权限的内容池内容
- 同步自己生成的内容入池
- 创建发布任务
- 不可处理系统级配置

### 普通员工
- 第一阶段默认不开 `publishing`

## 状态流转建议

### 内容状态
- `active`
  - 正常可运营
- `archived`
  - 已归档，不参与默认列表
- `deleted`
  - 逻辑删除

### 发布任务状态
- `queued`
  - 已创建，待执行
- `running`
  - 执行中
- `success`
  - 已完成
- `failed`
  - 失败

## 第一阶段 MVP
- 正式内容池表
- 草稿箱同步入池
- 内容池列表
- 内容详情/预览
- 编辑标题与正文
- 发布任务记录
- “上传超级站”灰态占位

## 第二阶段
- 平台草稿箱真实发布对接
- 内容标签体系
- 批量同步入池
- 内容二次改写
- 版本历史

## 第三阶段
- 超级站上传打通
- 发布排期
- 数据回流
- 内容效果分析

## 推荐实施顺序
1. 先补 Prisma 表结构和后端 `publishing` 模块
2. 再把 `StudioDrafts` 的“同步到获客”切到正式接口
3. 再重写 `Publishing.tsx` 为真实列表页
4. 最后再补发布任务记录和灰态“上传超级站”

## 结论
- 获客内容池应该先做成独立正式模块，不依赖超级站上传
- 第一阶段重点是“内容沉淀 + 内容管理 + 发布任务记录”
- 超级站上传作为下游能力，放到第二阶段以后再接最合适
