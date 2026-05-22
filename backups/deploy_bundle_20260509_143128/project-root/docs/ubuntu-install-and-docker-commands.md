# AI-SuperWeb Ubuntu 安装命令与 Docker 配置

## 1. 适用范围
- 适用于全新 `Ubuntu 22.04/24.04` 服务器
- 目标是先把部署环境装齐，再把当前项目跑起来
- 当前建议形态：
  - 宿主机安装 `Node.js`、`PM2`、`Nginx`
  - 用 `Docker` 跑 `PostgreSQL`、`Redis`、`MinIO`

## 2. 先准备变量
- 先把你的域名、仓库地址、服务器目录替换成自己的值

```bash
export APP_DIR=/opt/ai-superweb
export APP_REPO_URL=git@github.com:your-org/AI-SuperWeb.git
export APP_DOMAIN=your-domain.com
```

## 3. 基础系统命令

### 更新系统

```bash
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y git curl wget unzip vim ca-certificates gnupg lsb-release build-essential
```

### 设置时区

```bash
sudo timedatectl set-timezone Asia/Shanghai
timedatectl
```

### 创建部署目录

```bash
sudo mkdir -p /opt/ai-superweb/{app,web,env,logs,backups,infra,data/postgres,data/redis,data/minio}
sudo chown -R $USER:$USER /opt/ai-superweb
```

## 4. 安装 Node.js 和 PM2

### 安装 Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

### 安装 PM2

```bash
sudo npm install -g pm2
pm2 -v
```

### 配置 PM2 开机自启

```bash
pm2 startup systemd
```

- 执行上面命令后，终端会输出一条带 `sudo` 的命令
- 把那条命令再执行一次

## 5. 安装 Nginx

```bash
sudo apt-get install -y nginx
sudo systemctl enable --now nginx
sudo systemctl status nginx --no-pager
```

## 6. 安装 Docker 和 Docker Compose

### 安装 Docker 官方源

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
```

### 安装 Docker 组件

```bash
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo systemctl status docker --no-pager
```

### 验证 Docker

```bash
docker version
docker compose version
sudo docker run --rm hello-world
```

### 当前用户免 sudo 使用 Docker

```bash
sudo usermod -aG docker $USER
newgrp docker
docker ps
```

## 7. Docker 守护配置

### 创建 `/etc/docker/daemon.json`

```bash
sudo mkdir -p /etc/docker

sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{
  "data-root": "/opt/docker-data",
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  },
  "exec-opts": [
    "native.cgroupdriver=systemd"
  ],
  "live-restore": true
}
EOF
```

### 重启 Docker

```bash
sudo mkdir -p /opt/docker-data
sudo systemctl restart docker
sudo systemctl status docker --no-pager
```

### 检查配置是否生效

```bash
docker info | grep -E "Docker Root Dir|Logging Driver|Cgroup Driver"
```

## 8. 项目基础服务 Docker 配置

### 创建基础服务环境变量

```bash
cat > /opt/ai-superweb/infra/.env <<'EOF'
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
EOF
```

### 创建基础服务 `compose.yml`

```bash
cat > /opt/ai-superweb/infra/compose.yml <<'EOF'
services:
  postgres:
    image: postgres:16-alpine
    container_name: ai-superweb-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "127.0.0.1:${POSTGRES_PORT}:5432"
    volumes:
      - /opt/ai-superweb/data/postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: ai-superweb-redis
    restart: unless-stopped
    command: redis-server --appendonly yes
    ports:
      - "127.0.0.1:${REDIS_PORT}:6379"
    volumes:
      - /opt/ai-superweb/data/redis:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 10

  minio:
    image: minio/minio:RELEASE.2025-02-28T09-55-16Z
    container_name: ai-superweb-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    ports:
      - "127.0.0.1:${MINIO_API_PORT}:9000"
      - "127.0.0.1:${MINIO_CONSOLE_PORT}:9001"
    volumes:
      - /opt/ai-superweb/data/minio:/data
EOF
```

### 启动基础服务

```bash
cd /opt/ai-superweb/infra
docker compose --env-file .env up -d
docker compose ps
docker compose logs -f --tail=100
```

### 停止和重启基础服务

```bash
cd /opt/ai-superweb/infra
docker compose --env-file .env stop
docker compose --env-file .env start
docker compose --env-file .env restart
```

## 9. 创建 MinIO Bucket

```bash
docker run --rm --network host minio/mc \
  alias set local http://127.0.0.1:9000 ai-superweb change_me_minio_password

docker run --rm --network host minio/mc \
  mb --ignore-existing local/ai-superweb
```

## 10. 拉代码和安装项目依赖

### 拉取代码

```bash
cd /opt/ai-superweb/app
git clone <你的仓库地址> .
```

- 如果你已经有仓库地址，也可以直接替换成：

```bash
cd /opt/ai-superweb/app
git clone "$APP_REPO_URL" .
```

### 安装前端依赖

```bash
cd /opt/ai-superweb/app
npm ci
```

### 安装后端依赖

```bash
cd /opt/ai-superweb/app/server
npm ci
```

## 11. 创建后端生产环境变量

```bash
cat > /opt/ai-superweb/env/server.env <<'EOF'
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
EOF
```

- 记得把 `your-domain.com` 和所有密码改成你自己的值

## 12. 初始化数据库并构建项目

### 后端 Prisma 初始化

```bash
cd /opt/ai-superweb/app/server
set -a
source /opt/ai-superweb/env/server.env
set +a
npx prisma generate
npx prisma db push
```

### 构建前端

```bash
cd /opt/ai-superweb/app
npm run build
rsync -av --delete dist/ /opt/ai-superweb/web/
```

### 构建后端

```bash
cd /opt/ai-superweb/app/server
npm run build
```

## 13. 启动后端服务

### 用 PM2 启动

```bash
cd /opt/ai-superweb/app/server
set -a
source /opt/ai-superweb/env/server.env
set +a
pm2 start dist/main --name ai-superweb-server
pm2 save
pm2 status
```

### 查看日志

```bash
pm2 logs ai-superweb-server
```

### 重启服务

```bash
pm2 restart ai-superweb-server
```

## 14. 配置 Nginx

### 写入站点配置

```bash
sudo tee /etc/nginx/sites-available/ai-superweb > /dev/null <<'EOF'
server {
    listen 80;
    server_name your-domain.com;

    root /opt/ai-superweb/web;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    client_max_body_size 50m;
}
EOF
```

### 启用站点

```bash
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/ai-superweb /etc/nginx/sites-enabled/ai-superweb
sudo nginx -t
sudo systemctl reload nginx
```

## 15. 配置 HTTPS

### 安装 Certbot

```bash
sudo apt-get install -y certbot python3-certbot-nginx
```

### 签发证书

```bash
sudo certbot --nginx -d your-domain.com
```

### 自动续期检查

```bash
sudo systemctl status certbot.timer --no-pager
sudo certbot renew --dry-run
```

## 16. 常用检查命令

### 查看端口

```bash
sudo ss -lntp
```

### 查看 Nginx

```bash
sudo systemctl status nginx --no-pager
sudo tail -n 100 /var/log/nginx/error.log
```

### 查看 Docker 基础服务

```bash
cd /opt/ai-superweb/infra
docker compose ps
docker compose logs postgres --tail=100
docker compose logs redis --tail=100
docker compose logs minio --tail=100
```

### 查看后端服务

```bash
pm2 status
pm2 logs ai-superweb-server --lines 100
```

### 检查后端接口

```bash
curl http://127.0.0.1:3000/api
curl -I http://127.0.0.1
curl -I https://your-domain.com
```

## 17. 常见修改点
- `POSTGRES_PASSWORD` 改成强密码
- `MINIO_ROOT_PASSWORD` 改成强密码
- `JWT_SECRET` 改成随机长字符串
- `server_name` 改成你的真实域名
- `CORS_ORIGIN` 改成你的真实访问域名
- 如果域名还没就绪，先用 `http` 联调，证书最后补

## 18. 当前结论
- 按这份文档执行后，服务器会具备当前项目所需基础环境
- Docker 主要负责跑 `PostgreSQL`、`Redis`、`MinIO`
- 应用层当前更适合宿主机运行：`Node.js + PM2 + Nginx`
- 如果你要，我下一步可以继续补一份：
  - `server/.env.production.example`
  - `Nginx 完整生产配置`
  - `一键部署脚本`
