# AI-SuperWeb Ubuntu 部署环境说明

## 1. 适用范围
- 适用于当前仓库主项目在 `Ubuntu` 服务器上的单机部署
- 当前主链路包含：
  - 前端管理台：`Vite + React`
  - 后端服务：`NestJS + Prisma`
  - 基础服务：`PostgreSQL`、`Redis`、`MinIO`
- 推荐部署方式：`Nginx + 前端静态文件 + Node.js 后端 + 基础服务`
- 如果后续改为容器化生产部署，可继续沿用本文档中的系统规格、端口、安全组和目录约定

## 2. 当前项目部署形态
- 前端构建产物：仓库根目录执行 `npm run build` 后生成 `dist/`
- 后端构建产物：`server/` 目录执行 `npm run build` 后生成 `dist/`
- 后端默认端口：`3000`
- 后端统一前缀：`/api`
- 前端线上建议通过同域名访问：
  - `/` -> 前端静态资源
  - `/api` -> NestJS 后端
- 当前仓库已明确依赖：
  - `PostgreSQL 16`
  - `Redis 7`
  - `MinIO`

## 3. 服务器建议

### 最低可用
- `2 vCPU`
- `4 GB RAM`
- `60 GB SSD`
- 适合开发、自测、小流量演示

### 推荐环境
- `4 vCPU`
- `8 GB RAM`
- `100 GB SSD`
- 适合当前阶段主项目单机部署

### 稳定生产
- `8 vCPU`
- `16 GB RAM`
- `200 GB SSD`
- 适合持续运行、保留日志和文件上传数据

## 4. 操作系统要求
- `Ubuntu 22.04 LTS` 或 `Ubuntu 24.04 LTS`
- 使用非 root 运维账号，按需授予 `sudo`
- 服务器时区建议统一为 `Asia/Shanghai`

## 5. 必装软件

### 应用运行
- `Node.js 20 LTS`
- `npm 10+`
- `PM2` 或 `systemd`，二选一，用于守护 Node 服务

### 基础服务
- `PostgreSQL 16`
- `Redis 7`
- `MinIO`
- `Nginx`

### 常用工具
- `git`
- `curl`
- `unzip`
- `build-essential`

## 6. 目录建议

```text
/opt/ai-superweb/
├─ app/                 # 项目代码
├─ web/                 # 前端 dist
├─ env/                 # 环境变量文件
├─ logs/                # 应用日志
├─ data/
│  ├─ postgres/
│  ├─ redis/
│  └─ minio/
└─ backups/
```

## 7. 端口与安全组

### 对外开放
- `22`：SSH
- `80`：HTTP
- `443`：HTTPS

### 仅内网或本机使用
- `3000`：NestJS
- `5432`：PostgreSQL
- `6379`：Redis
- `9000`：MinIO API
- `9001`：MinIO Console

### 安全要求
- 阿里云安全组只放行 `22/80/443`
- `5432/6379/9000/9001/3000` 不直接暴露公网
- SSH 建议仅允许密钥登录
- 建议限制 SSH 来源 IP

## 8. 域名与反向代理
- 建议使用同域名部署
- 推荐访问方式：
  - `https://your-domain.com/`
  - `https://your-domain.com/api`
- 推荐由 `Nginx` 负责：
  - 托管前端静态文件
  - 反向代理后端 `/api`
  - 配置 HTTPS
  - 支持 SPA 路由回退
  - 配置上传体积限制

## 9. Node 服务要求

### 前端
- 仓库根目录安装依赖并构建
- 构建后只需要发布 `dist/`
- 不建议线上长期运行 `vite`

### 后端
- 在 `server/` 目录安装依赖并构建
- 生产启动命令为 `node dist/main`
- 建议使用 `PM2` 或 `systemd` 托管

### 进程管理建议
- 只保留一个后端常驻进程
- 异常退出自动重启
- 日志单独落盘

## 10. 数据服务要求

### PostgreSQL
- 版本建议：`16`
- 用途：主业务库
- 要求：
  - 开启持久化
  - 定期备份
  - 不开放公网

### Redis
- 版本建议：`7`
- 用途：缓存与后续异步能力预留
- 要求：
  - 开启持久化
  - 不开放公网

### MinIO
- 用途：对象存储
- 要求：
  - 独立数据目录
  - 不开放公网 Console
  - Access Key / Secret Key 使用强密码

## 11. 当前项目环境变量

### 后端必填

```env
PORT=3000
NODE_ENV=production
CORS_ORIGIN=https://your-domain.com

JWT_SECRET=change_me_jwt_secret
JWT_EXPIRES_IN=7d
SESSION_DEVICE_LIMIT=2

DATABASE_URL=postgresql://ai_superweb:686868@127.0.0.1:5432/ai_superweb?schema=public
REDIS_URL=redis://127.0.0.1:6379

MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=ai-superweb
MINIO_SECRET_KEY=change_me_minio_password
MINIO_BUCKET=ai-superweb
```

### 基础服务变量

```env
POSTGRES_DB=ai_superweb
POSTGRES_USER=ai_superweb
POSTGRES_PASSWORD=686868
POSTGRES_PORT=5432

REDIS_PORT=6379

MINIO_ROOT_USER=ai-superweb
MINIO_ROOT_PASSWORD=change_me_minio_password
MINIO_API_PORT=9000
MINIO_CONSOLE_PORT=9001
MINIO_DEFAULT_BUCKETS=ai-superweb
```

### 可选变量
- 如果要使用根目录 `api/ai/*` 下的阿里云百炼接口，再补这些变量：

```env
DASHSCOPE_API_KEY=your_dashscope_key
ALIYUN_API_KEY=your_aliyun_key
DASHSCOPE_CHAT_MODEL=qwen-plus
DASHSCOPE_IMAGE_MODEL=qwen-image-max
DASHSCOPE_IMAGE_EDIT_MODEL=qwen-image-2.0-pro
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

## 12. 数据库初始化说明
- 当前项目后端使用 `Prisma 7`
- 已存在 `prisma.config.ts`
- 当前仓库文档约定：
  - 当前阶段优先使用 `prisma db push`
  - 后续如果补齐正式迁移文件，再切换到 `prisma migrate deploy`
- 生产部署前必须先确认数据库连接串可用

## 13. 上线前检查清单
- 服务器已安装 `Node.js`、`PostgreSQL`、`Redis`、`MinIO`、`Nginx`
- 域名已解析到服务器公网 IP
- `80/443` 已放行
- 后端环境变量已配置完成
- PostgreSQL 数据库和账号已创建
- Redis 可连通
- MinIO Bucket 已创建
- 前端已构建出 `dist/`
- 后端已构建出 `server/dist/`
- Nginx 已完成 `/api` 反向代理和 SPA 回退
- HTTPS 证书已配置

## 14. 不建议的做法
- 不要直接把 `vite dev` 当生产服务
- 不要把数据库和 Redis 暴露到公网
- 不要把密钥直接写死在代码里
- 不要把应用日志和数据库数据混放在同一临时目录

## 15. 结论
- 当前项目在 Ubuntu 上部署，推荐最小完整环境为：
  - `Ubuntu 22.04/24.04`
  - `Node.js 20 LTS`
  - `Nginx`
  - `PostgreSQL 16`
  - `Redis 7`
  - `MinIO`
  - `PM2` 或 `systemd`
- 如果你后面要继续，我可以下一步直接给你补：
  - `Ubuntu 实际部署步骤文档`
  - `Nginx 配置示例`
  - `PM2 启动配置`
  - `server/.env.production.example`
