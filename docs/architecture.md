# 目标项目架构文档

> 版本：v1.2  
> 日期：2026-04-21  
> 定位：单机私有化部署 · 单企业多部门 · 完整后台 · 外部 AI/发布接口接入

> **阅读约定**：本文档同时描述「已实现」和「规划中」内容。每节末尾或表格备注列会注明当前实现状态。未标注的模块默认为规划中。

---

## 一、技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React 18 + TypeScript + Vite | 当前原型基础 |
| 前端状态 | TanStack Query + Zustand | 服务端数据用 Query，本地 UI 态用 Zustand |
| 前端表单 | React Hook Form + Zod | 表单校验 |
| 前端路由 | React Router v7 | 当前已有 |
| 前端 UI | Tailwind CSS + 自建 UI 组件 | 当前已有 |
| 前端扩展端 | 微信小程序 / H5 前台页 | 复用后台账号体系与前台展示数据 |
| 后端框架 | NestJS + TypeScript | 模块化单体，适合多业务域 |
| ORM | Prisma 7 | 类型安全，适合 PostgreSQL；**必须使用 driver adapter**（`@prisma/adapter-pg + pg`），不可用 `new PrismaClient()` 直连 |
| 任务队列 | BullMQ | 基于 Redis，处理 AI/发布/异步任务 |
| 数据库 | PostgreSQL 16 | 关系型主库 |
| 缓存/队列 | Redis 7 | 缓存、队列、会话辅助 |
| 文件存储 | MinIO | 本地 S3 兼容，存图片/视频/导出文件 |
| 反向代理 | Nginx | 统一入口、静态资源、TLS |
| 部署 | Docker Compose | 单机一键部署 |

---

## 二、系统总体架构图

```text
┌──────────────────────────────────────────────────────────────┐
│                         Browser                              │
└──────────────────────────┬───────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼───────────────────────────────────┐
│                         Nginx                                │
│   /          → Frontend SPA (静态资源)                        │
│   /api/*     → Backend API Server                            │
│   /files/*   → MinIO Gateway (文件访问)                       │
└────────┬─────────────────┬────────────────────────────────────┘
         │                 │
┌────────▼──────────┐  ┌───▼───────────────────────────────────┐
│   Frontend SPA    │  │         Backend API Server             │
│   (admin-web)     │  │            (NestJS)                    │
│                   │  │  ┌────────────────────────────────┐    │
│  - 登录/权限       │  │  │ Auth / User / Session / RBAC  │    │
│  - 内容中心        │  │  │ Org / Agent / Content         │    │
│  - 商品中心        │  │  │ Product / SuperSiteSetting    │    │
│  - 超级站配置      │  │  │ Review / Rule / Publish       │    │
│  - 发布中心        │  │  │ Asset / Audit / Settings      │    │
│  - 审核中心        │  │  │ AI Gateway / Integration      │    │
│  - 规则中心        │  │  └──────────────┬─────────────────┘    │
│  - 代理商管理      │  │                 │                      │
│  - 权限管理        │  └─────────────────┼──────────────────────┘
│  - 审计日志        │                    │
└───────────────────┘       ┌────────────┼────────────────────┐
                             │            │                    │
                ┌────────────▼───┐ ┌──────▼──────┐ ┌──────────▼──┐
                │  PostgreSQL    │ │    Redis     │ │    MinIO    │
                │  (主业务库)     │ │ (缓存/队列)  │ │  (文件存储) │
                └────────────────┘ └──────┬──────┘ └─────────────┘
                                           │
                                   ┌───────▼────────┐
                                   │  Job Worker     │
                                   │  (BullMQ)       │
                                   │                 │
                                   │ - AI 生成任务    │
                                   │ - 发布执行任务   │
                                   │ - 重试补偿任务   │
                                   │ - 审计归档任务   │
                                   └───────┬────────┘
                                           │
                     ┌─────────────────────┼─────────────────────┐
                     │                     │                     │
           ┌─────────▼──────┐   ┌──────────▼─────┐   ┌──────────▼─────┐
           │  External AI   │   │  External      │   │  Webhook /      │
           │  APIs          │   │  Publish APIs  │   │  Callback       │
           │  (DashScope,   │   │  (XHS/Douyin/  │   │  Handlers       │
           │   OpenAI, etc) │   │   WeChat...)   │   │                 │
           └────────────────┘   └────────────────┘   └─────────────────┘
```

---

## 三、部署拓扑图

```text
┌─────────────────────────────────────────────────────┐
│                   单台服务器                          │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │              Docker Compose                  │   │
│  │                                             │   │
│  │   ┌─────────┐    ┌──────────────────────┐   │   │
│  │   │  nginx  │    │     admin-web        │   │   │
│  │   │  :80    │───▶│  (静态资源 dist/)     │   │   │
│  │   │  :443   │    └──────────────────────┘   │   │
│  │   └────┬────┘                               │   │
│  │        │           ┌──────────────────────┐ │   │
│  │        └──────────▶│    api-server        │ │   │
│  │                    │    NestJS :3000       │ │   │
│  │                    └──────────┬───────────┘ │   │
│  │                               │             │   │
│  │                               ▼             │   │
│  │              ┌──────────────────────────┐   │   │
│  │              │        基础设施层         │   │   │
│  │              │ postgres:5432            │   │   │
│  │              │ redis:6379               │   │   │
│  │              │ minio:9000 / :9001       │   │   │
│  │              └──────────────────────────┘   │   │
│  │                                             │   │
│  │   ┌─────────────────────────────────────┐  │   │
│  │   │          持久化卷                     │  │   │
│  │   │  /data/postgres  /data/redis         │  │   │
│  │   │  /data/minio     /data/logs          │  │   │
│  │   └─────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

> **当前实现**：Compose 里目前只有 `nginx / admin-web / api-server / postgres / redis / minio`。`worker / scheduler` 仍是规划中，尚未落地。

### Docker Compose 容器清单

| 容器名 | 镜像 | 端口 | 说明 | 状态 |
|--------|------|------|------|------|
| nginx | nginx:alpine | 80, 443 | 统一入口反向代理 | 规划中 |
| admin-web | node:20-alpine (build) | — | 前端静态文件，由 nginx 托管 | 规划中 |
| api-server | node:20-alpine | 3000 (内部) | NestJS 主后端 | ✅ 已实现 |
| postgres | postgres:16-alpine | 5432 (内部) | 业务主数据库 | ✅ 已实现 |
| redis | redis:7-alpine | 6379 (内部) | 缓存 / 队列 / 会话辅助 | ✅ 已实现 |
| minio | minio/minio | 9000, 9001 (内部) | 对象存储 | ✅ 已实现 |
| worker | node:20-alpine | — | BullMQ 异步任务消费 | 规划中 |
| scheduler | node:20-alpine | — | cron / 定时任务 | 规划中 |

---

## 四、后端模块关系图

```text
┌────────────────────────────────────────────────────────────────────┐
│                       NestJS 模块化单体                            │
│                                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐         │
│  │  Auth    │  │   User   │  │   RBAC   │  │    Org     │         │
│  │ 认证/会话 │  │ 用户管理  │  │ 角色/权限 │  │ 部门/组织   │         │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └─────┬──────┘         │
│       └─────────────┴─────────────┴───────────────┘               │
│                              │ 基础能力                             │
│       ┌──────────────────────┼──────────────────────────────┐      │
│       │                      │                              │      │
│  ┌────▼─────┐  ┌─────────────▼──┐  ┌────────────────────────▼──┐   │
│  │  Agent   │  │    Content     │  │ Product / SuperSiteSetting │   │
│  │ 代理商    │  │ 内容/文案/图片  │  │ 商品 / 超级站配置 / 前台展示 │   │
│  └────┬─────┘  └────────┬───────┘  └──────────────┬───────────┘   │
│       │                 │                         │               │
│  ┌────▼─────────────────▼─────────────────────────▼────────────┐  │
│  │                      Review 审核中心                         │  │
│  │         (统一处理内容审核 / 商品审核 / 规则审核)              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐         │
│  │  Rule    │  │ Publish  │  │  Asset   │  │   Audit    │         │
│  │ 规则中心  │  │ 发布中心  │  │ 文件素材  │  │ 审计日志    │         │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────────┘         │
│       │              │             │                               │
│  ┌────▼──────────────▼─────────────▼────────────────────────────┐  │
│  │                       基础设施层                              │  │
│  │  AI Gateway  │  Queue  │  Storage  │  Cache  │  DB         │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

### 模块职责说明

| 模块 | 职责 |
|------|------|
| `auth` | 登录、JWT 会话校验、当前用户信息、登出、个人改密、设备会话限制 |
| `user` | 用户管理、主公司创建/编辑/删除用户、主公司重置任意账号密码、非主公司仅查看自己与修改自己密码 |
| `rbac` | 当前已实现页面级角色名维护与权限矩阵；多角色、权限点、数据范围策略仍为规划中 |
| `org` | 部门、组织树、岗位、用户-组织归属 |
| `agent` | 一级代理档案、状态、代理-账号绑定、业务范围 |
| `content` | 内容草稿、版本、AI生成、素材引用、提审 |
| `product` | 商品信息、中文/英文名、图片、特价、状态机、提审 |
| `super-site-settings` | 超级站模板、模块、运营指标、特价区等前台配置 |
| `review` | 统一审核中心、审核单、审核节点、操作记录 |
| `rule` | 关键词规则、黑白名单、规则版本、命中日志 |
| `publish` | 发布计划、渠道适配、任务状态、重试、回执 |
| `asset` | 文件上传、元数据、引用关系、访问签名 |
| `ai` | AI Gateway，统一封装文案/图片/视频生成调用，也承接视频任务轮询、音频合成、字幕烧录与商品英文名翻译/生成 |
| `audit` | 审计日志、操作日志、安全事件 |
| `settings` | 系统配置、集成配置、功能开关 |

---

## 五、权限模型

采用三层权限：

```text
┌─────────────────────────────────────────────────┐
│               三层权限模型                        │
│                                                 │
│  Layer 1: 功能权限 (Permission)                  │
│  ─────────────────────────────────              │
│  控制"能做什么"                                   │
│  例: content:create  product:submit_review      │
│      review:approve  publish:execute            │
│      rbac:user_manage  audit:export             │
│      personalization:update                     │
│                                                 │
│  Layer 2: 数据范围权限 (Data Scope)               │
│  ─────────────────────────────────              │
│  控制"能看谁的数据"                               │
│  SELF              仅本人                        │
│  DEPARTMENT        本部门                        │
│  DEPT_AND_CHILDREN 本部门及下级部门               │
│  ASSIGNED_AGENTS   绑定的代理商范围               │
│  ALL               全部                          │
│                                                 │
│  Layer 3: 流程权限 (Workflow Role)               │
│  ─────────────────────────────────              │
│  控制"能参与哪个审核步骤"                          │
│  例: 提交人 / 初审人 / 终审人 / 管理员              │
└─────────────────────────────────────────────────┘
```

---

## 六、核心业务流程

### 内容生产流程

```text
用户填写产品信息
  → 调用 AI Gateway → 外部模型
  → 内容草稿入库
  → 用户编辑/确认
  → 提交审核 → 生成 ReviewOrder
  → 审核通过
  → 可加入发布计划
```

### 商品维护流程

```text
用户填写中文产品名
  → 后端调用英文名推断/翻译能力
  → 自动回填 english_name
  → 用户可手动修正
  → 保存商品草稿
  → 提交审核
  → 审核通过后前台展示中英文商品信息
```

### 登录会话控制流程

```text
用户登录成功
  → 创建一条 user_session
  → 查询该账号当前有效设备数
  → 若超过 2 台
      → 按登录时间踢掉最早设备
      → 将被踢设备 session 标记为 squeezed
  → 当前设备保持登录
```

### 发布任务流程

> 以下链路为规划中的异步发布架构，当前 Compose 未部署独立 `worker` / `scheduler` 服务。

```text
用户选择内容 + 渠道 + 时间
  → 创建 PublishJob (status: queued)
  → 任务入 Redis Queue
  → Worker 消费
  → 调用渠道 Adapter
  → 写回 PublishAttempt + 状态
  → 失败 → 自动重试 (最多3次)
  → 仍失败 → 状态 failed，人工处理
```

### 审核流程

```text
业务模块调用 ReviewService.submit(target)
  → 生成 ReviewOrder + ReviewNode
  → 分配审核人
  → 审核人操作: approve / reject / return
  → 结果回写业务对象状态
  → 审计日志落库
```

---

## 七、目录结构

### 前端 (admin-web)

```text
frontend/
  src/
    app/                  # 路由 & 全局 Provider
    features/             # 按业务域拆分
      auth/
      dashboard/
      organization/
      rbac/
      agents/
      content/
      products/
      super-site-settings/
      publishing/
      reviews/
      rules/
      assets/
      audit/
      settings/
    shared/
      api/                # axios client + 请求封装
      components/         # 通用 UI 组件
      hooks/
      lib/
      types/
    main.tsx
    index.css
```

### 后端 (api-server)

```text
server/
  src/
    modules/
      auth/
        auth.module.ts
        auth.controller.ts
        auth.service.ts
        session.service.ts
        strategies/
        guards/
        dto/
      user/
      rbac/
      org/
      agent/
      content/
      product/
      super-site-settings/
      review/
      rule/
      publish/
        publish.module.ts
        publish.service.ts
        adapters/
          xiaohongshu.adapter.ts
          douyin.adapter.ts
          wechat.adapter.ts
      asset/
      ai/
        ai.module.ts
        ai.service.ts
        providers/
          dashscope.provider.ts
          openai.provider.ts
      audit/
      settings/
    common/
      db/
      cache/
      queue/
      storage/
      guards/
      decorators/
      filters/
      interceptors/
      utils/
    main.ts
    app.module.ts
  prisma/
    schema.prisma
    migrations/
```

### 部署

```text
deploy/
  docker-compose.yml
  docker-compose.prod.yml
  .env.example
  nginx/
    nginx.conf
    conf.d/
      default.conf
  scripts/
    init.sh
    backup.sh
    restore.sh
    upgrade.sh
  docs/
    deployment.md
    operations.md
```

---

## 八、演进路线

### 注意：Prisma Schema 管理

- **当前阶段**：使用 `prisma db push` 落库，跳过 migration 文件生成。原因：`migrate dev` 会持有 `pg_advisory_lock(72707369)`，在并发环境下反复卡死。
- **稳定后切换**：Schema 定型后改用 `prisma migrate dev` 生成迁移文件，生产用 `prisma migrate deploy`。
- **连接配置**：Prisma 7 不再支持在 `schema.prisma` 中写 `datasource.url`，连接串通过 `prisma.config.ts` + `@prisma/adapter-pg` 注入。

### 第一阶段：后端骨架（✅ 已完成）
- 搭建 NestJS 工程、Prisma 7、Docker Compose
- 完成 `auth`（登录 + JWT + 设备会话挤占 + 当前用户信息 + 登出 + 个人改密）
- 完成 `super-site-settings`（单用户唯一配置读写）
- 完成 `products` 第一版骨架（中英文名、列表、CRUD）
- Docker 服务：postgres / redis / minio 均 healthy

### 第二阶段：核心业务后移（进行中）
- `users` 已迁入后端，并接通后台用户管理页
- `rbac` 已落地 demo 所需的简化页面权限矩阵接口
- `agents`、关键词 `rules` 已迁入后端基础管理
- `products` 已补齐 demo 主链路：价格、特价、图片、提审、审核、上架/下架
- 商品、内容、审核等其他业务仍在持续后移
- 新增 `super-site-settings` 模块与前台配置接口
- 商品中英文名逻辑迁入后端服务
- 前端改为 TanStack Query 驱动
- 去掉 localStorage 核心业务数据

### 第三阶段：异步能力落地
- AI 生成任务化（BullMQ）
- 发布任务化
- 文件迁 MinIO
- 审计日志后端落库
- 商品英文名翻译/生成可配置走 AI Provider

### 第四阶段：交付完善
- Docker Compose 一键部署
- 初始化脚本、备份脚本
- 健康检查接口
- 运维文档
- 小程序 / H5 前台页与后台账号登录体系打通
