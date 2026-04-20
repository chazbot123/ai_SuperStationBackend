# AI SuperWeb 架构文档

> 版本：v1.1  
> 日期：2026-04-20  
> 定位：单机私有化部署 · 单企业多部门 · 后台账号体系复用小程序/H5 名片页

---

## 一、文档目标

本次更新聚焦 3 条最新业务主线，并统一为 Markdown 文档版本：

- 企业名片：补齐当前用户自有名片接口、名片展示接口、封面上传接口
- 认证会话：明确登录创建 session、最多 2 台设备在线、支持会话列表与手动下线
- 商品英文名：商品对象统一支持 `englishName / english_name`，列表、搜索、保存均纳入双语字段

---

## 二、技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | React 18 + TypeScript + Vite | 当前后台 Demo 基础 |
| 前端状态 | Zustand | 当前 Demo 已承接业务原型 |
| 正式前端数据层 | TanStack Query + Zustand | 服务端数据与本地 UI 态分层 |
| 前端路由 | React Router | 后台路由与权限页控制 |
| 后端框架 | NestJS + TypeScript | 模块化单体 |
| ORM | Prisma | PostgreSQL 类型安全建模 |
| 数据库 | PostgreSQL 16 | 主业务库 |
| 缓存/会话 | Redis 7 | session 辅助、缓存、队列 |
| 对象存储 | MinIO | 商品图、名片封面、其他文件 |
| 队列 | BullMQ | AI 与发布异步任务 |
| 反向代理 | Nginx | SPA、API、文件访问统一入口 |
| 部署 | Docker Compose | 单机交付 |

---

## 三、系统上下文

```text
Browser / 小程序 / H5
        │
        ▼
      Nginx
   ┌────┼────┐
   │    │    │
   ▼    ▼    ▼
后台 SPA  API Server  文件访问
             │
   ┌─────────┼─────────┐
   ▼         ▼         ▼
PostgreSQL  Redis     MinIO
             │
             ▼
           Worker
```

### 渠道说明

- 后台 SPA：面向主公司与 1 级代理的管理后台
- 小程序 / H5 / 前台名片页：复用后台账号体系与企业名片数据
- 外部 AI / 发布平台：通过 API Server 或 Worker 统一接入

---

## 四、核心模块划分

| 模块 | 责任 |
|------|------|
| `auth` | 登录、登出、当前用户信息、session 管理、设备挤下线 |
| `user` | 用户基础档案、账户状态 |
| `rbac` | 角色、权限点、数据范围 |
| `business-card` | 每账号一张名片、封面图、对外展示信息 |
| `product` | 商品、英文名、特价、审核提交流转 |
| `asset` | 图片/封面上传、文件元数据 |
| `review` | 商品等对象的审核单与状态回写 |
| `publish` | 内容/商品发布任务 |
| `audit` | 登录、登出、会话下线、关键业务操作审计 |

### 模块关系

```text
Auth ────── User ────── RBAC
  │            │
  │            ├──── BusinessCard
  │            └──── Product
  │                    │
  ├──── Session         ├──── Review
  └──── Audit           └──── Asset
```

---

## 五、关键业务对象

### 1. 企业名片

- 每个后台账号仅允许一张企业名片
- 名片与账户 `userId` 强绑定，不支持脱离账户单独存在
- 自有名片读写走 `/api/business-cards/me`
- 对外展示走 `/api/business-cards/:userId`
- 封面图通过 `/api/business-cards/me/cover` 上传，文件本体进入对象存储

### 2. 认证会话

- `POST /api/auth/login` 登录成功后必须创建一条 session
- 同一账号最多允许 2 台设备同时在线
- 第 3 台设备登录时，自动挤掉最早在线设备
- 不设置固定有效期主动过期，但仍保留手动登出与手动下线能力
- 会话列表与手动下线分别由 `/api/auth/sessions`、`DELETE /api/auth/sessions/:id` 承接

### 3. 商品英文名

- 商品主对象新增 `englishName`，兼容输入/输出别名 `english_name`
- 中文产品名录入后可自动推断英文名，用户可二次手动调整
- 列表、搜索、创建、编辑、保存全部需要支持英文名
- 独立推断能力由 `/api/products/infer-english-name` 提供

---

## 六、典型流程

### 1. 登录与设备挤下线

```text
用户登录
  → 校验账号密码
  → 创建新 session
  → 查询当前账号在线 session 数
  → 若超过 2 台，踢出最早 session
  → 返回当前用户、角色、权限、数据范围
```

### 2. 企业名片维护

```text
用户打开企业名片页
  → GET /api/business-cards/me
  → 若无记录则返回空白可初始化态
  → 用户编辑并 PUT /api/business-cards/me
  → 上传封面时 POST /api/business-cards/me/cover
  → 小程序/H5 通过 GET /api/business-cards/:userId 展示
```

### 3. 商品创建与英文名补齐

```text
用户输入中文商品名
  → 前端或后端调用英文名推断能力
  → 自动回填 englishName
  → 用户可手动调整
  → POST /api/products 保存
  → 列表与搜索统一支持 name + englishName
```

---

## 七、前端契约对齐

根据当前项目 README 与本次需求，前端 Demo 需要与正式接口保持如下语义对齐：

| 领域 | 前端方法 | 对应后端语义 |
|------|----------|--------------|
| 企业名片 | `ensureBusinessCard(userId)` | 首次访问时确保名片存在或初始化 |
| 企业名片 | `updateBusinessCard(userId, payload)` | 更新本人名片 |
| 企业名片 | `getBusinessCardByUserId(userId)` | 获取用户公开名片展示信息 |
| 商品英文名 | `inferEnglishProductName(name)` | 根据中文名推断英文名 |
| 商品创建 | `addProduct()` | 创建商品并自动带出英文名 |

> 说明：本次检查中，README 已明确这些能力，但当前仓库源码未完整检索到上述同名实现，后续需要再做一次“Demo 命名与文档契约”对齐。

---

## 八、建议目录结构

```text
src/
  pages/
    Login.tsx
    Products.tsx
    Personalization.tsx
  store/
    authStore.ts
    appStore.ts

server/
  modules/
    auth/
    business-card/
    product/
    asset/
    review/
    audit/
```

---

## 九、演进建议

### 第一阶段

- 优先把 `business-card`、`auth session`、`product englishName` 3 条契约固化到正式后端
- 前端把 Demo store 能力迁移为 API 调用

### 第二阶段

- 增加 session 审计、设备信息解析、手动下线通知
- 补齐名片页小程序/H5 的缓存策略与 SEO/分享配置

### 第三阶段

- 商品英文名引入字典纠错、人工覆盖与审核留痕
- 将名片封面、商品图上传统一收口到 `asset` 域
