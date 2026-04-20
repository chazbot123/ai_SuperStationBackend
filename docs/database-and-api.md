# 数据库表设计 + 接口模块划分

> 版本：v1.1  
> 日期：2026-04-18  
> 数据库：PostgreSQL 16  
> ORM：Prisma

---

## 一、数据库表设计

### 设计约定

所有表遵循以下公共字段规范：

```sql
id          String   @id @default(cuid())
created_at  DateTime @default(now())
updated_at  DateTime @updatedAt
created_by  String?  -- 操作人 user id
deleted_at  DateTime?  -- 软删除，null 表示未删除
```

状态字段统一用枚举，不用魔法字符串。

---

## 1. 身份与组织域

### users — 用户表

```prisma
model User {
  id           String      @id @default(cuid())
  email        String      @unique
  displayName  String
  passwordHash String
  status       UserStatus  @default(ACTIVE)
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  deletedAt    DateTime?

  roles        UserRole[]
  orgMembers   OrgMember[]
  agentBinding AgentAccountBinding?
  businessCard BusinessCard?
  sessions     UserSession[]
  auditLogs    AuditLog[]
}

enum UserStatus {
  ACTIVE
  DISABLED
}
```

### user_sessions — 用户会话表

```prisma
model UserSession {
  id                  String         @id @default(cuid())
  userId              String
  deviceId            String
  deviceType          DeviceType
  deviceName          String?
  tokenId             String         @unique
  status              SessionStatus  @default(ACTIVE)
  loginAt             DateTime       @default(now())
  lastActiveAt        DateTime       @default(now())
  logoutAt            DateTime?
  replacedBySessionId String?
  ip                  String?
  userAgent           String?
  createdAt           DateTime       @default(now())
  updatedAt           DateTime       @updatedAt

  user                User           @relation(fields: [userId], references: [id])

  @@index([userId, status])
  @@index([userId, loginAt])
  @@unique([userId, deviceId])
}

enum DeviceType {
  WEB
  MINI_PROGRAM
  MOBILE_H5
}

enum SessionStatus {
  ACTIVE
  LOGGED_OUT
  REPLACED
}
```

### departments — 部门表

```prisma
model Department {
  id        String       @id @default(cuid())
  name      String
  parentId  String?
  sortOrder Int          @default(0)
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  deletedAt DateTime?

  parent    Department?  @relation("DeptTree", fields: [parentId], references: [id])
  children  Department[] @relation("DeptTree")
  members   OrgMember[]
}
```

### org_members — 用户-部门归属表

```prisma
model OrgMember {
  id           String     @id @default(cuid())
  userId       String
  departmentId String
  position     String?
  isPrimary    Boolean    @default(true)
  createdAt    DateTime   @default(now())

  user         User       @relation(fields: [userId], references: [id])
  department   Department @relation(fields: [departmentId], references: [id])

  @@unique([userId, departmentId])
}
```

### roles — 角色表

```prisma
model Role {
  id          String          @id @default(cuid())
  key         String          @unique
  name        String
  description String?
  isSystem    Boolean         @default(false)
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  permissions RolePermission[]
  users       UserRole[]
  dataScopes  RoleDataScope[]
}
```

### permissions — 权限点表

```prisma
model Permission {
  id          String           @id @default(cuid())
  code        String           @unique
  module      String
  action      String
  description String?
  createdAt   DateTime         @default(now())

  roles       RolePermission[]
}
```

### role_permissions — 角色-权限绑定表

```prisma
model RolePermission {
  roleId       String
  permissionId String
  createdAt    DateTime   @default(now())

  role         Role       @relation(fields: [roleId], references: [id])
  permission   Permission @relation(fields: [permissionId], references: [id])

  @@id([roleId, permissionId])
}
```

### user_roles — 用户-角色绑定表

```prisma
model UserRole {
  userId    String
  roleId    String
  createdAt DateTime @default(now())

  user      User @relation(fields: [userId], references: [id])
  role      Role @relation(fields: [roleId], references: [id])

  @@id([userId, roleId])
}
```

### role_data_scopes — 角色数据范围策略表

```prisma
model RoleDataScope {
  id        String    @id @default(cuid())
  roleId    String
  module    String
  scope     DataScope
  createdAt DateTime  @default(now())

  role      Role @relation(fields: [roleId], references: [id])

  @@unique([roleId, module])
}

enum DataScope {
  SELF
  DEPARTMENT
  DEPT_AND_CHILDREN
  ASSIGNED_AGENTS
  ALL
}
```

---

## 2. 代理商域

### agents — 代理商表

```prisma
model Agent {
  id          String              @id @default(cuid())
  code        String              @unique
  name        String
  status      AgentStatus         @default(ACTIVE)
  ruleId      String?
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
  deletedAt   DateTime?

  rule        Rule?               @relation(fields: [ruleId], references: [id])
  bindings    AgentAccountBinding[]
  submissions KeywordSubmission[]
}

enum AgentStatus {
  ACTIVE
  SUSPENDED
  OFFLINE
}
```

### agent_account_bindings — 代理商账号绑定表

```prisma
model AgentAccountBinding {
  id        String   @id @default(cuid())
  agentId   String
  userId    String   @unique
  createdAt DateTime @default(now())

  agent     Agent @relation(fields: [agentId], references: [id])
  user      User  @relation(fields: [userId], references: [id])
}
```

---

## 3. 内容域

### contents — 内容主表

```prisma
model Content {
  id                 String          @id @default(cuid())
  type               ContentType
  title              String
  platformStyle      PlatformKey
  requestedPlatforms PlatformKey[]
  status             ContentStatus   @default(DRAFT)
  syncedToLeads      Boolean         @default(false)
  createdBy          String
  submittedBy        String?
  submittedAt        DateTime?
  reviewedBy         String?
  reviewedAt         DateTime?
  rejectReason       String?
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt
  deletedAt          DateTime?

  versions           ContentVersion[]
  assets             ContentAsset[]
  reviewOrders       ReviewOrder[]
  publishJobs        PublishJob[]
}

enum ContentType {
  COPY
  IMAGE
  VIDEO
  MIXED
}

enum ContentStatus {
  DRAFT
  GENERATED
  SUBMITTED
  APPROVED
  REJECTED
  PUBLISHED
  ARCHIVED
}

enum PlatformKey {
  XIAOHONGSHU
  DOUYIN
  WECHAT_MP
  TAOBAO
  JD
  PDD
  SUPER_SITE
}
```

### content_versions — 内容版本表

```prisma
model ContentVersion {
  id        String        @id @default(cuid())
  contentId String
  version   Int
  body      String        @db.Text
  images    String[]
  videoUrl  String?
  source    VersionSource @default(MANUAL)
  createdBy String
  createdAt DateTime      @default(now())

  content   Content       @relation(fields: [contentId], references: [id])

  @@unique([contentId, version])
}

enum VersionSource {
  AI_GENERATED
  MANUAL
}
```

### content_generation_jobs — AI生成任务表

```prisma
model ContentGenerationJob {
  id         String    @id @default(cuid())
  contentId  String?
  type       GenJobType
  prompt     String    @db.Text
  params     Json
  status     JobStatus @default(PENDING)
  provider   String?
  model      String?
  resultUrls String[]
  error      String?
  startedAt  DateTime?
  finishedAt DateTime?
  createdBy  String
  createdAt  DateTime  @default(now())
}

enum GenJobType {
  COPY
  IMAGE
  VIDEO
}
```

### content_assets — 内容素材引用表

```prisma
model ContentAsset {
  id        String  @id @default(cuid())
  contentId String
  fileId    String
  role      String

  content   Content @relation(fields: [contentId], references: [id])
  file      File    @relation(fields: [fileId], references: [id])
}
```

---

## 4. 商品域

### products — 商品主表

```prisma
model Product {
  id                  String          @id @default(cuid())
  ownerUserId         String
  name                String
  englishName         String
  summary             String          @db.Text
  priceText           String
  originalPriceText   String?
  specialPriceText    String?
  specialTag          String?
  specialOfferEnabled Boolean         @default(false)
  status              ProductStatus   @default(DRAFT)
  rejectReason        String?
  submittedAt         DateTime?
  reviewedAt          DateTime?
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
  deletedAt           DateTime?

  images              ProductImage[]
  statusLogs          ProductStatusLog[]
  reviewOrders        ReviewOrder[]
  publishJobs         PublishJob[]
}

enum ProductStatus {
  DRAFT
  SUBMITTED
  APPROVED
  REJECTED
  PUBLISHED
  OFFLINE
}
```

### product_images — 商品图片表

```prisma
model ProductImage {
  id        String  @id @default(cuid())
  productId String
  fileId    String
  sortOrder Int     @default(0)
  isCover   Boolean @default(false)

  product   Product @relation(fields: [productId], references: [id])
  file      File    @relation(fields: [fileId], references: [id])
}
```

### product_status_logs — 商品状态变更日志

```prisma
model ProductStatusLog {
  id         String         @id @default(cuid())
  productId  String
  fromStatus ProductStatus?
  toStatus   ProductStatus
  reason     String?
  operatedBy String
  createdAt  DateTime       @default(now())

  product    Product        @relation(fields: [productId], references: [id])
}
```

### business_cards — 企业名片表

```prisma
model BusinessCard {
  id            String                   @id @default(cuid())
  userId         String                   @unique
  companyName    String
  position       String
  phone          String
  email          String
  business       String                   @db.Text
  templateKey    BusinessCardTemplateKey  @default(DEFAULT)
  coverFileId    String?
  coverUrl       String?
  createdAt      DateTime                 @default(now())
  updatedAt      DateTime                 @updatedAt
  deletedAt      DateTime?

  user           User                     @relation(fields: [userId], references: [id])
}

enum BusinessCardTemplateKey {
  DEFAULT
  DARK
  LIGHT
}
```

---

## 5. 审核域

### review_orders — 审核单主表

```prisma
model ReviewOrder {
  id           String           @id @default(cuid())
  targetType   ReviewTargetType
  targetId     String
  status       ReviewStatus     @default(PENDING)
  submittedBy  String
  submittedAt  DateTime         @default(now())
  finishedAt   DateTime?
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  contentId    String?
  content      Content?         @relation(fields: [contentId], references: [id])
  productId    String?
  product      Product?         @relation(fields: [productId], references: [id])

  nodes        ReviewNode[]
  actions      ReviewAction[]
}

enum ReviewTargetType {
  CONTENT
  PRODUCT
  RULE
  KEYWORD_SUBMISSION
}

enum ReviewStatus {
  PENDING
  IN_REVIEW
  APPROVED
  REJECTED
  WITHDRAWN
}
```

### review_nodes — 审核节点表

```prisma
model ReviewNode {
  id            String      @id @default(cuid())
  reviewOrderId String
  step          Int
  assignedTo    String?
  status        NodeStatus  @default(PENDING)
  finishedAt    DateTime?
  createdAt     DateTime    @default(now())

  reviewOrder   ReviewOrder @relation(fields: [reviewOrderId], references: [id])
  actions       ReviewAction[]
}

enum NodeStatus {
  PENDING
  APPROVED
  REJECTED
  SKIPPED
}
```

### review_actions — 审核操作记录

```prisma
model ReviewAction {
  id            String           @id @default(cuid())
  reviewOrderId String
  reviewNodeId  String?
  action        ReviewActionType
  comment       String?
  operatedBy    String
  createdAt     DateTime         @default(now())

  reviewOrder   ReviewOrder      @relation(fields: [reviewOrderId], references: [id])
  reviewNode    ReviewNode?      @relation(fields: [reviewNodeId], references: [id])
}

enum ReviewActionType {
  SUBMIT
  APPROVE
  REJECT
  RETURN
  WITHDRAW
  TRANSFER
}
```

---

## 6. 规则域

### rules — 规则主表

```prisma
model Rule {
  id          String       @id @default(cuid())
  type        RuleType
  name        String
  description String?
  status      RuleStatus   @default(DRAFT)
  createdBy   String
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
  deletedAt   DateTime?

  versions    RuleVersion[]
  agents      Agent[]
  hitLogs     RuleHitLog[]
}

enum RuleType {
  KEYWORD
  BLACKLIST
  WHITELIST
  STRUCTURE
  PLATFORM
}

enum RuleStatus {
  DRAFT
  ACTIVE
  DISABLED
}
```

### rule_versions — 规则版本表

```prisma
model RuleVersion {
  id          String    @id @default(cuid())
  ruleId      String
  version     Int
  content     Json
  effectiveAt DateTime?
  createdBy   String
  createdAt   DateTime  @default(now())

  rule        Rule      @relation(fields: [ruleId], references: [id])

  @@unique([ruleId, version])
}
```

### rule_hit_logs — 规则命中日志

```prisma
model RuleHitLog {
  id         String   @id @default(cuid())
  ruleId     String
  targetType String
  targetId   String
  hitKeyword String?
  context    String?
  createdAt  DateTime @default(now())

  rule       Rule     @relation(fields: [ruleId], references: [id])
}
```

---

## 7. 关键词提审域

### keyword_submissions — 关键词提审单

```prisma
model KeywordSubmission {
  id           String              @id @default(cuid())
  displayId    String
  agentId      String
  status       KeywordReviewStatus @default(SUBMITTED)
  rejectReason String?
  submittedAt  DateTime            @default(now())
  reviewedAt   DateTime?
  reviewedBy   String?

  agent        Agent               @relation(fields: [agentId], references: [id])
  items        KeywordItem[]
}

enum KeywordReviewStatus {
  DRAFT
  SUBMITTED
  APPROVED
  REJECTED
}
```

### keyword_items — 关键词条目

```prisma
model KeywordItem {
  id           String             @id @default(cuid())
  submissionId String
  keyword      String
  createdAt    DateTime           @default(now())

  submission   KeywordSubmission  @relation(fields: [submissionId], references: [id])
}
```

---

## 8. 发布域

### publish_channels — 发布渠道配置表

```prisma
model PublishChannel {
  id        String       @id @default(cuid())
  platform  PlatformKey  @unique
  name      String
  isEnabled Boolean      @default(true)
  config    Json?
  createdAt DateTime     @default(now())
  updatedAt DateTime     @updatedAt

  jobs      PublishJob[]
}
```

### publish_jobs — 发布任务表

```prisma
model PublishJob {
  id          String            @id @default(cuid())
  channelId   String
  targetType  PublishTargetType
  contentId   String?
  productId   String?
  scheduledAt DateTime?
  status      PublishStatus     @default(QUEUED)
  lastError   String?
  createdBy   String
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt

  channel     PublishChannel    @relation(fields: [channelId], references: [id])
  content     Content?          @relation(fields: [contentId], references: [id])
  product     Product?          @relation(fields: [productId], references: [id])
  attempts    PublishAttempt[]
}

enum PublishTargetType {
  CONTENT
  PRODUCT
}

enum PublishStatus {
  QUEUED
  RUNNING
  SUCCESS
  FAILED
  CANCELLED
}
```

### publish_attempts — 发布尝试记录

```prisma
model PublishAttempt {
  id         String        @id @default(cuid())
  jobId      String
  attemptNo  Int
  status     PublishStatus
  response   Json?
  error      String?
  startedAt  DateTime      @default(now())
  finishedAt DateTime?

  job        PublishJob    @relation(fields: [jobId], references: [id])
}
```

---

## 9. 文件域

### files — 文件元数据表

```prisma
model File {
  id            String          @id @default(cuid())
  bucket        String
  key           String
  originalName  String
  mimeType      String
  size          Int
  hash          String?
  uploadedBy    String
  createdAt     DateTime        @default(now())

  contentAssets ContentAsset[]
  productImages ProductImage[]
}
```

---

## 10. 审计域

### audit_logs — 审计日志表

```prisma
model AuditLog {
  id           String      @id @default(cuid())
  userId       String
  userEmail    String
  userRole     String
  action       AuditAction
  resourceType String
  resourceId   String
  detail       String?
  ip           String?
  userAgent    String?
  createdAt    DateTime    @default(now())

  user         User        @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([action])
  @@index([createdAt])
}

enum AuditAction {
  LOGIN
  LOGOUT
  PERMISSION_CHANGE
  RULE_CHANGE
  REVIEW_ACTION
  PUBLISH_ACTION
  EXPORT
  SENSITIVE_ACCESS
}
```

### job_records — 异步任务记录表

```prisma
model JobRecord {
  id         String    @id @default(cuid())
  queue      String
  jobId      String
  type       String
  payload    Json
  status     JobStatus @default(PENDING)
  attempts   Int       @default(0)
  maxRetries Int       @default(3)
  error      String?
  startedAt  DateTime?
  finishedAt DateTime?
  createdAt  DateTime  @default(now())

  @@index([queue, status])
  @@index([type])
}

enum JobStatus {
  PENDING
  RUNNING
  SUCCESS
  FAILED
  CANCELLED
}
```

---

## 二、接口模块划分清单

### 约定

- 所有接口统一前缀 `/api`
- 认证方式：`Authorization: Bearer <JWT>`
- 分页参数统一：`?page=1&limit=20&sort=createdAt&order=desc`
- 统一响应结构：

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "requestId": "xxx"
}
```

---

## 1. Auth 模块

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/auth/login` | 账号密码登录；创建会话；超过 2 台设备时挤掉最早设备 | 公开 |
| POST | `/api/auth/logout` | 当前设备退出登录 | 登录 |
| GET | `/api/auth/me` | 获取当前用户信息 + 角色 + 权限 + 数据范围 | 登录 |
| PUT | `/api/auth/password` | 修改密码 | 登录 |
| GET | `/api/auth/sessions` | 当前账号在线设备列表 | 登录 |
| DELETE | `/api/auth/sessions/:id` | 手动下线某台设备 | 登录 |

### POST `/api/auth/login` 请求体

```json
{ "email": "admin@example.com", "password": "xxx" }
```

### GET `/api/auth/me` 返回

```json
{
  "id": "...",
  "email": "...",
  "displayName": "...",
  "roles": ["main_company"],
  "permissions": ["content:create", "review:approve"],
  "dataScope": "ALL"
}
```

---

## 2. User 模块

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/users` | 用户列表 | `rbac:user_read` |
| POST | `/api/users` | 创建用户 | `rbac:user_manage` |
| GET | `/api/users/:id` | 用户详情 | `rbac:user_read` |
| PUT | `/api/users/:id` | 更新用户 | `rbac:user_manage` |
| PUT | `/api/users/:id/status` | 启用 / 禁用 | `rbac:user_manage` |
| DELETE | `/api/users/:id` | 软删除用户 | `rbac:user_manage` |

---

## 3. RBAC 模块

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/roles` | 角色列表 | `rbac:role_read` |
| POST | `/api/roles` | 创建角色 | `rbac:role_manage` |
| PUT | `/api/roles/:id` | 更新角色 | `rbac:role_manage` |
| GET | `/api/roles/:id/permissions` | 角色权限列表 | `rbac:role_read` |
| PUT | `/api/roles/:id/permissions` | 设置角色权限 | `rbac:role_manage` |
| GET | `/api/permissions` | 全部权限点 | `rbac:role_read` |
| PUT | `/api/users/:id/roles` | 分配用户角色 | `rbac:user_manage` |
| PUT | `/api/roles/:id/data-scope` | 设置角色数据范围 | `rbac:role_manage` |

---

## 4. Org 模块

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/departments` | 部门树 | `org:read` |
| POST | `/api/departments` | 创建部门 | `org:manage` |
| PUT | `/api/departments/:id` | 更新部门 | `org:manage` |
| DELETE | `/api/departments/:id` | 删除部门 | `org:manage` |
| GET | `/api/departments/:id/members` | 部门成员 | `org:read` |
| POST | `/api/departments/:id/members` | 添加成员 | `org:manage` |
| DELETE | `/api/departments/:id/members/:userId` | 移除成员 | `org:manage` |

---

## 5. Agent 模块

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/agents` | 代理商列表 | `agent:read` |
| POST | `/api/agents` | 创建代理商 | `agent:manage` |
| GET | `/api/agents/:id` | 代理商详情 | `agent:read` |
| PUT | `/api/agents/:id` | 更新代理商 | `agent:manage` |
| PUT | `/api/agents/:id/status` | 状态变更 | `agent:manage` |
| GET | `/api/agents/:id/keywords` | 代理关键词提审列表 | `agent:read` |
| POST | `/api/agents/:id/account-binding` | 绑定账号 | `agent:manage` |

---

## 6. Content 模块

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/contents` | 内容列表 | `content:read` |
| POST | `/api/contents` | 创建内容草稿 | `content:create` |
| GET | `/api/contents/:id` | 内容详情 | `content:read` |
| PUT | `/api/contents/:id` | 更新内容 | `content:update` |
| DELETE | `/api/contents/:id` | 删除内容 | `content:delete` |
| POST | `/api/contents/:id/submit` | 提交审核 | `content:submit_review` |
| GET | `/api/contents/:id/versions` | 版本列表 | `content:read` |
| POST | `/api/contents/:id/versions` | 保存新版本 | `content:update` |

---

## 7. AI 模块

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/ai/copy/generate` | 生成文案（异步任务） | `content:create` |
| POST | `/api/ai/images/generate` | 生成图片（异步任务） | `content:create` |
| POST | `/api/ai/video/submit` | 提交视频生成任务 | `content:create` |
| POST | `/api/products/infer-english-name` | 根据中文产品名生成英文名 | `product:create` |
| GET | `/api/ai/jobs/:id` | 查询生成任务状态 | `content:read` |
| GET | `/api/ai/providers` | 查询可用模型供应商 | `settings:read` |

### POST `/api/ai/copy/generate` 请求体

```json
{
  "productName": "AI助手",
  "sellingPoints": "更智能、更高效",
  "audience": "企业运营",
  "platformStyle": "XIAOHONGSHU",
  "format": "text"
}
```

### 返回（异步任务模式）

```json
{
  "jobId": "job_xxx",
  "status": "PENDING"
}
```

---

## 8. Product 模块

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/products` | 商品列表，支持中英文名搜索 | `product:read` |
| POST | `/api/products` | 创建商品，支持 `englishName` / `english_name` | `product:create` |
| GET | `/api/products/:id` | 商品详情 | `product:read` |
| PUT | `/api/products/:id` | 更新商品，支持中英文名 | `product:update` |
| DELETE | `/api/products/:id` | 删除商品 | `product:delete` |
| POST | `/api/products/:id/submit` | 提交审核 | `product:submit_review` |
| PUT | `/api/products/:id/special-offer` | 更新特价配置 | `product:update` |

---

## 9. Business Card 模块

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/business-cards/me` | 获取当前登录用户自己的名片 | 登录 |
| PUT | `/api/business-cards/me` | 更新当前登录用户自己的名片 | 登录 |
| POST | `/api/business-cards/me/cover` | 上传当前名片封面图 | 登录 |
| GET | `/api/business-cards/:userId` | 获取指定用户的名片展示信息 | 登录 / 前台受控访问 |

---

## 10. Review 模块

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/reviews` | 审核单列表 | `review:read` |
| GET | `/api/reviews/:id` | 审核单详情 | `review:read` |
| POST | `/api/reviews/:id/approve` | 审核通过 | `review:approve` |
| POST | `/api/reviews/:id/reject` | 审核驳回 | `review:reject` |
| POST | `/api/reviews/:id/return` | 退回修改 | `review:reject` |
| POST | `/api/reviews/:id/withdraw` | 提交人撤回 | `review:withdraw` |
| GET | `/api/reviews/:id/actions` | 操作历史 | `review:read` |

### POST `/api/reviews/:id/reject` 请求体

```json
{ "comment": "关键词不符合规则，请修改第3条" }
```

---

## 11. Rule 模块

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/rules` | 规则列表 | `rule:read` |
| POST | `/api/rules` | 创建规则 | `rule:manage` |
| GET | `/api/rules/:id` | 规则详情 | `rule:read` |
| PUT | `/api/rules/:id` | 更新规则 | `rule:manage` |
| PUT | `/api/rules/:id/status` | 启用 / 禁用 | `rule:manage` |
| GET | `/api/rules/:id/versions` | 规则历史版本 | `rule:read` |
| GET | `/api/rules/:id/hit-logs` | 命中日志 | `rule:read` |

---

## 12. Keyword Submission 模块

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/keyword-submissions` | 提审单列表 | `review:read` |
| POST | `/api/keyword-submissions` | 代理商提交关键词 | `agent:submit` |
| GET | `/api/keyword-submissions/:id` | 提审单详情 | `review:read` |
| POST | `/api/keyword-submissions/:id/approve` | 审核通过 | `review:approve` |
| POST | `/api/keyword-submissions/:id/reject` | 审核驳回 | `review:reject` |

---

## 13. Publish 模块

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/publish/jobs` | 发布任务列表 | `publish:read` |
| POST | `/api/publish/jobs` | 创建发布任务 | `publish:create` |
| GET | `/api/publish/jobs/:id` | 任务详情 | `publish:read` |
| POST | `/api/publish/jobs/:id/cancel` | 取消任务 | `publish:manage` |
| POST | `/api/publish/jobs/:id/retry` | 手动重试 | `publish:manage` |
| GET | `/api/publish/jobs/:id/attempts` | 尝试记录 | `publish:read` |
| GET | `/api/publish/channels` | 渠道列表 | `publish:read` |
| PUT | `/api/publish/channels/:id` | 更新渠道配置 | `settings:manage` |

---

## 14. Asset 模块

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/assets/upload` | 上传文件（multipart） | 登录 |
| GET | `/api/assets` | 文件列表 | `asset:read` |
| GET | `/api/assets/:id` | 文件详情 | `asset:read` |
| DELETE | `/api/assets/:id` | 删除文件 | `asset:delete` |
| GET | `/api/assets/:id/url` | 获取访问签名 URL | `asset:read` |

---

## 15. Audit 模块

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/audit/logs` | 审计日志列表 | `audit:read` |
| GET | `/api/audit/logs/export` | 导出审计日志 | `audit:export` |

---

## 16. Settings 模块

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/settings/system` | 系统配置 | `settings:read` |
| PUT | `/api/settings/system` | 更新系统配置 | `settings:manage` |
| GET | `/api/settings/integrations` | 第三方集成配置列表 | `settings:read` |
| PUT | `/api/settings/integrations/:key` | 更新集成配置 | `settings:manage` |
| GET | `/api/settings/ai-providers` | AI 供应商配置列表 | `settings:read` |
| PUT | `/api/settings/ai-providers/:key` | 更新 AI 供应商配置 | `settings:manage` |

---

## 17. 健康检查

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/health` | 服务健康状态 | 公开 |
| GET | `/api/health/db` | 数据库连接状态 | 运维 |
| GET | `/api/health/redis` | Redis 连接状态 | 运维 |

---

## 三、表关系总览

```text
User ──────────── UserRole ─── Role ─── RolePermission ─── Permission
 │  └──────────── UserSession
 │  └──────────── BusinessCard
 │                                │
 │                                └── RoleDataScope
 │
 ├── OrgMember ─────── Department
 │
 ├── AgentAccountBinding ─── Agent ─── Rule
 │                              │
 │                              └── KeywordSubmission ─── KeywordItem
 │
 ├── Content ─── ContentVersion
 │     │       └── ContentAsset ─── File
 │     │
 │     └── ReviewOrder ─── ReviewNode ─── ReviewAction
 │     └── PublishJob ─── PublishAttempt ─── PublishChannel
 │
 ├── Product ─── ProductImage ─── File
 │     │       └── ProductStatusLog
 │     └── ReviewOrder
 │     └── PublishJob
 │
 ├── ContentGenerationJob
 │
 ├── RuleHitLog ─── Rule ─── RuleVersion
 │
 ├── AuditLog
 └── JobRecord
```

---

## 四、重要设计说明

### 1. 多态关联处理

`ReviewOrder` 和 `PublishJob` 同时关联 `Content` 和 `Product`。  
建议优先使用 `targetType + targetId` 软关联 + 冗余外键两种方式并存，以兼顾查询性能和 Prisma ORM 的实现便利性。

### 2. 软删除

所有核心业务表携带 `deletedAt`，查询时默认过滤 `deletedAt IS NULL`。  
建议在 Prisma 中通过全局中间件自动注入软删除过滤。

### 3. 版本化

内容、规则均携带版本记录。

- 内容版本：每次 AI 生成或人工保存都创建新 `ContentVersion`
- 规则版本：每次修改规则内容都创建新 `RuleVersion`，旧版本不删除

### 4. 会话并发控制

账号会话并发策略如下：

- 每个后台账号最多同时在线 `2` 台设备
- 第 `3` 台设备登录时，自动挤掉最早登录设备
- 被挤下线设备的 `user_sessions.status` 标记为 `REPLACED`
- 登录时间不主动过期，但会通过 `lastActiveAt` 记录活跃时间

### 5. 企业名片约束

企业名片约束如下：

- `business_cards.user_id` 唯一
- 每个后台账号只有一张名片
- 小程序 / H5 名片页复用后台账号体系与名片数据

### 6. 商品英文名策略

商品英文名策略如下：

- `products.english_name` 为正式持久化字段
- 中文产品名录入后可自动推断 / 翻译英文名
- 用户可手动修正自动结果
- 前台展示、搜索、接口响应统一支持中英文商品名

### 7. 审计触发点

以下操作必须在 `AuditLog` 留记录：

- 登录 / 登出 / 会话挤下线
- 角色 / 权限变更
- 规则上线 / 下线
- 审核通过 / 驳回
- 发布 / 重试 / 取消
- 文件导出
- 企业名片更新