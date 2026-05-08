# AI-SuperWeb Ubuntu 安装到上线完整手册

## 目标
- 在 `Ubuntu` 服务器上完成当前项目安装、环境准备、部署上线。
- 沿用当前测试环境已有业务数据，不从空库重新开始。
- 保持当前项目架构不大改：
  - 后台前端：`src/**`
  - 超级站前台：`ZL_Supersite/**`
  - 后端：`server/**`
  - 基础服务：`PostgreSQL / Redis / MinIO`

## 当前推荐部署架构

```text
Browser
  |
  +-- admin.example.com  -> 后台前端静态站点
  |                          \-> /api -> NestJS
  |
  +-- site.example.com   -> 超级站前台静态站点
                             \-> /api -> NestJS

Ubuntu Server
  |
  +-- Nginx
  +-- PM2 托管 NestJS
  +-- Docker Compose
       +-- PostgreSQL 16 + pgvector
       +-- Redis 7
       +-- MinIO
```

## 这次迁移必须保留的数据
- `PostgreSQL`：主业务数据，必须迁。
- `MinIO`：商品图、知识库文件、生成图片等对象文件，建议一起迁。
- `Redis`：当前 AI 模型配置缓存按 `ai:model-config:*` 保存在 Redis；如果你希望线上和测试环境保持完全一致，建议一起迁。

## 关键原则
- `PostgreSQL` 不直接拷贝数据目录跨机器复用，优先使用 `pg_dump/pg_restore`。
- `MinIO` 和 `Redis` 可以迁数据目录，但必须在服务停止状态下操作。
- 前端生产环境不跑 `vite dev`，统一 `build` 后交给 `Nginx`。
- 后端生产环境不跑 `start:dev`，统一 `npm run build` 后由 `PM2` 托管 `node dist/main`。

## 1. 服务器准备

### 推荐规格
- `Ubuntu 22.04 LTS` 或 `Ubuntu 24.04 LTS`
- `4 vCPU / 8 GB RAM / 100 GB SSD` 起步
- 正式生产建议 `8 vCPU / 16 GB RAM / 200 GB SSD`

### 建议域名
- 后台：`admin.example.com`
- 超级站前台：`site.example.com`

说明：
- 当前两个前端构建默认都更适合部署在域名根路径。
- 这样不需要改 Vite `base`，也不需要为 `/admin` 子路径额外改构建配置。

## 2. Ubuntu 基础环境安装

```bash
sudo apt update
sudo apt install -y git curl unzip wget jq ca-certificates gnupg lsb-release build-essential nginx
sudo timedatectl set-timezone Asia/Shanghai
```

## 3. 安装 Docker 与 Compose

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
docker --version
docker compose version
```

## 4. 安装 Node.js 20 与 PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

node -v
npm -v
pm2 -v
```

## 5. 服务器目录规划

```bash
sudo mkdir -p /opt/ai-superweb
sudo chown -R $USER:$USER /opt/ai-superweb

mkdir -p /opt/ai-superweb/app
mkdir -p /opt/ai-superweb/backups
mkdir -p /opt/ai-superweb/logs
```

## 6. 拉取代码

```bash
cd /opt/ai-superweb/app
git clone https://github.com/chazbot123/ai_SuperStationBackend.git current
cd current
git checkout main
```

## 7. 从当前测试环境导出数据

### 7.1 导出 PostgreSQL

如果当前测试库就是本项目根目录 `docker-compose.yml` 启动的 `postgres`：

```bash
cd D:\zhilin_project
mkdir -p backups
docker exec ai-superweb-postgres pg_dump -U ai_superweb -d ai_superweb -Fc -f /tmp/ai_superweb.dump
docker cp ai-superweb-postgres:/tmp/ai_superweb.dump ./backups/ai_superweb.dump
```

如果不是容器库，而是普通本机 PostgreSQL：

```bash
pg_dump -h 127.0.0.1 -p 5432 -U ai_superweb -d ai_superweb -Fc -f ai_superweb.dump
```

### 7.2 备份 MinIO 数据

如果要沿用当前图片、知识库文件、生成素材，必须一起迁。

当前项目若使用根目录 `data/minio`：

```bash
cd D:\zhilin_project
tar -czf backups/minio-data.tar.gz data/minio
```

### 7.3 备份 Redis 数据

如果要保留当前 AI 模型配置缓存，建议一起迁。

当前项目若使用根目录 `data/redis`：

```bash
cd D:\zhilin_project
tar -czf backups/redis-data.tar.gz data/redis
```

### 7.4 上传备份到服务器

```bash
scp ai_superweb.dump user@your-server:/opt/ai-superweb/backups/
scp minio-data.tar.gz user@your-server:/opt/ai-superweb/backups/
scp redis-data.tar.gz user@your-server:/opt/ai-superweb/backups/
```

## 8. 配置基础服务环境变量

### 8.1 根目录 `.env`

在服务器上：

```bash
cd /opt/ai-superweb/app/current
cp .env.example .env
```

建议改成：

```env
POSTGRES_DB=ai_superweb
POSTGRES_USER=ai_superweb
POSTGRES_PASSWORD=请改成强密码
POSTGRES_PORT=5432

REDIS_PORT=6379

MINIO_ROOT_USER=ai-superweb
MINIO_ROOT_PASSWORD=请改成强密码
MINIO_API_PORT=9000
MINIO_CONSOLE_PORT=9001
```

### 8.2 后端 `server/.env`

```bash
cd /opt/ai-superweb/app/current/server
cp .env.example .env
```

建议改成：

```env
PORT=3000
NODE_ENV=production

# 这里可以留空或按你的单域方案填写
CORS_ORIGIN=

JWT_SECRET=请改成强密码
JWT_EXPIRES_IN=7d
SESSION_DEVICE_LIMIT=2

DATABASE_URL=postgresql://ai_superweb:请改成强密码@127.0.0.1:5432/ai_superweb?schema=public
REDIS_URL=redis://127.0.0.1:6379

MINIO_ENDPOINT=127.0.0.1
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=ai-superweb
MINIO_SECRET_KEY=请改成强密码
MINIO_BUCKET=ai-superweb

AMAP_WEB_SERVICE_KEY=
```

说明：
- 当前代码里前台会通过各自域名访问本域 `/api`，Nginx 再反代到后端。
- 这样前端不会直接跨域请求 `3000`。

## 9. 启动基础服务

```bash
cd /opt/ai-superweb/app/current
docker compose up -d postgres redis minio
docker compose ps
```

## 10. 恢复测试环境数据

### 10.1 恢复 PostgreSQL

```bash
cd /opt/ai-superweb/app/current
docker cp /opt/ai-superweb/backups/ai_superweb.dump ai-superweb-postgres:/tmp/ai_superweb.dump

docker exec ai-superweb-postgres psql -U ai_superweb -d postgres -c "DROP DATABASE IF EXISTS ai_superweb;"
docker exec ai-superweb-postgres psql -U ai_superweb -d postgres -c "CREATE DATABASE ai_superweb;"

docker exec ai-superweb-postgres pg_restore -U ai_superweb -d ai_superweb --clean --if-exists /tmp/ai_superweb.dump
```

注意：
- 当前目标是沿用测试环境数据，所以恢复后一般不需要再重建空库。
- 如果当前代码和备份数据库完全同版，恢复后不要再盲目执行 `prisma db push`。
- 只有在代码 schema 明显比备份库更新时，才在再次备份后审慎执行 `prisma db push`。

### 10.2 恢复 MinIO 数据

恢复前先停掉 MinIO：

```bash
cd /opt/ai-superweb/app/current
docker compose stop minio
```

恢复数据：

```bash
cd /opt/ai-superweb/app/current
rm -rf data/minio
tar -xzf /opt/ai-superweb/backups/minio-data.tar.gz
docker compose up -d minio
```

说明：
- 如果数据库里已经保存了商品图、知识库文件、生成素材的 `storageUrl/objectKey`，但你不恢复 MinIO，线上会出现“记录还在但文件打不开”。

### 10.3 恢复 Redis 数据

恢复前先停掉 Redis：

```bash
cd /opt/ai-superweb/app/current
docker compose stop redis
```

恢复数据：

```bash
cd /opt/ai-superweb/app/current
rm -rf data/redis
tar -xzf /opt/ai-superweb/backups/redis-data.tar.gz
docker compose up -d redis
```

说明：
- 当前 AI 模型配置缓存存放在 Redis `ai:model-config:*` 键下。
- 如果不恢复 Redis，上线后业务数据仍在，但 AI 模型配置可能需要重新配置。

## 11. 安装依赖并构建项目

### 11.1 后台前端

```bash
cd /opt/ai-superweb/app/current
npm ci
npm run build
```

构建产物：
- `/opt/ai-superweb/app/current/dist`

### 11.2 超级站前台

```bash
cd /opt/ai-superweb/app/current/ZL_Supersite
npm ci
npm run build
```

构建产物：
- `/opt/ai-superweb/app/current/ZL_Supersite/dist`

### 11.3 后端

```bash
cd /opt/ai-superweb/app/current/server
npm ci
npm run prisma:generate
npm run build
```

## 12. 启动后端服务

```bash
cd /opt/ai-superweb/app/current/server
pm2 start dist/main.js --name ai-superweb-server --cwd /opt/ai-superweb/app/current/server
pm2 save
pm2 startup systemd -u $USER --hp /home/$USER
```

检查：

```bash
pm2 ls
curl http://127.0.0.1:3000/api
```

正常应返回：

```json
{"name":"ai-superweb-server","status":"ok"}
```

## 13. 配置 Nginx

### 13.1 后台前端站点

新建：

```bash
sudo nano /etc/nginx/sites-available/ai-superweb-admin.conf
```

内容：

```nginx
server {
    listen 80;
    server_name admin.example.com;

    root /opt/ai-superweb/app/current/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /api {
        proxy_pass http://127.0.0.1:3000/api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 13.2 超级站前台站点

新建：

```bash
sudo nano /etc/nginx/sites-available/ai-superweb-site.conf
```

内容：

```nginx
server {
    listen 80;
    server_name site.example.com;

    root /opt/ai-superweb/app/current/ZL_Supersite/dist;
    index index.html;

    client_max_body_size 50m;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /api {
        proxy_pass http://127.0.0.1:3000/api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 13.3 启用站点

```bash
sudo ln -s /etc/nginx/sites-available/ai-superweb-admin.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/ai-superweb-site.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 14. 配置 HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d admin.example.com -d site.example.com
```

续期检查：

```bash
sudo certbot renew --dry-run
```

## 15. 上线后检查清单

### 基础服务

```bash
cd /opt/ai-superweb/app/current
docker compose ps
```

检查：
- `postgres` 正常
- `redis` 正常
- `minio` 正常

### 后端

```bash
curl http://127.0.0.1:3000/api
pm2 logs ai-superweb-server --lines 100
```

### 后台前端
- 打开 `https://admin.example.com`
- 登录后台
- 检查 `产品 / 知识库 / 客服 / 超级站配置中心`

### 超级站前台
- 打开 `https://site.example.com`
- 检查 `运营指标 / 产品 / 行业资讯 / AI客服`

### 数据验证
- 后台是否能看到测试环境原有用户、商品、知识库记录
- 超级站前台是否能看到原有公开商品
- 图片、知识库文件、生成素材是否能正常打开
- AI 模型配置是否保持原状

## 16. 回滚方案

如果上线后异常：
- 停掉后端：

```bash
pm2 stop ai-superweb-server
```

- 恢复数据库：
  - 使用上线前备份重新 `pg_restore`
- 恢复 MinIO：
  - 用上线前的 `minio-data.tar.gz` 覆盖 `data/minio`
- 恢复 Redis：
  - 用上线前的 `redis-data.tar.gz` 覆盖 `data/redis`
- 前端回滚：
  - 切回上一个 Git 提交后重新 `build`

## 17. 这份方案的结论
- 当前项目最稳妥的上线方式不是“把所有东西都容器化”，而是：
  - `Docker Compose` 只跑 `PostgreSQL / Redis / MinIO`
  - `Nginx` 托管两个前端静态产物
  - `PM2` 托管 `NestJS`
- 如果你要沿用当前测试环境业务数据，只迁 `PostgreSQL` 还不够：
  - 图片和知识库文件依赖 `MinIO`
  - 当前 AI 模型配置依赖 `Redis`

## 18. 推荐你实际执行顺序
1. 先在测试环境导出 `PostgreSQL / MinIO / Redis`
2. 先在 Ubuntu 装好 `Docker / Node / PM2 / Nginx`
3. 先起 `PostgreSQL / Redis / MinIO`
4. 先恢复三类数据
5. 再构建并启动后端
6. 再构建两个前端并接入 `Nginx`
7. 最后做 HTTPS 和上线验证
