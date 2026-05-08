# 任务发现

## 已确认
- 前端为 `Vite + React 18 + TypeScript`
- 后端为 `NestJS 11 + Prisma 7`
- 后端默认监听端口为 `3000`
- 后端统一前缀为 `/api`
- 本地开发阶段前端通过 Vite 代理到 `http://localhost:3000`
- 已存在基础设施编排文件 `docker-compose.yml`
- 当前 Compose 只包含 `PostgreSQL`、`Redis`、`MinIO`

## 环境变量
- 后端已明确使用：`PORT`、`NODE_ENV`、`CORS_ORIGIN`、`JWT_SECRET`、`JWT_EXPIRES_IN`、`SESSION_DEVICE_LIMIT`、`DATABASE_URL`、`REDIS_URL`、`MINIO_*`
- 根目录 AI 接口文件还使用：`DASHSCOPE_API_KEY`、`ALIYUN_API_KEY`、`DASHSCOPE_*`

## 风险
- 根目录 `README.md` 存在未解决的合并标记，本次按用户要求忽略
- 现有 `production-server-config.md` 提到 `worker`，但当前仓库未落地对应服务
- 前端未看到明确的生产环境 API 地址变量，现阶段更适合采用 Nginx 同域反代 `/api`

## 本次补充
- 新增命令版文档，覆盖 Ubuntu 初始化、Node.js、PM2、Nginx、Docker、Docker Compose
- Docker 方案聚焦基础服务：`PostgreSQL`、`Redis`、`MinIO`
- 当前仓库没有前后端生产 `Dockerfile`，因此未提供完整应用容器化部署命令
