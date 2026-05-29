# 本地 BitBrowser 客户端交付方案

## 目标
- 用户继续在本地使用 BitBrowser。
- 登录和发布仍由系统后端调度。
- 用户不再手动下载浏览器扩展，不再手动拖拽安装。

## 交付形态
- 云端保留主后台：
  - 用户系统
  - 内容管理
  - 发布任务
  - 平台账号数据
  - BitBrowser 分组路由规则
  - 只维护 `BITBROWSER_LOCAL_API_BASE_URL` 这类连接信息
- 本地交付一个客户端安装包：
  - 内置浏览器扩展资源
  - 内置 BitBrowser 启动参数
  - 负责启动 BitBrowser 并自动加载扩展目录
  - 后续可扩展为本地 Agent

## 本地机器需要什么
- BitBrowser
- 本地客户端
- 客户端内置扩展解压目录

## 用户实际需要装几样东西
- 用户感知上只需要 2 样：
  - BitBrowser
  - 本地客户端
- 技术上运行时是 3 个组成部分：
  - BitBrowser
  - 浏览器扩展
  - 本地 Agent
- 但扩展应由本地客户端内置并自动管理，不应再让用户单独下载或手动安装

## 自动安装流程
1. 用户下载并安装本地客户端
2. 客户端首次启动时把内置扩展解压到固定目录
3. 客户端记录本地 BitBrowser 路径，并默认使用 `http://127.0.0.1:54345`
4. 客户端启动 BitBrowser 时自动追加扩展参数
5. 用户回到平台登录页，点击平台卡片即可开始登录

## 固定目录建议
- Windows:
  - `%LOCALAPPDATA%/AISuperWeb/bitbrowser-extension/platform-login-helper`
- 不建议放到项目源码目录
- 不建议要求用户手动复制目录

## BitBrowser 自动加载参数
```bash
--disable-extensions-except={extension_dir}
--load-extension={extension_dir}
```

## 云端与本地职责
- 云端负责：
  - 账号和任务数据
  - 平台登录入口
  - 发布调度
  - A/B/C 组自动分配
  - 同组跨平台复用 Profile
- 本地客户端负责：
  - 管理扩展目录
  - 启动 BitBrowser
  - 连接固定默认的 BitBrowser Local API：`http://127.0.0.1:54345`
  - 确保扩展被自动加载
  - 暴露本地 HTTP 服务，供前端检测在线状态并触发启动 BitBrowser

## 配置边界
- 云端主后台：
  - 不再直接使用 `BITBROWSER_EXTENSION_DIR`
- 本地 Agent：
  - 自己维护本地扩展目录
  - 自己带参数启动 BitBrowser
  - 自己决定扩展目录的本地绝对路径

## A/B 分配规则
- 第一个登录链路占 A
- 同组缺的平台优先补 A
- 同平台第二个新账号进入 B
- 重新登录保留原组
- 删除某个平台账号后，对应组位可被后续新账号补位

## 当前前端入口
- 平台登录页按钮改为“下载本地客户端”
- 下载地址由 `VITE_PLATFORM_LOGIN_CLIENT_DOWNLOAD_URL` 控制
- 未配置下载地址时，前端只提示“本地客户端下载地址暂未配置”

## 当前产品化落地
- 已提供本地客户端打包脚本：`npm run agent:build-client`
- 产物输出目录：`scripts/local-agent/dist/`
- 产物包含：
  - 本地 Agent 主程序
  - 内置浏览器扩展目录
  - Windows 启动脚本
  - 用户 README
- 当前产物是便携版分发包，不是完整安装器

## 下一步
- 增加本地客户端在线状态检测
- 增加客户端版本校验
- 把下载地址切到正式安装包地址
- 把 BitBrowser 路径从手工改 `.env` 演进到客户端内配置
