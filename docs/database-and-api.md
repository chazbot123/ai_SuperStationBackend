# 数据库与接口文档

> 版本：v1.2  
> 日期：2026-04-20  
> 数据库：PostgreSQL 16  
> ORM：Prisma  
> 本次重点：企业名片、认证会话、商品英文名

---

## 一、设计约定

- 所有接口统一前缀为 `/api`
- 认证方式可采用 `session + token` 组合，对外文档统一按“已登录态”描述
- 公共字段建议保留：`id`、`createdAt`、`updatedAt`、`createdBy`、`deletedAt`
- 响应结构建议统一为：

```json
{
  "code": 0,
  "message": "ok",
  "data": {},
  "requestId": "req_xxx"
}
```

---

## 二、字段变更表

### 1. 企业名片

| 对象 | 字段 | 类型 | 说明 |
|------|------|------|------|
| `business_cards` | `id` | string | 主键 |
| `business_cards` | `userId` | string | 关联后台账号，唯一 |
| `business_cards` | `enterpriseName` | string | 企业名称 |
| `business_cards` | `title` | string | 岗位/职位 |
| `business_cards` | `phone` | string | 联系电话 |
| `business_cards` | `email` | string | 联系邮箱 |
| `business_cards` | `businessScope` | string | 主营业务 |
| `business_cards` | `coverFileId` | string? | 名片封面文件 ID |
| `business_cards` | `coverUrl` | string? | 对外可访问封面地址 |
| `business_cards` | `templateKey` | string? | 名片模板标识 |
| `business_cards` | `isEnabled` | boolean | 是否启用展示 |

### 2. 认证会话

| 对象 | 字段 | 类型 | 说明 |
|------|------|------|------|
| `auth_sessions` | `id` | string | session 主键 |
| `auth_sessions` | `userId` | string | 所属账号 |
| `auth_sessions` | `deviceType` | string | 设备类型，如 web / mp / h5 |
| `auth_sessions` | `deviceName` | string? | 设备名称 |
| `auth_sessions` | `clientIp` | string? | 登录 IP |
| `auth_sessions` | `userAgent` | string? | 客户端 UA |
| `auth_sessions` | `lastActiveAt` | datetime | 最近活跃时间 |
| `auth_sessions` | `loggedInAt` | datetime | 登录时间 |
| `auth_sessions` | `loggedOutAt` | datetime? | 登出或被下线时间 |
| `auth_sessions` | `status` | enum | `online` / `offline` / `kicked` |

### 3. 商品

| 对象 | 字段 | 类型 | 说明 |
|------|------|------|------|
| `products` | `name` | string | 中文商品名 |
| `products` | `englishName` | string? | 英文商品名，主存储字段 |
| `products` | `english_name` | string? | 兼容别名，仅接口输入输出映射 |
| `products` | 其他原字段 | - | 保持原商品结构不变 |

### 4. 前端 Store 契约

| 领域 | 方法 | 说明 |
|------|------|------|
| 企业名片 | `ensureBusinessCard(userId)` | 保证账号名片初始化存在 |
| 企业名片 | `updateBusinessCard(userId, payload)` | 更新企业名片 |
| 企业名片 | `getBusinessCardByUserId(userId)` | 获取用户公开名片 |
| 商品英文名 | `inferEnglishProductName(name)` | 根据中文名生成英文名 |
| 商品创建 | `addProduct()` | 创建商品并自动回填英文名 |

> 备注：README 已声明上述前端能力；本次项目检索未完整检出对应同名源码实现，文档按最新业务契约先行收口。

---

## 三、推荐数据模型

### 1. `BusinessCard`

```prisma
model BusinessCard {
  id            String   @id @default(cuid())
  userId        String   @unique
  enterpriseName String
  title         String?
  phone         String?
  email         String?
  businessScope String?  @db.Text
  coverFileId   String?
  coverUrl      String?
  templateKey   String?
  isEnabled     Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  user          User     @relation(fields: [userId], references: [id])
}
```

### 2. `AuthSession`

```prisma
model AuthSession {
  id           String   @id @default(cuid())
  userId       String
  deviceType   String
  deviceName   String?
  clientIp     String?
  userAgent    String?
  lastActiveAt DateTime @default(now())
  loggedInAt   DateTime @default(now())
  loggedOutAt  DateTime?
  status       SessionStatus @default(ONLINE)

  user         User     @relation(fields: [userId], references: [id])

  @@index([userId, status, loggedInAt])
}

enum SessionStatus {
  ONLINE
  OFFLINE
  KICKED
}
```

### 3. `Product`

```prisma
model Product {
  id                  String   @id @default(cuid())
  ownerUserId         String
  name                String
  englishName         String?
  summary             String   @db.Text
  priceText           String
  originalPriceText   String?
  specialPriceText    String?
  specialTag          String?
  specialOfferEnabled Boolean  @default(false)
  status              ProductStatus @default(DRAFT)
  rejectReason        String?
  submittedAt         DateTime?
  reviewedAt          DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  deletedAt           DateTime?
}
```

---

## 四、接口变更表

### 1. 企业名片接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/business-cards/me` | 获取当前登录用户自己的名片 | 已登录 |
| PUT | `/api/business-cards/me` | 更新当前登录用户自己的名片 | 已登录 |
| GET | `/api/business-cards/:userId` | 获取指定用户名片展示信息 | 公开或按业务放行 |
| POST | `/api/business-cards/me/cover` | 上传名片封面图 | 已登录 |

**GET `/api/business-cards/me` 返回示例**

```json
{
  "id": "bc_001",
  "userId": "user_001",
  "enterpriseName": "示例科技",
  "title": "运营负责人",
  "phone": "13800001234",
  "email": "demo@company.com",
  "businessScope": "AI 超级站、智能名片、数字营销系统",
  "coverUrl": "https://files.example.com/business-card/cover-001.jpg",
  "templateKey": "black_gold",
  "isEnabled": true
}
```

**PUT `/api/business-cards/me` 请求体示例**

```json
{
  "enterpriseName": "示例科技",
  "title": "运营负责人",
  "phone": "13800001234",
  "email": "demo@company.com",
  "businessScope": "AI 超级站、智能名片、数字营销系统",
  "templateKey": "black_gold",
  "isEnabled": true
}
```

### 2. 认证 / 会话接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/auth/login` | 登录，成功后创建 session | 公开 |
| POST | `/api/auth/logout` | 当前设备退出登录 | 已登录 |
| GET | `/api/auth/me` | 获取当前用户、角色、权限、数据范围 | 已登录 |
| GET | `/api/auth/sessions` | 获取当前账号在线设备列表 | 已登录 |
| DELETE | `/api/auth/sessions/:id` | 手动下线某一台设备 | 已登录 |

**POST `/api/auth/login` 请求体**

```json
{
  "account": "main@demo.local",
  "password": "demo"
}
```

**POST `/api/auth/login` 返回体**

```json
{
  "accessToken": "token_xxx",
  "sessionId": "sess_xxx",
  "user": {
    "id": "user_001",
    "email": "main@demo.local",
    "displayName": "主公司",
    "roles": ["main_company"],
    "permissions": ["product:create", "product:update", "business_cards:read_self"],
    "dataScope": "ALL"
  }
}
```

**GET `/api/auth/sessions` 返回体**

```json
[
  {
    "id": "sess_001",
    "deviceType": "web",
    "deviceName": "Chrome on Windows",
    "clientIp": "10.0.0.8",
    "loggedInAt": "2026-04-20T10:00:00Z",
    "lastActiveAt": "2026-04-20T10:35:00Z",
    "current": true
  }
]
```

### 3. 商品接口

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/products` | 商品列表，支持英文名检索 | 已登录 |
| POST | `/api/products` | 创建商品 | 已登录 |
| GET | `/api/products/:id` | 商品详情 | 已登录 |
| PUT | `/api/products/:id` | 更新商品 | 已登录 |
| DELETE | `/api/products/:id` | 删除商品 | 已登录 |
| POST | `/api/products/:id/submit` | 提交审核 | 已登录 |
| PUT | `/api/products/:id/special-offer` | 更新特价配置 | 已登录 |
| POST | `/api/products/infer-english-name` | 根据中文产品名生成英文名 | 已登录 |

**商品对象示例**

```json
{
  "id": "prod_001",
  "name": "AI电热采暖系统",
  "englishName": "AI Electric Heating System",
  "summary": "适用于家庭与商用场景的节能采暖方案",
  "priceText": "¥2999",
  "specialOfferEnabled": false,
  "status": "draft"
}
```

**POST `/api/products/infer-english-name` 请求体**

```json
{
  "name": "石墨烯节能墙暖"
}
```

**POST `/api/products/infer-english-name` 返回体**

```json
{
  "englishName": "Graphene Energy-saving Wall Heater"
}
```

---

## 五、业务规则变更表

### 1. 企业名片

| 规则编号 | 规则 |
|----------|------|
| BC-01 | 每个账号一张名片 |
| BC-02 | 名片与后台账户强绑定 |
| BC-03 | 小程序名片系统复用后台账号密码登录 |
| BC-04 | 对外展示页按 `userId` 获取名片展示信息 |
| BC-05 | 封面图走独立上传接口，名片主数据与文件元数据分离 |

### 2. 商品英文名

| 规则编号 | 规则 |
|----------|------|
| PR-01 | 中文产品名自动生成英文产品名 |
| PR-02 | 用户可手动调整英文名 |
| PR-03 | 列表、搜索、保存统一支持英文名 |
| PR-04 | 接口主字段推荐为 `englishName`，兼容 `english_name` |

### 3. 登录设备限制

| 规则编号 | 规则 |
|----------|------|
| AU-01 | 最多 2 台设备同时在线 |
| AU-02 | 第 3 台登录挤掉最早设备 |
| AU-03 | 登录成功必须创建 session |
| AU-04 | 登出只影响当前设备 |
| AU-05 | 支持查看在线设备列表并手动下线 |
| AU-06 | 登录不做固定时效主动过期 |

---

## 六、查询与搜索约定

### 商品列表建议支持

- `keyword`：同时搜索 `name` 与 `englishName`
- `status`：商品状态过滤
- `ownerUserId`：按创建人过滤

### 对外名片页建议支持

- 基于 `userId` 读取启用中的名片展示数据
- 若名片未启用或不存在，返回业务可识别的空态或 `404`

---

## 七、审计建议

以下操作建议进入 `audit_logs`：

- 登录
- 当前设备登出
- 手动下线其他设备
- 第 3 台设备登录触发的自动挤下线
- 企业名片更新
- 名片封面上传
- 商品英文名人工修改

---

## 八、落地说明

- 本文档已按最新需求收口为“字段变更表 / 接口变更表 / 业务规则变更表”结构
- `docs` 目录中的 Word 文档已转为 Markdown 维护，避免二进制文件重复编辑
- 后续若前端 store 命名与本文件仍不一致，以本文件接口契约为准，再回补代码对齐
