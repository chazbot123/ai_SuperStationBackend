# 知识库管理 pgvector 方案

## 1. 结论

- 当前场景适合先用 `PostgreSQL + pgvector + MinIO`
- 不先引入独立向量数据库
- 知识库目标不是单纯存文件，而是支撑 `AI 客服` 的语义检索
- 第一版重点是先打通：上传 -> 解析 -> 切片 -> 向量化 -> 检索 -> 回答引用来源

## 2. 适用范围

- 用户上传非结构化文件做知识库
- 文件类型优先支持：
  - `pdf`
  - `docx`
  - `pptx`
  - `txt`
  - `md`
- 图片类文件如要支持，建议走 `OCR -> 文本入库`
- AI 客服问答时，需要从知识库中按语义召回相关片段

## 3. 整体架构

```text
前端知识库管理
  -> 后端上传接口
  -> MinIO 存原始文件
  -> PostgreSQL 存文档元数据
  -> 异步解析任务
  -> 文本切片
  -> Embedding 模型生成向量
  -> pgvector 存 chunk 向量
  -> AI 客服提问时做 TopK 检索
  -> 大模型基于召回片段回答
```

## 4. 表结构设计

### 4.1 `knowledge_documents`

用途：
- 存知识文件主记录
- 对应一个上传文件

建议字段：

```prisma
model KnowledgeDocument {
  id               String   @id @default(cuid())
  creatorId        String
  kbScope          String   // tenant / company / global
  title            String
  fileName         String
  fileExt          String
  mimeType         String
  fileSize         Int
  bucket           String
  objectKey        String
  storageUrl       String?
  parseStatus      String   @default("pending") // pending / parsing / chunking / embedding / ready / failed
  indexStatus      String   @default("pending") // pending / indexing / ready / failed
  chunkCount       Int      @default(0)
  charCount        Int      @default(0)
  language         String?
  summary          String?
  errorMessage     String?
  lastIndexedAt    DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

索引建议：
- `@@index([creatorId, createdAt])`
- `@@index([kbScope, indexStatus, createdAt])`

说明：
- `parseStatus` 管解析流程状态
- `indexStatus` 管是否可检索
- 第一版可不做复杂目录树，先用列表管理

### 4.2 `knowledge_document_chunks`

用途：
- 存切片后的文本和向量
- 这是语义检索核心表

建议字段：

```prisma
model KnowledgeDocumentChunk {
  id              String   @id @default(cuid())
  documentId      String
  chunkIndex      Int
  content         String   @db.Text
  contentPreview  String?
  tokenCount      Int?
  charCount       Int
  pageNumber      Int?
  sectionTitle    String?
  keywords        String[]
  embeddingModel  String
  embeddingDim    Int
  embedding       Unsupported("vector(1024)")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

索引建议：
- `@@index([documentId, chunkIndex])`
- 向量索引单独用 SQL 建：

```sql
CREATE INDEX knowledge_chunk_embedding_cos_idx
ON "KnowledgeDocumentChunk"
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

说明：
- `vector(1024)` 维度要和所选 embedding 模型一致
- 第一版建议只固定 1 个 embedding 模型，避免混维度
- `keywords` 可选，用于后续混合检索

### 4.3 `knowledge_document_jobs`

用途：
- 记录上传后的解析、切片、向量化任务
- 便于前端看状态和失败原因

建议字段：

```prisma
model KnowledgeDocumentJob {
  id            String   @id @default(cuid())
  documentId    String
  jobType       String   // parse / chunk / embed / reindex
  status        String   @default("pending") // pending / running / success / failed
  attemptCount  Int      @default(0)
  errorMessage  String?
  startedAt     DateTime?
  finishedAt    DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
```

索引建议：
- `@@index([documentId, createdAt])`
- `@@index([status, createdAt])`

### 4.4 `knowledge_retrieval_logs`

用途：
- 记录 AI 客服每次检索命中的片段
- 便于后续调优和审计

建议字段：

```prisma
model KnowledgeRetrievalLog {
  id               String   @id @default(cuid())
  sessionId        String?
  question         String   @db.Text
  queryRewrite     String?
  topK             Int
  hitDocumentIds   String[]
  hitChunkIds      String[]
  scores           Json
  answerModel      String?
  createdAt        DateTime @default(now())
}
```

第一版可简化：
- 如果赶进度，这张表可以第二阶段再上

## 5. 上传 / 解析 / 切片流程

### 5.1 上传流程

1. 前端上传文件到后端
2. 后端校验文件类型、大小、租户归属
3. 原始文件写入 `MinIO`
4. 写入 `knowledge_documents`
5. 创建一条 `knowledge_document_jobs(parse)`
6. 返回文档记录给前端，状态为 `pending`

### 5.2 解析流程

1. Worker 或后端异步任务读取 MinIO 文件
2. 按文件类型提取纯文本
3. 清理无效字符、页眉页脚、重复空行
4. 回写：
   - `charCount`
   - `summary`
   - `parseStatus = chunking`

建议：
- PDF 按页提取
- Word / PPT 尽量保留标题层级
- 图片和扫描件走 OCR，失败可标记 `failed`

### 5.3 切片流程

建议规则：
- 优先按标题 / 段落切
- 再按长度兜底
- 避免一刀切固定字符数

建议参数：
- chunk 大小：`500 ~ 1000` 中文字符
- overlap：`80 ~ 150` 字符

切片后写入：
- `knowledge_document_chunks`
- `chunkIndex`
- `pageNumber`
- `sectionTitle`
- `contentPreview`

### 5.4 向量化流程

1. 批量读取未向量化 chunk
2. 调 embedding 模型生成向量
3. 写入 `embedding`
4. 文档回写：
   - `chunkCount`
   - `indexStatus = ready`
   - `parseStatus = ready`
   - `lastIndexedAt`

失败时：
- `indexStatus = failed`
- `errorMessage` 写入文档和 job

## 6. 检索接口设计

### 6.1 上传知识文件

`POST /api/knowledge/documents`

用途：
- 上传一个知识文件

表单建议：
- `file`
- `scope`
- `title`

返回：

```json
{
  "id": "doc_xxx",
  "title": "产品 FAQ",
  "parseStatus": "pending",
  "indexStatus": "pending"
}
```

### 6.2 知识文件列表

`GET /api/knowledge/documents`

查询参数建议：
- `q`
- `indexStatus`
- `page`
- `limit`

返回字段建议：
- `id`
- `title`
- `fileName`
- `chunkCount`
- `parseStatus`
- `indexStatus`
- `errorMessage`
- `updatedAt`

### 6.3 文档详情

`GET /api/knowledge/documents/:id`

返回建议包含：
- 文档基础信息
- 最近 job 状态
- 可选预览文本

### 6.4 重建索引

`POST /api/knowledge/documents/:id/reindex`

用途：
- 重新解析并重建向量

### 6.5 删除知识文件

`DELETE /api/knowledge/documents/:id`

处理建议：
- 删除 MinIO 原文件
- 删除 chunk
- 删除任务记录

### 6.6 检索测试接口

`POST /api/knowledge/retrieval/search`

请求：

```json
{
  "query": "这款产品适合哪些场景？",
  "scope": "company",
  "topK": 5
}
```

返回：

```json
{
  "query": "这款产品适合哪些场景？",
  "hits": [
    {
      "documentId": "doc_xxx",
      "documentTitle": "产品FAQ.pdf",
      "chunkId": "chunk_xxx",
      "score": 0.91,
      "content": "适用于家庭采暖、办公室节能改造..."
    }
  ]
}
```

说明：
- 这个接口用于后台“检索测试台”
- 不直接返回 AI 答案，只返回命中文本

## 7. 和 AI 客服对接方式

### 7.1 建议链路

1. 用户在前台或客服页提问
2. 后端先做问题预处理
   - trim
   - 去无意义词
   - 可选 query rewrite
3. 调用知识检索服务做 TopK 召回
4. 取最相关的 `3 ~ 6` 个 chunk
5. 组装 prompt 给聊天模型
6. 返回回答
7. 同时返回引用来源

### 7.2 AI 客服回答接口建议

`POST /api/support/chat`

请求：

```json
{
  "sessionId": "cs_001",
  "message": "你们这个产品适合哪些场景？"
}
```

内部处理：

```text
用户问题
 -> embedding 检索
 -> TopK chunks
 -> 构建 system prompt + context
 -> 调聊天模型
 -> 返回 answer + sources
```

返回：

```json
{
  "answer": "该产品适合家庭采暖、办公室节能改造等场景。",
  "sources": [
    {
      "documentId": "doc_xxx",
      "documentTitle": "产品常见问答.pdf",
      "chunkId": "chunk_xxx",
      "snippet": "适用于家庭采暖、办公室节能改造..."
    }
  ]
}
```

### 7.3 回答约束建议

- 没命中知识库时，不要胡答
- 明确返回：
  - “当前知识库未检索到足够依据”
  - 或建议转人工
- AI 客服输出要带来源片段，方便审计

### 7.4 检索策略建议

第一版：
- 只做向量检索

第二版：
- 升级为混合检索
  - 全文检索
  - 向量检索
  - rerank

### 7.5 多租户建议

如果后续一台服务支持多客户：
- 每次检索必须带租户范围
- 文档和 chunk 必须有 `tenantId / companyId`
- 检索 SQL 先过滤租户，再做向量相似度排序

## 8. 实施顺序建议

### 阶段 1

- 开启 `pgvector`
- 建 `knowledge_documents`
- 建 `knowledge_document_chunks`
- 建上传接口
- 建文档列表接口

### 阶段 2

- 做解析任务
- 做切片
- 做 embedding 入库
- 做检索测试接口

### 阶段 3

- 接 AI 客服
- 返回来源片段
- 记录检索日志

### 阶段 4

- 做混合检索
- 做重排
- 做命中率与答案质量调优

## 9. 当前项目建议

- 文件继续复用 `MinIO`
- 向量层落到 `PostgreSQL + pgvector`
- 知识库管理页 `/assets` 从 demo 改成真实：
  - 上传文件
  - 文件列表
  - 索引状态
  - 重建索引
  - 检索测试
- AI 客服模块 `/support` 后续直接复用同一套检索服务

## 10. 一句话收口

- 你这个场景要语义检索，所以向量层是必要的
- 第一版最合适的组合是：`MinIO + PostgreSQL + pgvector + AI 网关`
