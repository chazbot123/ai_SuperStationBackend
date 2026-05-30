# 本地 Agent 最小原型

## 目标
- 先落一个可运行的本地 CLI。
- 不做桌面 UI，不做托盘，不做自动更新。
- 先解决 3 件事：
  - 同步内置扩展到固定目录
  - 回写 BitBrowser 相关环境变量
  - 自动带扩展参数启动 BitBrowser

## 文件位置
- Agent 主文件：`scripts/local-agent/agent.mjs`
- 扩展源目录：`scripts/browser-extension/platform-login-helper`
- 本地配置文件：
  - Windows 优先：`%LOCALAPPDATA%/AISuperWeb/local-agent/agent-config.json`
  - 兜底：`~/.ai-superweb/local-agent/agent-config.json`

## npm 入口
```bash
npm run agent:local -- help
npm run agent:serve
```

## 支持命令
```bash
npm run agent:local -- init
npm run agent:local -- sync-extension
npm run agent:local -- write-server-env
npm run agent:local -- start-bitbrowser
npm run agent:serve
npm run agent:local -- status
```

## 推荐初始化
```bash
npm run agent:local -- init --bitbrowser-path "C:\Program Files\BitBrowser\BitBrowser.exe"
```

## 命令说明
- `init`
  - 同步扩展到固定目录
  - 保存本地配置
  - 默认写入 `server/.env`
  - 默认把 `BITBROWSER_LOCAL_API_BASE_URL` 写成 `http://127.0.0.1:54345`
- `sync-extension`
  - 只做扩展目录同步
- `write-server-env`
  - 只回写 `BITBROWSER_LOCAL_API_BASE_URL`
- `start-bitbrowser`
  - 用自动扩展参数启动 BitBrowser
- `serve`
  - 启动本地 HTTP 服务
  - 提供前端健康检查和本地状态读取
- `status`
  - 检查本地配置、扩展目录、BitBrowser 路径、`server/.env` 是否存在

## init 后默认写入的变量
```env
BITBROWSER_LOCAL_API_BASE_URL=http://127.0.0.1:54345
```

## 默认约定
- BitBrowser Local API 固定默认值：`http://127.0.0.1:54345`
- 普通用户不需要手动配置这个地址
- 只有特殊环境下才通过 `--local-api-base-url` 覆盖
- 本地 Agent HTTP 默认地址：`http://127.0.0.1:3210`
- 扩展目录只保存在本地 Agent 配置和本地文件系统
- 云端后端不再依赖 `BITBROWSER_EXTENSION_DIR`

## 本地 HTTP 接口
- `GET /health`
  - 返回 Agent 在线状态
- `GET /status`
  - 返回 BitBrowser 路径、扩展目录、Local API 等本地状态
- `POST /init`
  - 执行初始化
- `POST /sync-extension`
  - 执行扩展同步
- `POST /write-server-env`
  - 回写 `BITBROWSER_LOCAL_API_BASE_URL`
- `POST /start-bitbrowser`
  - 用内置扩展参数启动 BitBrowser

## 启动 BitBrowser 时附带的参数
```bash
--disable-extensions-except={extension_dir}
--load-extension={extension_dir}
```

## 当前边界
- 只适合本机开发和本机联调
- 还没有客户端在线心跳
- 还没有服务端主动下发命令给本地 Agent
- 还没有安装包、桌面窗口和自动升级

## 下一步
- 增加本地 HTTP 服务，给前端和后端检测“客户端是否在线”
- 增加 BitBrowser 路径自动发现和配置持久化
- 增加安装包构建脚本，把扩展目录内置到正式客户端
