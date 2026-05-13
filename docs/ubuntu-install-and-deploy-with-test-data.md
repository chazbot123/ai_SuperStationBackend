# AI-SuperWeb Ubuntu 运行包部署手册

## 目标
- 不在服务器拉源码。
- 本机先打好 `2 个前端 + 1 个后端` 运行包，再上传到服务器部署。
- 保持原有架构不变：
  - `Nginx` 托管两个前端静态文件
  - `PM2` 托管 `NestJS` 后端
  - `Docker Compose` 只跑 `PostgreSQL / Redis / MinIO`
- 线上继续使用当前已经备份好的业务数据。

## 本次本机现成文件

### 运行包目录
- `D:\zhilin_project\backups\deploy_bundle_20260509_143128\project-root`

### 现有备份目录
- `D:\zhilin_project\backups\sql\ai_superweb.sql`
- `D:\zhilin_project\backups\redis\data`
- `D:\zhilin_project\backups\minio\data`

## 服务器目标根目录
- 服务器项目根目录按本次要求统一使用 `/data/ai-superweb`

## 当前推荐上线架构

```text
Browser
  |
  +-- zlb.jizhidaoai.com -> Nginx -> /data/ai-superweb/dist
  |                         \-> /api -> 127.0.0.1:3001
  |
  +-- zlf.jizhidaoai.com  -> Nginx -> /data/ai-superweb/ZL_Supersite/dist
                            \-> /api -> 127.0.0.1:3001

Ubuntu Server
  |
  +-- /data/ai-superweb
  |    +-- dist
  |    +-- ZL_Supersite/dist
  |    +-- server
  |    +-- data/postgres
  |    +-- data/redis
  |    +-- data/minio
  |    +-- backups
  |    +-- docker-compose.yml
  |    +-- .env
  |
  +-- Nginx
  +-- PM2
  +-- Docker Compose
```

## 运行包内应该有什么
- 根目录 `dist`：后台前端构建产物
- `ZL_Supersite/dist`：超级站前端构建产物
- `server/dist`：后端编译产物
- `server/node_modules`：后端运行时依赖
- `server/package.json`
- `server/package-lock.json`
- `server/prisma/schema.prisma`
- `docker-compose.yml`

## 为什么这次不用拉源码
- 前端是静态站点，只需要 `dist`
- 后端运行只需要 `dist + node_modules + package.json + .env`
- 当前服务器不再负责前端构建和后端编译，只负责运行

## 1. 服务器基础环境

### 1.1 建议规格
- `Ubuntu 22.04 LTS` 或 `Ubuntu 24.04 LTS`
- 最少 `4 vCPU / 8 GB RAM / 100 GB SSD`

### 1.2 安装基础工具

```bash
sudo apt update
sudo apt install -y curl unzip wget jq ca-certificates gnupg lsb-release build-essential nginx
sudo timedatectl set-timezone Asia/Shanghai
```

## 2. 安装 Docker 与 Compose

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

## 3. 安装 Node.js 20、PM2、Xvfb、Chrome

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

sudo apt install -y xvfb x11-utils fonts-liberation libasound2t64 libatk-bridge2.0-0t64 libatk1.0-0t64 \
  libcups2t64 libdrm2 libgbm1 libgtk-3-0t64 libnspr4 libnss3 libx11-xcb1 libxcomposite1 libxdamage1 \
  libxfixes3 libxkbcommon0 libxrandr2 wget

wget -O /tmp/google-chrome-stable_current_amd64.deb \
  https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install -y /tmp/google-chrome-stable_current_amd64.deb
rm -f /tmp/google-chrome-stable_current_amd64.deb

node -v
npm -v
pm2 -v
Xvfb -help >/dev/null 2>&1 || true
google-chrome --version
```

如果你希望直接用仓库脚本安装，也可以上传后执行：

```bash
cd /data/ai-superweb
chmod +x scripts/install-ubuntu-xvfb-browser.sh
./scripts/install-ubuntu-xvfb-browser.sh
```

## 4. 创建服务器目录

```bash
sudo mkdir -p /data/ai-superweb
sudo chown -R $USER:$USER /data/ai-superweb

mkdir -p /data/ai-superweb/backups
mkdir -p /data/ai-superweb/data
mkdir -p /data/ai-superweb/logs
mkdir -p /data/ai-superweb/scripts
mkdir -p /data/ai-superweb/ZL_Supersite
mkdir -p /data/ai-superweb/server
```

## 5. 上传运行包和备份

### 5.1 上传运行包

推荐把本机运行包目录内容上传到服务器 `/data/ai-superweb/`：

```bash
scp -r D:/zhilin_project/backups/deploy_bundle_20260509_143128/project-root/* user@your-server:/data/ai-superweb/
```

如果你用 `WinSCP`：
- 本地目录选择 `D:\zhilin_project\backups\deploy_bundle_20260509_143128\project-root`
- 远端目录选择 `/data/ai-superweb`
- 上传时覆盖同名文件

### 5.2 上传备份文件

```bash
scp D:/zhilin_project/backups/sql/ai_superweb.sql user@your-server:/data/ai-superweb/backups/sql/
scp -r D:/zhilin_project/backups/redis/data user@your-server:/data/ai-superweb/backups/redis/
scp -r D:/zhilin_project/backups/minio/data user@your-server:/data/ai-superweb/backups/minio/
```

如果服务器还没有这些子目录，先执行：

```bash
mkdir -p /data/ai-superweb/backups/sql
mkdir -p /data/ai-superweb/backups/redis
mkdir -p /data/ai-superweb/backups/minio
```

## 6. 确认服务器目录结构

上传完成后，目录应接近这样：

```text
/data/ai-superweb
  ├─ dist
  ├─ scripts
  ├─ ZL_Supersite/dist
  ├─ server/dist
  ├─ server/node_modules
  ├─ server/package.json
  ├─ server/package-lock.json
  ├─ logs
  ├─ docker-compose.yml
  └─ backups
     ├─ sql/ai_superweb.sql
     ├─ redis/data
     └─ minio/data
```

## 7. 配置根目录 `.env`

```bash
cd /data/ai-superweb
cat > .env <<'EOF'
POSTGRES_DB=ai_superweb
POSTGRES_USER=ai_superweb
POSTGRES_PASSWORD=请改成强密码
POSTGRES_PORT=5432

REDIS_PORT=6379

MINIO_ROOT_USER=ai-superweb
MINIO_ROOT_PASSWORD=请改成强密码
MINIO_API_PORT=9000
MINIO_CONSOLE_PORT=9001
EOF
```

内容如下：

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

说明：
- 这个 `.env` 只给根目录 `docker-compose.yml` 使用
- `PostgreSQL / Redis / MinIO` 的端口和账号都从这里读取
- 即使服务器上没有 `.env.example`，也可以直接用上面的命令创建

## 8. 启动基础服务

```bash
cd /data/ai-superweb
docker compose up -d postgres redis minio
docker compose ps
```

确认：
- `ai-superweb-postgres` 正常
- `ai-superweb-redis` 正常
- `ai-superweb-minio` 正常

## 9. 恢复 PostgreSQL 备份

这次现有备份是普通 SQL 文件，不是 `.dump`。

### 9.1 重建数据库

```bash
docker exec ai-superweb-postgres psql -U ai_superweb -d postgres -c "DROP DATABASE IF EXISTS ai_superweb;"
docker exec ai-superweb-postgres psql -U ai_superweb -d postgres -c "CREATE DATABASE ai_superweb OWNER ai_superweb;"
```

### 9.2 导入 SQL

```bash
docker exec -i ai-superweb-postgres psql -U ai_superweb -d ai_superweb < /data/ai-superweb/backups/sql/ai_superweb.sql
```

说明：
- 当前目标是沿用已有测试数据
- 恢复后先不要急着执行 `prisma db push`
- 只有在确认代码结构比备份库更新时，才先再备份一次后再审慎执行

## 10. 恢复 MinIO 数据

恢复前先停服务：

```bash
cd /data/ai-superweb
docker compose stop minio
```

覆盖数据目录：

```bash
rm -rf /data/ai-superweb/data/minio
cp -a /data/ai-superweb/backups/minio/data /data/ai-superweb/data/minio
```

再启动：

```bash
cd /data/ai-superweb
docker compose up -d minio
```

说明：
- 这一步必须恢复，否则数据库里已有图片和文件记录会指向空对象

## 11. 恢复 Redis 数据

恢复前先停服务：

```bash
cd /data/ai-superweb
docker compose stop redis
```

覆盖数据目录：

```bash
rm -rf /data/ai-superweb/data/redis
cp -a /data/ai-superweb/backups/redis/data /data/ai-superweb/data/redis
```

再启动：

```bash
cd /data/ai-superweb
docker compose up -d redis
```

说明：
- 当前 AI 模型配置缓存依赖 Redis
- 如果不恢复 Redis，业务主数据还在，但模型配置可能需要重新设置

## 12. 配置后端 `server/.env`

```bash
cd /data/ai-superweb/server
cat > .env <<'EOF'
PORT=3001
NODE_ENV=production
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

FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe

PUBLISHING_BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome
PUBLISHING_BROWSER_HEADLESS=false

# 默认走代码内置高德 Key，仅在启用环境变量覆盖时才需要配置
AMAP_WEB_SERVICE_KEY=
EOF
```

内容如下：

```env
PORT=3001
NODE_ENV=production
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

FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe

PUBLISHING_BROWSER_EXECUTABLE_PATH=/usr/bin/google-chrome
PUBLISHING_BROWSER_HEADLESS=false

# 默认走代码内置高德 Key，仅在启用环境变量覆盖时才需要配置
AMAP_WEB_SERVICE_KEY=
```

说明：
- 当前后端正式运行端口按 `3001`
- 当前代码内部默认仍是 `process.env.PORT ?? 3000`
- 如果 `server/.env` 没有正确提供 `PORT=3001`，后端会退回监听 `3000`
- 即使服务器上没有 `server/.env.example`，也可以直接用上面的命令创建 `server/.env`
- 不要把 `server/.env` 写成只剩 `PORT=3001`
- 至少要保留 `DATABASE_URL / REDIS_URL / MINIO_* / JWT_*`
- 视频后处理建议显式指定 `FFMPEG_PATH=/usr/bin/ffmpeg`、`FFPROBE_PATH=/usr/bin/ffprobe`
- `PUBLISHING_BROWSER_EXECUTABLE_PATH` 固定指向服务器 Chrome
- `PUBLISHING_BROWSER_HEADLESS=false` 的前提是后端由 `Xvfb` 提供虚拟显示
- 高德门店搜索当前默认读取代码内置 Key，`AMAP_WEB_SERVICE_KEY` 仅作为可选覆盖项

## 13. 启动后端

```bash
cd /data/ai-superweb/server
pm2 delete ai-superweb-server || true
chmod +x /data/ai-superweb/scripts/start-server-with-xvfb.sh
pm2 start /data/ai-superweb/scripts/start-server-with-xvfb.sh --name ai-superweb-server --interpreter bash
pm2 save
pm2 startup systemd -u $USER --hp /home/$USER
```

检查：

```bash
pm2 ls
curl http://127.0.0.1:3001/api/health
tail -n 50 /data/ai-superweb/logs/xvfb.log
```

正常应返回：

```json
{"status":"ok"}
```

说明：
- 现在 `PM2` 托管的是 `scripts/start-server-with-xvfb.sh`
- 这个脚本会先检查并拉起 `Xvfb :99`
- 然后导出 `DISPLAY=:99`，再启动 `node dist/main.js`
- 这样服务器即使没有桌面环境，平台登录也能用虚拟显示启动浏览器

## 14. 配置 Nginx

### 14.1 后台前端

```bash
sudo nano /etc/nginx/sites-available/ai-superweb-admin.conf
```

内容：

```nginx
server {
    listen 80;
    server_name zlb.jizhidaoai.com;

    root /data/ai-superweb/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /api {
        proxy_pass http://127.0.0.1:3001/api;
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

### 14.2 超级站前台

```bash
sudo nano /etc/nginx/sites-available/ai-superweb-site.conf
```

内容：

```nginx
server {
    listen 80;
    server_name zlf.jizhidaoai.com;

    root /data/ai-superweb/ZL_Supersite/dist;
    index index.html;

    client_max_body_size 50m;

    location /api/ {
        proxy_pass http://127.0.0.1:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location = /api {
        proxy_pass http://127.0.0.1:3001/api;
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

### 14.3 启用站点

```bash
sudo ln -sf /etc/nginx/sites-available/ai-superweb-admin.conf /etc/nginx/sites-enabled/ai-superweb-admin.conf
sudo ln -sf /etc/nginx/sites-available/ai-superweb-site.conf /etc/nginx/sites-enabled/ai-superweb-site.conf
sudo nginx -t
sudo systemctl reload nginx
```

## 15. HTTPS

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d zlb.jizhidaoai.com -d zlf.jizhidaoai.com
sudo certbot renew --dry-run
```

## 16. 上线检查清单

### 16.1 基础服务

```bash
cd /data/ai-superweb
docker compose ps
```

检查：
- `postgres` 正常
- `redis` 正常
- `minio` 正常

### 16.2 后端

```bash
curl http://127.0.0.1:3001/api/health
pm2 logs ai-superweb-server --lines 100
```

### 16.3 后台前端
- 打开 `https://zlb.jizhidaoai.com`
- 登录后台
- 检查 `产品 / 知识库 / 客服 / 超级站配置中心`

### 16.4 超级站前台
- 打开 `https://zlf.jizhidaoai.com`
- 检查 `运营指标 / 产品 / 行业资讯 / AI客服`

### 16.5 数据验证
- 后台是否能看到原有用户和商品
- 超级站前台是否能看到原有公开商品
- 图片、知识库文件、生成素材是否能打开
- AI 模型配置是否保持原状

## 17. 这次实际坑点
- 这次部署方案不再依赖 `git clone`，服务器上不需要源码目录
- 后端不能只传 `server/dist`，还必须带 `server/node_modules`
- 后端正式端口按 `3001`，不要漏改 `Nginx` 和健康检查
- 当前服务器就算没有 `.env.example` 和 `server/.env.example`，也不影响部署；直接手建根目录 `.env` 和 `server/.env` 即可
- `server/.env` 不能只留 `PORT=3001`，否则会因为缺少数据库和存储配置直接启动失败
- 当前 SQL 备份是 `ai_superweb.sql`，恢复时要用 `psql`，不是 `pg_restore`
- `Redis` 和 `MinIO` 当前备份是目录，不是压缩包，恢复时是覆盖目录，不是解压 `.tar.gz`
- 如果只恢复 SQL 不恢复 MinIO，后台和前台很多图片、文件会打不开

## 18. 回滚方案

如果上线后异常：

```bash
pm2 stop ai-superweb-server
```

然后按这三类回滚：
- PostgreSQL：用上线前 SQL 重新导入
- Redis：用上线前的 `backups/redis/data` 覆盖 `data/redis`
- MinIO：用上线前的 `backups/minio/data` 覆盖 `data/minio`

前端回滚：
- 直接回滚到上一版 `dist`
- 再执行 `sudo systemctl reload nginx`

## 19. 推荐实际顺序
1. 先把本机运行包上传到 `/data/ai-superweb`
2. 再把 `sql / redis / minio` 备份上传到 `/data/ai-superweb/backups`
3. 配好根目录 `.env`
4. 先起 `PostgreSQL / Redis / MinIO`
5. 恢复 `SQL / Redis / MinIO`
6. 配好 `server/.env`
7. 用 `PM2` 启动后端
8. 用 `Nginx` 挂两个前端
9. 最后做 HTTPS 和全链路检查
