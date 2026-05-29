# 本地 BitBrowser Agent 产品化说明

## 这次落地了什么
- 把本地 Agent 原型整理成可分发的便携版客户端包
- 客户端包内置浏览器扩展，不再要求用户单独下载扩展
- 提供统一打包命令，输出目录和 zip 包固定
- 提供 Windows 启动脚本和用户说明

## 打包命令
```bash
npm run agent:build-client
```

## 产物位置
- 目录：`scripts/local-agent/dist/ai-superweb-local-agent-v{version}/`
- 压缩包：`scripts/local-agent/dist/ai-superweb-local-agent-v{version}.zip`

## 产物内容
- `app/scripts/local-agent/agent.mjs`
- `app/scripts/browser-extension/platform-login-helper/`
- `start-local-agent.cmd`
- `init-local-agent.cmd`
- `status-local-agent.cmd`
- `README.txt`
- `client-manifest.json`

## 用户需要什么
- 用户感知上只需要 2 样：
  - BitBrowser
  - 本地客户端
- 技术上运行链路是 3 部分：
  - BitBrowser
  - 内置扩展
  - 本地 Agent
- 扩展由本地客户端自动携带和加载，不再单独交付给用户

## 当前边界
- 当前是便携版客户端，不是完整安装器
- 当前仍要求本机安装 Node.js 20+
- 当前没有托盘、自动启动、自动更新、版本强校验
- 当前更适合先做内测和小范围交付

## 下一步建议
- 做 Windows 安装器
- 去掉 Node.js 运行时前置依赖
- 增加客户端版本接口和服务端版本校验
- 增加托盘常驻与开机自启
