# AI超级站生产服务器配置

## 1. 推荐方案
- 单机 Docker Compose 部署
- 系统：Ubuntu 22.04 LTS
- 对外入口：Nginx + HTTPS
- 服务：Frontend、API Server、Worker、PostgreSQL、Redis、MinIO

---

## 2. 服务器规格

### 测试环境
- 4 vCPU
- 8 GB RAM
- 100 GB SSD

### 生产环境
- 8 vCPU
- 16 GB RAM
- 200 GB SSD

### 文件和任务较多
- 8~16 vCPU
- 32 GB RAM
- 300 GB+ SSD

---

## 3. 对外端口
仅开放：
- 22
- 80
- 443

不要开放：
- 3000
- 5432
- 6379
- 9000
- 9001

---

## 4. 域名建议
单域名方案：
- `https://your-domain.com/`
- `https://your-domain.com/api`
- `https://your-domain.com/files`

---

## 5. 部署目录

```text
/opt/ai-superweb/
├─ app/
├─ env/
├─ data/
│  ├─ postgres/
│  ├─ redis/
│  ├─ minio/
│  └─ logs/
├─ nginx/
└─ backups/
```

---

## 6. 容器清单
- `nginx`
- `api-server`
- `worker`
- `postgres`
- `redis`
- `minio`

要求：
- 数据持久化到宿主机
- 容器自动重启
- 数据库、Redis、MinIO 不暴露公网

---

## 7. Nginx 职责
- `/` → 前端静态资源
- `/api/` → NestJS API
- `/files/` → MinIO 文件访问

要求：
- 开启 HTTPS
- 支持 SPA 路由回退
- 配置上传大小限制

---

## 8. 环境变量

```env
NODE_ENV=production
PORT=3000

DATABASE_URL=postgresql://ai_superweb:686868@postgres:5432/ai_superweb
REDIS_URL=redis://redis:6379

JWT_SECRET=your-secret
SESSION_SECRET=your-session-secret

MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=your-access-key
MINIO_SECRET_KEY=your-secret-key
MINIO_BUCKET=ai-superweb

APP_BASE_URL=https://your-domain.com
API_BASE_URL=https://your-domain.com/api
FILE_BASE_URL=https://your-domain.com/files
```

---

## 9. 数据与存储

### PostgreSQL
- 单独持久化
- 每日备份
- 不开放公网

### Redis
- 用于缓存和队列
- 建议持久化
- 不开放公网

### MinIO
- 用于图片、视频、导出文件
- 单独挂载数据目录
- 控制台不要开放公网

---

## 10. 安全要求
- SSH 使用密钥登录
- 禁止数据库公网访问
- 禁止 Redis 公网访问
- 所有密钥放 `.env`
- 开启 HTTPS
- 限制上传类型和大小
- 保留审计日志

---

## 11. 备份要求
至少备份：
- PostgreSQL
- MinIO 文件
- `.env`
- Nginx 配置

建议：
- 每日自动备份
- 保留 7~30 天

---

## 12. 最小上线方案
- 1 台 Ubuntu 22.04 服务器
- 8C16G / 200G SSD
- Docker Compose
- Nginx + Frontend + NestJS + Worker + PostgreSQL + Redis + MinIO
- 仅开放 22/80/443
- 开启 HTTPS
- 配置每日备份

---

## 13. 当前项目还需补齐
- 前端 `Dockerfile`
- 后端 `Dockerfile`
- `docker-compose.prod.yml`
- `nginx.conf`
- `.env.example`
- 部署说明
- 备份脚本
