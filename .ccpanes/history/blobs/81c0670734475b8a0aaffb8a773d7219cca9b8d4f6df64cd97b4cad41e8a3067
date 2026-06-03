[OPEN] delete-account-error

# Debug Session

- Session ID: `delete-account-error`
- Started: 2026-05-29
- Scope:
  - 平台登录页点击“删除账号”返回 `Internal server error`

# Rules

- Steps 1-4 only collect runtime evidence
- No business logic change before instrumentation evidence
- First logical diff must be instrumentation only

# Hypotheses

1. 删除接口后端仍在访问已移除/已变更的共享 profile 结构，触发空指针或数据不一致异常。
2. 删除链路里的 profile 清理逻辑与当前 `1账号1profile` 模型不一致，传入参数为空或查不到 binding 后抛错。
3. 前端传给删除接口的账号 ID 正常，但后端删除前的 owner / externalGroupId 解析失败，导致服务层异常。
4. 删除接口成功删除数据库账号后，后续关闭 BitBrowser runtime/profile 的步骤抛错，最终被包装成 500。
5. 当前错误已经在后端运行日志中出现，可直接从服务进程输出定位到具体抛错点。

# Evidence Plan

- 读取前端删除调用路径与后端删除接口实现
- 检查后端运行进程最近输出，抓取删除时的异常栈
- 如现有日志不足，再补最小化 instrumentation

# Status

- Current phase: evidence collection
- Next action: inspect delete endpoint and server runtime logs
