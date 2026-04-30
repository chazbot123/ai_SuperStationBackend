# 数据库表设计 + 接口模块划分

> 版本：v1.2  
> 日期：2026-04-21  
> 数据库：PostgreSQL 16  
> ORM：Prisma 7（必须使用 driver adapter，见 `server/prisma.config.ts`）

> **阅读约定**：标注 ✅ 的表和接口为当前已实现并落库的内容；其余为规划设计，尚未落地。

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

### users — 用户表 ✅

> **当前实现**：使用 `username` 登录（非 `email`）；角色通过 `role` 单字段枚举控制，暂无 RBAC 关联表；无 `status` 字段和软删除。

```prisma
// 目标设计（规划中，未落库）
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

// 当前实际 schema（已落库）
model User {
  id           String      @id @default(cuid())
  username     String      @unique   // 登录凭证，非 email
  passwordHash String
  displayName  String
  companyName  String?
  role         UserRole    @default(employee)
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  sessions     UserSession[]
  businessCard BusinessCard?
  products     Product[]   @relation("ProductCreator")
}

enum UserRole {
  main_company
  level1_agent
  department_admin
  employee
}
```

enum UserStatus {
  ACTIVE
  DISABLED
}

### user_sessions — 用户会话表 ✅

> **当前实现**：无 `tokenId`、无 `deviceType`；状态枚举为小写 `active / revoked / squeezed`；按 `loggedInAt` 排序和挤设备。

```prisma
// 目标设计（规划中，未落库）
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

// 当前实际 schema（已落库）
model UserSession {
  id           String        @id @default(cuid())
  userId       String
  deviceId     String
  deviceName   String?
  ipAddress    String?
  userAgent    String?
  status       SessionStatus @default(active)
  loggedInAt   DateTime      @default(now())
  revokedAt    DateTime?
  replacedById String?
  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, status, loggedInAt])
}

enum SessionStatus {
  active
  revoked
  squeezed
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

### agents — 代理商表 ✅

> **当前实现**：字段为 `code / name / status / ruleId / userId / createdAt / updatedAt`；当前仅实现一级代理基础管理，`ruleId` 先以字符串占位保存，未落库规则表关联。
> **当前接口**：`GET /api/agents`、`POST /api/agents`、`GET /api/agents/:id`、`PATCH /api/agents/:id`。

```prisma
// 当前实际 schema（已落库）
model Agent {
  id        String      @id @default(cuid())
  code      String      @unique
  name      String
  status    AgentStatus @default(active)
  ruleId    String?
  userId    String?     @unique
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt
  user      User?       @relation(fields: [userId], references: [id], onDelete: SetNull)
}

enum AgentStatus {
  active
  disabled
}
```

```prisma
// 目标设计（规划中，未落库）
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

### products — 商品主表 ✅

> **当前实现**：字段为 `id / creatorId / name / englishName / description / createdAt / updatedAt`；无审核状态、无软删除；`englishName` 在创建/更新时自动从中文名推导，也可手动指定。

```prisma
// 当前实际 schema（已落库）
model Product {
  id          String   @id @default(cuid())
  creatorId   String
  name        String
  englishName String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  creator     User     @relation("ProductCreator", fields: [creatorId], references: [id])
}
```

```prisma
// 目标设计（规划中，未落库）
model Product {
  id                  String          @id @default(cuid())
  creatorId           String
  name                String
  englishName         String
  description         String?
  status              ProductStatus   @default(DRAFT)
  rejectReason        String?
  submittedAt         DateTime?
  reviewedAt          DateTime?
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
  deletedAt           DateTime?

  creator             User            @relation("ProductCreator", fields: [creatorId], references: [id])
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

### product_images — 商品图片表（规划中，未落库）

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

### product_status_logs — 商品状态变更日志（规划中，未落库）

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

### business_cards — 企业名片表 ✅

> **当前实现**：字段为 `companyName / jobTitle / phone / email / businessScope / coverImageUrl / templateKey`；无 `coverFileId`；模板枚举为 `classic_blue / dark_grid / light_modern`。

```prisma
model BusinessCard {
  id            String                  @id @default(cuid())
  userId        String                  @unique
  companyName   String
  jobTitle      String
  phone         String
  email         String
  businessScope String
  coverImageUrl String?
  templateKey   BusinessCardTemplateKey @default(classic_blue)
  createdAt     DateTime                @default(now())
  updatedAt     DateTime                @updatedAt
  user          User                    @relation(fields: [userId], references: [id], onDelete: Cascade)
}

enum BusinessCardTemplateKey {
  classic_blue
  dark_grid
  light_modern
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

## 1. Auth 模块 ✅

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/auth/login` | 账号密码登录；创建会话；超过 2 台设备时挤掉最早设备 | 公开 |
| GET | `/api/auth/me` | 获取当前登录用户信息 | 登录 |
| POST | `/api/auth/logout` | 当前设备退出登录 | 登录 |
| PUT | `/api/auth/password` | 修改当前用户密码；成功后当前账号全部在线会话失效 | 登录 |
| GET | `/api/auth/sessions` | 当前账号设备会话列表 | 登录 |

### 当前前端已对齐部分

- 登录页已接真实 `/api/auth/login`
- 登录后已接真实 `/api/auth/me`
- 顶部退出按钮已接真实 `/api/auth/logout`
- 顶部已提供“修改密码”按钮，调用 `/api/auth/password`
- 当前前端已支持 `main_company / level1_agent / department_admin / employee` 四种角色映射

### 当前仍未对齐部分

- 设备会话列表接口 `/api/auth/sessions` 已实现，但 demo 页面还未提供对应展示入口

### POST `/api/auth/login` 请求体

> **当前实现**：以 `username` 登录（非 `email`）；`deviceId` / `deviceName` 为必填，用于设备会话管理。

```json
{
  "username": "demo_admin",
  "password": "xxx",
  "deviceId": "browser-uuid-xxx",
  "deviceName": "Chrome on Mac"
}
```

> **当前实现**：密码已接入 bcrypt 校验；历史明文数据在用户成功登录后会自动迁移为 bcrypt 哈希。

### GET `/api/auth/me` 返回

```json
{
  "id": "...",
  "username": "demo_admin",
  "displayName": "管理员",
  "companyName": "智邻科技",
  "role": "main_company",
  "agentId": null,
  "createdAt": "2026-04-21T10:00:00.000Z",
  "updatedAt": "2026-04-21T10:00:00.000Z"
}
```

### PUT `/api/auth/password` 请求体

```json
{
  "oldPassword": "123456",
  "newPassword": "new-password"
}
```

### GET `/api/auth/sessions` 返回示例

```json
[
  {
    "id": "session_xxx",
    "deviceId": "browser-uuid-xxx",
    "deviceName": "Chrome on Mac",
    "status": "active",
    "loggedInAt": "2026-04-21T10:00:00.000Z",
    "revokedAt": null,
    "replacedById": null
  }
]
```

---

## 2. User 模块 ✅

> **Demo 对照**：`src/pages/Rbac.tsx` 的“用户管理”已切到真实 `/api/users`。当前页面字段已改为 `username / password / displayName / companyName / role`，不再使用 demo 里的 `email / status` 口径。
>
> **权限边界**：主公司可管理全部用户；非主公司角色不能进入用户管理页，仅允许通过接口查看自己的用户详情，并仅可修改自己的密码。

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/users` | 用户列表；支持 `?q=` 搜索用户名/显示名/公司名；分页 `?page=&limit=` | 主公司 |
| POST | `/api/users` | 创建用户；密码落库前自动转 bcrypt 哈希 | 主公司 |
| GET | `/api/users/:id` | 用户详情；主公司可查看任意账号，其他角色仅可查看自己 | 登录 |
| PATCH | `/api/users/:id` | 更新用户；主公司可更新显示名、密码、公司名、角色，其他角色仅可修改自己的密码 | 登录 |
| DELETE | `/api/users/:id` | 删除用户；会先清理该用户会话 | 主公司 |

### 当前前端已对齐部分

- 用户管理列表：真实读取 `/api/users`
- 新增用户：真实调用 `POST /api/users`
- 用户详情：真实调用 `GET /api/users/:id`
- 用户编辑：真实调用 `PATCH /api/users/:id`
- 主公司可在用户管理中直接修改任意账号密码
- 删除用户：真实调用 `DELETE /api/users/:id`
- 搜索字段：按后端真实口径使用 `username / displayName / companyName`

### 当前仍未对齐部分

- 无用户级剩余缺口；`Rbac` 页中的“角色管理”“权限矩阵”已独立归入后端 `RBAC` 模块，不再归类为 `users` 模块未对齐项

### GET `/api/users` 查询参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `q` | string | 否 | — | 用户名 / 显示名 / 公司名模糊搜索 |
| `page` | int | 否 | 1 | 页码，最小 1 |
| `limit` | int | 否 | 20 | 每页数，最大 100 |

### POST `/api/users` 请求体

```json
{
  "username": "demo_user",
  "password": "123456",
  "displayName": "演示员工",
  "companyName": "智邻科技",
  "role": "employee"
}
```

### PATCH `/api/users/:id` 请求体

```json
{
  "displayName": "新显示名",
  "password": "new-password",
  "companyName": "新公司名",
  "role": "department_admin"
}
```

---

## 3. RBAC 模块 ✅

> **当前实现口径**：已落地的是面向 demo 页 `src/pages/Rbac.tsx` 的简化 RBAC 接口，不是本节原先规划的完整 `roles / permissions / data-scope` 体系。
>
> **当前前端状态**：角色管理与权限矩阵已接真实后端 `/api/rbac` 系列接口；后端模块也已注册到 `AppModule`。

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/rbac` | 获取角色列表与页面权限矩阵 | 登录 |
| PATCH | `/api/rbac/roles` | 更新角色名称 | 主公司 |
| PATCH | `/api/rbac/permissions` | 更新页面权限矩阵 | 主公司 |

### 当前前端已对齐部分

- `Rbac` 页“角色管理”已接真实 `/api/rbac/roles`
- `Rbac` 页“权限矩阵”已接真实 `/api/rbac/permissions`
- 页面访问控制 `RequirePageAccess` 已使用真实权限矩阵结果

### 当前实现范围

- 角色键固定为：`main_company / level1_agent / department_admin / employee`
- 权限粒度当前只覆盖页面级访问控制
- 后端会在首次读取时自动补齐默认角色与默认页面权限

### 当前仍未实现部分

- 文档原规划中的 `/api/roles`、`/api/permissions`、用户多角色分配、数据范围策略接口尚未落地

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

## 5. Agent 模块 ✅

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/agents` | 代理列表；支持 `?q=` 搜索编号/名称，支持 `?status=` 过滤；分页 `?page=&limit=` | 登录 |
| POST | `/api/agents` | 创建代理；仅主公司可创建 | 登录 |
| GET | `/api/agents/:id` | 代理详情；主公司可查看全部，其他角色仅可查看绑定到自己的代理 | 登录 |
| PATCH | `/api/agents/:id` | 更新代理名称、状态、规则；仅主公司可更新 | 登录 |

> **权限说明**：`main_company` 可查看全部代理并执行创建、更新；非主公司角色仅可查看 `userId = me` 的代理。

### GET `/api/agents` 查询参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `q` | string | 否 | — | 代理编号 / 名称模糊搜索 |
| `status` | `active \| disabled` | 否 | — | 按代理状态过滤 |
| `page` | int | 否 | 1 | 页码，最小 1 |
| `limit` | int | 否 | 20 | 每页数，最大 100 |

### POST `/api/agents` 请求体

```json
{
  "code": "A001",
  "name": "杭州一级代理",
  "ruleId": "rule_demo_001"
}
```

> `ruleId` 可选，当前仅按字符串保存。

### PATCH `/api/agents/:id` 请求体

```json
{
  "name": "杭州一级代理-新名称",
  "status": "active",
  "ruleId": "rule_demo_002"
}
```

---

## 6. AI 内容生成模块（当前实现）

> **说明**：以下内容对应 `studio / studio/product-images / videos / videos/product-build / videos/avatar-ads`。当前状态已从纯 demo 本地流演进为“部分模块已接真实后端、部分模块仍保留前端草稿流”的混合模式。

### 6.1 社媒图文生成

- 页面：`/studio/social`
- 用途：生成社媒图文内容，支持提示词、素材上传、结果预览、提交审核、同步获客
- 当前状态：前后端已接通，服务端会并行生成文案和图片，并将结果落库到 `SocialGeneratedPost`
- 当前支持：列表查询、生成、单条提审、标记“已同步获客”
- 当前说明：审核中心对社媒图文的完整后端闭环仍未单独落地，当前更偏“生成结果已落库 + 提审入口已接通”

### 6.2 商品图与详情图生成

- 页面：`/studio/product-images`
- 用途：生成商品主图、场景图、详情图，可提交审核并同步到获客/商品下游
- 当前状态：仅 demo 页面与本地状态，后端未实现

### 6.3 视频生成

- 页面：`/videos`
- 子页面：`/videos/product-build`、`/videos/avatar-ads`
- 用途：产品视频生成、真人口播视频生成
- 当前状态：前后端已接通，支持真实视频任务创建、轮询、成片回写与草稿箱展示
- 产品视频：已支持 Vidu 视频任务创建、任务轮询、可选配音/BGM 合成、成片默认烧录中文字幕
- 真人口播：已支持脚本分片、BullMQ 队列调度、分片提交/轮询/下载、最终拼接、成片默认烧录中文字幕
- 相关接口：
  - `POST /api/ai/generate-video`
  - `GET /api/ai/video-tasks/:taskId`
  - `POST /api/ai/avatar-video-tasks`
  - `GET /api/ai/avatar-video-tasks/:taskId`
  - `POST /api/ai/avatar-video-tasks/:taskId/retry`

---

## 7. Product 模块（Demo 主语义）

> **demo 主语义**：商品管理中心。支持商品基础信息、图片、价格、特价配置、提交审核、审核上架、下架。
>
> **当前后端现状**：已覆盖产品管理 demo 主链路，包括价格、图片、特价字段、提审、审核、上架/下架；独立审核中心模块仍以 demo 页面组织为主。

### Demo 页面语义

- 页面：`/products`
- 字段：`name / englishName / summary / priceText / images / specialOfferEnabled / originalPriceText / specialPriceText / specialTag`
- 状态：`draft / submitted / live / rejected / offline`
- 权限语义：主公司可看全部商品并审核；一级代理管理自己的商品并提交审核

### 当前已实现接口 ✅

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/products` | 商品列表；支持 `?q=` 搜索中文名/英文名/摘要/描述；分页 `?page=&limit=` | 登录 |
| POST | `/api/products` | 创建商品；支持摘要、价格、特价字段、图片列表；`englishName` 可选 | 登录 |
| GET | `/api/products/:id` | 商品详情 | 登录 |
| PATCH | `/api/products/:id` | 更新商品；非主公司角色仅可编辑自己名下的草稿/驳回商品 | 登录 |
| DELETE | `/api/products/:id` | 删除商品；非主公司角色仅可删除自己名下的草稿/驳回/已下架商品 | 登录 |
| POST | `/api/products/:id/submit` | 一级代理提交商品审核 | 登录 |
| POST | `/api/products/:id/publish` | 主公司上架草稿或已下架商品 | 主公司 |
| POST | `/api/products/:id/unpublish` | 主公司下架已上架商品 | 主公司 |
| POST | `/api/products/:id/approve` | 主公司审核通过并上架待审核商品 | 主公司 |
| POST | `/api/products/:id/reject` | 主公司驳回待审核商品 | 主公司 |
| POST | `/api/products/infer-english-name` | 根据中文名推导英文名（不落库） | 登录 |

> **权限说明**：`main_company` 角色可查看全部商品并执行审核与上下架；其他角色只能操作自己创建的商品（`creatorId = me`），且不能直接上架。

### GET `/api/products` 查询参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `q` | string | 否 | — | 中英文名/描述模糊搜索 |
| `page` | int | 否 | 1 | 页码，最小 1 |
| `limit` | int | 否 | 20 | 每页数，最大 100 |

### POST `/api/products` 请求体

```json
{
  "name": "智能音箱",
  "englishName": "smart-speaker",
  "summary": "适合家庭场景的智能语音设备",
  "priceText": "¥599",
  "specialOfferEnabled": true,
  "originalPriceText": "¥799",
  "specialPriceText": "¥599",
  "specialTag": "限时特价",
  "images": ["data:image/png;base64,..."],
  "description": "支持语音控制的智能家居设备"
}
```

> `englishName` / `description` / 特价字段 / 图片字段均可选。省略 `englishName` 时自动推导（转 kebab-case）。

### POST `/api/products/infer-english-name` 请求体

```json
{ "name": "智能音箱" }
```

返回：`{ "englishName": "zhi-neng-yin-xiang" }`

---

## 8. Business Card 模块 ✅

> **说明**：企业名片是独立模块，不并入“前台配置中心”。

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/business-cards/me` | 获取当前登录用户自己的名片 | 登录 |
| PUT | `/api/business-cards/me` | 更新当前登录用户自己的名片 | 登录 |
| POST | `/api/business-cards/me/cover` | 上传当前名片封面图 | 登录 |
| GET | `/api/business-cards/:userId` | 获取指定用户的名片展示信息 | 登录 / 前台受控访问 |

---

## 9. Review 模块（Demo 主语义）

> **说明**：以后台 demo 页面 `/reviews` 为准。当前后端未实现真实审核中心接口。

### Demo 页面语义

- 页面：`/reviews`
- 模块名：审核中心
- 审核范围：
  - 素材审核
  - 产品审核
- 当前状态：仅 demo 页面与本地状态，后端未实现

---

## 10. 模型配置模块

> **说明**：后台页面 `/rules` 的主语义当前是模型配置，不是关键词规则。该模块前后端已接通，配置当前存储在 Redis。

### Demo 页面语义

- 页面：`/rules`
- 模块名：模型配置
- 配置范围：
  - 文字模型
  - 图片模型
  - 视频模型
- 典型字段：
  - `providerName`
  - `baseUrl`
  - `apiKey`
  - `modelName`
  - `timeoutSeconds`
  - `maxRetries`
  - `responseFormat`
- 典型用途：
  - 图文文案
  - 商品图生成
  - 视频生成
  - AI 客服
  - RAG 回答
- 当前状态：前后端已接通，支持查看当前激活配置、测试连接、保存并激活模型配置
- 当前接口：
  - `GET /api/ai/model-configs/active`
  - `GET /api/ai/model-configs/saved`
  - `POST /api/ai/model-configs/:type/test`
  - `PUT /api/ai/model-configs/:type/activate`
- 权限说明：仅主公司可管理模型配置

---

## 11. Keyword Rule 模块 ✅

> **说明**：这是当前后端实际已实现的规则模块，用于关键词提交约束；它不再代表后台菜单 `/rules` 的主语义。

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/rules` | 规则列表；支持 `?q=` 搜索规则名；分页 `?page=&limit=` | 登录 |
| POST | `/api/rules` | 创建关键词规则；仅主公司可创建 | 登录 |
| GET | `/api/rules/:id` | 关键词规则详情 | 登录 |
| PATCH | `/api/rules/:id` | 更新关键词规则；仅主公司可更新 | 登录 |

> **权限说明**：当前最小实现仅支持 `main_company` 创建、更新规则；已登录用户可查看规则列表与详情。

### GET `/api/rules` 查询参数

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `q` | string | 否 | — | 规则名模糊搜索 |
| `page` | int | 否 | 1 | 页码，最小 1 |
| `limit` | int | 否 | 20 | 每页数，最大 100 |

### POST `/api/rules` 请求体

```json
{
  "name": "标准关键词规则",
  "minCount": 3,
  "maxCount": 10,
  "minLen": 2,
  "maxLen": 20,
  "dedupeRequired": true,
  "sensitiveFilterEnabled": true,
  "submitRateLimitPerDay": 50
}
```

### PATCH `/api/rules/:id` 请求体

```json
{
  "name": "标准关键词规则-新版",
  "maxCount": 12,
  "dedupeRequired": false,
  "submitRateLimitPerDay": 80
}
```

---

## 12. 知识库 / RAG 模块（当前实现状态）

> **说明**：以后台 demo 页面 `/assets` 为准。前端仍以 demo 页面为主，但后端已具备知识库核心数据结构与依赖准备。

### Demo 页面语义

- 页面：`/assets`
- 模块名：知识库管理
- 主要能力：
  - 本地知识库目录绑定
  - 知识文件列表
  - 切片数与索引状态
  - 检索测试台
- 当前状态：
  - 前端：仍以 demo 页面与本地展示为主
  - 后端：Prisma 已新增 `KnowledgeDocument / KnowledgeDocumentChunk / KnowledgeDocumentJob`，并预留向量字段与解析/索引状态枚举
  - 依赖：已接入 PDF、DOCX、OCR、向量化相关基础依赖
- 当前说明：知识库完整业务接口仍未作为正式模块对外开放，不建议写成“全链路已上线”

---

## 13. 获客内容池 / Publish 模块（Demo 主语义）

> **说明**：以后台 demo 页面 `/publishing` 为准。当前后端未实现该模块。

### Demo 页面语义

- 页面：`/publishing`
- 模块名：获客内容池
- 主要能力：
  - 审核通过内容列表
  - 一键发布到平台草稿箱
  - 发布记录
  - 上传超级站
- 当前状态：仅 demo 页面与本地状态，后端未实现

---

## 14. AI 客服 / 工单中心（Demo 主语义）

> **说明**：以后台 demo 页面 `/support` 为准。当前后端未实现该模块。

### Demo 页面语义

- 页面：`/support`
- 模块名：AI 客服 / 工单中心
- 主要能力：
  - 工单列表与状态流转
  - 对话线程
  - AI 回复置信度展示
  - 转人工占位
  - 联系方式查看审计
- 当前状态：仅 demo 页面与本地状态，后端未实现

---

## 15. 前台配置中心（Demo 主语义，低优先级）

> **说明**：以后台 demo 页面 `/personalization` 为准。该模块当前开发优先级较低；企业名片不归此模块。当前后端未实现。

### Demo 页面语义

- 页面：`/personalization`
- 模块名：前台配置中心
- 主要能力：
  - 站点模板与模块布局
  - 运营指标配置
  - 行业与招商信息配置
  - AI 形象配置
- 当前状态：仅 demo 页面与本地状态，后端未实现

---

## 16. Settings 模块（规划中）

> **说明**：保留为系统级设置与集成配置的规划入口，不等同于当前 demo 中的“前台配置中心”页面。

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
| GET | `/health` | 服务健康状态；当前返回 `{ status: "ok" }` | 公开 |
| GET | `/` | 服务根路径状态；当前返回服务名与 `status: ok` | 公开 |

> **当前实现说明**：`/api/health`、`/api/health/db`、`/api/health/redis` 尚未在当前代码中提供，现阶段仅有最小健康检查与根路径状态接口。

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
- 被挤下线设备的 `user_sessions.status` 标记为 `squeezed`
- 当前实际 schema 使用 `loggedInAt` 记录登录时间，`revokedAt` 记录主动下线时间；未实现 `lastActiveAt`

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
