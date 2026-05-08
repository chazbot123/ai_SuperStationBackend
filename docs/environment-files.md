# 环境文件说明

## 目标
- 统一环境文件入口，避免根目录和 `server/` 下的配置职责混乱。
- 示例文件只保留可直接复制的默认结构，不提交真实密钥。

## 当前约定
- 根目录 `.env.example`
  - 负责 `docker-compose.yml` 使用的基础设施变量。
  - 主要覆盖 `PostgreSQL`、`Redis`、`MinIO` 端口和账号信息。
- `server/.env.example`
  - 负责后端服务运行变量。
  - 主要覆盖 `PORT`、`CORS_ORIGIN`、`JWT`、`DATABASE_URL`、`REDIS_URL`、`MINIO_*`。

## 本地开发
1. 复制根目录 `.env.example` 为根目录 `.env`
2. 复制 `server/.env.example` 为 `server/.env`
3. 按本机环境修改密码、地址和第三方密钥

## 文件职责
- 根目录 `.env`
  - 只给 `docker-compose.yml` 和基础设施使用
- `server/.env`
  - 只给 Nest 后端使用
- 前端当前没有独立 `.env.example`
  - 如后续新增 Vite 环境变量，统一采用 `VITE_*` 命名，并再单独补前端示例文件

## 安全规则
- `JWT_SECRET`、`MINIO_ROOT_PASSWORD`、数据库密码必须替换默认占位值后再用于正式环境。
- 示例文件中的密码只用于本地开发说明，不可直接用于线上。
- `.env` 不提交 Git。

## 维护规则
- 新增环境变量时，必须同步更新对应 `.env.example`。
- 不要把同一变量同时写到根目录和 `server/` 两处。
- 如果变量只服务于后端，不要写到根目录 `.env.example`。
- 如果变量只服务于基础设施，不要写到 `server/.env.example`。
