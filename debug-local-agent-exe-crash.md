# [OPEN] local-agent-exe-crash

## 症状
- 点击 `AI-SuperWeb-Local-Agent.exe` 后窗口闪退
- 未显示“连接成功”

## 预期
- `exe` 启动后保持运行
- 本地 agent 服务可用
- UI 或状态接口能显示连接成功

## 当前假设
1. 打包后的 `exe` 入口执行失败，导致进程立即退出
2. `exe` 启动时找不到同目录扩展或运行资源，初始化提前失败
3. `exe` 启动后本地服务未成功监听，状态链路因此无反馈
4. `exe` 已启动但状态回写链路失败，表现为“没显示连接成功”

## 计划
1. 读取本地客户端打包与启动代码
2. 直接复现 `exe` 运行，抓取退出码与标准输出/错误
3. 仅添加取证日志，不先改业务逻辑
4. 基于证据做最小修复并复验

## 证据
- 复现 `AI-SuperWeb-Local-Agent.exe status` 时稳定报错：
  - `Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\snapshot\local-agent\agent.js'`
- `pkg-build-debug.json` 已确认打包入口原本直接使用 `scripts/local-agent/agent.mjs`
- 修复后再次执行：
  - `AI-SuperWeb-Local-Agent.exe status` 正常返回 JSON
  - 无参数执行 `AI-SuperWeb-Local-Agent.exe` 后，`http://127.0.0.1:3210/health` 返回 `{"status":"ok",...}`
- 新一轮复现“还是闪退”时，`doubleclick-stderr.log` 明确为：
  - `[local-agent] listen EADDRINUSE: address already in use 127.0.0.1:3210`
- 清空旧 `3210` 进程后再次双击：
  - 首次启动 3 秒后进程仍存活
  - stdout 正常输出 `serve` JSON
- 已有 agent 在运行时再次双击：
  - 第二个进程会快速退出
  - stdout 输出 `reusedExistingAgent: true`
  - stderr 为空
- 用户通过 `start-local-agent-debug.cmd` 提供了新的外层日志，明确报错：
  - `SyntaxError: Cannot use import statement outside a module`
  - 文件为 `C:\snapshot\_pkg\agent.cjs`
  - 具体残留行为：`import { appendFile, cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";`
- 随后已修 `build-client.mjs` 的入口转换规则，并再次复验：
  - 当前生成的 `dist/_pkg/agent.cjs` 顶部已改为 `const { appendFile, cp, mkdir, readFile, stat, writeFile } = require("node:fs/promises");`
  - 最新下载包本地复验时，已不再出现上述 `SyntaxError`

## 当前结论
- 假设 1 成立：`pkg` 打包 `.mjs` 入口后的 Windows 单文件产物启动异常
- 假设 2 不成立：扩展目录不是本次闪退根因
- 假设 3 作为结果成立：闪退时本地服务未监听；修复后已正常监听 `3210`
- 假设 4 不成立：不是“已启动但没显示连接成功”，而是进程先前根本未成功启动
- 新增结论：用户再次双击时的“闪退”根因是端口 `3210` 已被已运行的 agent 占用
- 新增结论：用户刚贴出的 `SyntaxError` 是旧包里的临时 `CommonJS` 入口转换不完整导致，当前最新包已修正

## 已实施修复
1. `build-client.mjs`
   - 打包前生成临时 `CommonJS` 入口
   - `pkg` 改为打包这份临时入口，避开 `.mjs` 入口异常
   - 补齐 `appendFile` 的 `fs/promises` 导入转换
   - 若生成的 `agent.cjs` 仍残留顶层 `import`，打包阶段直接失败
2. `agent.mjs`
   - 便携版 `exe` 无参数默认命令从 `help` 改为 `serve`
   - 保留非打包开发模式默认 `help`
   - `3210` 已被占用但健康检查正常时，不再按错误退出
   - Windows 打包态双击时补“启动成功 / 已在运行”提示
