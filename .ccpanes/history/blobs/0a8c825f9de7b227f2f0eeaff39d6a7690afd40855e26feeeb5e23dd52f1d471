[OPEN] douyin-home-stuck

## 症状

- 触发抖音图文发布后，页面最终停留在 `home`。
- 期望行为是进入图文编辑页并继续上传素材。

## 复现

1. 使用本地 agent `exe` 版本。
2. 替换最新扩展到 `exe` 同级 `platform-login-helper` 目录。
3. 在系统内点击抖音图文发布。
4. 观察页面停留在 `https://creator.douyin.com/creator-micro/home`。

## 假设

- H1: `executePublishSession()` 进入后，在 `douyinPublishAdapter.executeImage()` 之前或之内发生了执行中断。
- H2: `enterDouyinImagePublishFromHome()` 在 `home` 与 `upload` 间存在重复路由跳转，导致上传页被重新打断。
- H3: `detectDouyinPublishState()` 或 ready 判定把实际可用的上传页识别成 `unknown/home`，后续逻辑走偏。
- H4: `content.js` 的 command 执行与 `page-resume` 并发重入，导致同一命令多次启动并互相覆盖。
- H5: 上传页已打开，但上传页里的前置 DOM 未就绪，卡在等待节点阶段，没有继续产生日志。

## 当前策略

- Step 1: 不改业务逻辑，先补最小取证。
- Step 2: 复现并读取 `pre-fix` 日志，判定真实卡点。
- Step 3: 只对命中的根因做最小修复。
- Step 4: 用 `post-fix` 日志验证。

## 当前状态

- 进行中

## 最新证据

- 最新复现对应会话：
  - `runtime_50x8lyfl`
  - `cmd_xypjof2b`
- 关键日志结论：
  - 已进入 `content/upload?default-tab=3`
  - `page-resume` 已成功接住执行
  - `executePublishSession()` 已继续进入抖音适配器
  - `enterDouyinImagePublishFromHome:direct-route-skip` 已命中，说明“重复直跳 upload”问题已被修掉
  - `ensureDouyinImagePublishReady:start` 时页面只有 `加载中...`
  - 当时：
    - `hasReadyNode = false`
    - `hasUploadNode = false`
  - 随后页面被抖音前端带回 `home`
  - 回到 `home` 后，旧逻辑因为只允许在 `content/*` 页面恢复，执行链直接断掉

## 假设判定

- H1: 部分成立
  - 不是在 `executePublishSession()` 之前中断
  - 真正中断点在 `upload -> home` 回退后的上下文切换
- H2: 已排除为主要矛盾
  - “重复直跳 upload” 已被 `direct-route-skip` 证实修掉
- H3: 成立
  - 上传页进入时状态被识别为 `unknown`
  - 页面仅出现 `加载中...`，未出现任何 ready / upload 节点
- H4: 部分成立
  - 并发重入不是主因
  - 但恢复范围过窄导致回退到 `home` 后无法续跑
- H5: 成立
  - 上传页前置 DOM 未 ready，且在 ready 前就被平台重定向

## 本轮修复

- 文件：`scripts/browser-extension/platform-login-helper/content.js`
- 调整：
  - 允许 `upload -> home` 回退后在 `home` 上恢复一次
  - 只允许一次 `home recovery`，避免重新进入循环
  - 将恢复元信息写入 pending publish

- 文件：`scripts/browser-extension/platform-login-helper/publish-automation.js`
- 调整：
  - 若本次执行来源是 `page-resume-home-recovery`
  - 则在 `home` 上优先走首页真实入口点击
  - 不再再次优先直跳 `upload`

## 最新证据补充

- 对应最新复现：
  - `runtime_kv4sbodd`
  - `cmd_9etjj496`
- 已确认：
  - 首次 `command` 执行时，页面在 `home`
  - 之后进入 `content/upload?default-tab=3`
  - `page-resume` 成功接住
  - `executeImage:after-enter` 已出现
  - 但上传页仍无 ready / upload 节点
  - 随后触发一次 `page-resume-home-recovery`
  - `prefer-home-entry = true` 已命中
- 当前新缺口：
  - 只有 `prefer-home-entry` 日志
  - 缺少首页入口内部的网络级日志
  - 还无法确认是：
    - 候选按钮没找到
    - 找到了但点错节点
    - 点了但成功判定过窄

## 最新插桩

- 文件：`scripts/browser-extension/platform-login-helper/publish-automation.js`
- 新增取证点：
  - `enterDouyinPublishFromHome:start`
  - `enterDouyinPublishFromHome:already-on-publish-page`
  - `enterDouyinPublishFromHome:publish-page-detected-after-home`
  - `enterDouyinPublishFromHome:finished`
  - `clickCandidatesUntil:candidates`
  - `clickCandidatesUntil:attempt`
  - `clickCandidatesUntil:success`
  - `clickCandidatesUntil:observe-success`
  - `clickCandidatesUntil:timeout`

## 最新命中根因

- 对应最新复现：
  - `runtime_q09kzrzs`
  - `cmd_pv5odamw`
- 关键日志：
  - `enterDouyinPublishFromHome:start`
  - `clickCandidatesUntil:candidates`
  - `clickCandidatesUntil:attempt`
- 证据结论：
  - 首页入口不是“没找到”
  - 一共找到了 `2` 个候选
  - 首次点击命中的是外层卡片容器：
    - `nodeTag = div`
    - `nodeClassName = bg-tCBPTN`
    - `nodeText = 发布图文支持常用图片格式，png、jpg`
  - 点击该容器后页面会短暂跳到：
    - `content/upload?default-tab=3`
  - 随后又立即回到：
    - `home`
  - 说明当前首页入口失败的直接原因，是 selector 命中了错误的外层卡片，而不是标题/语义点击节点

## 本轮修复

- 文件：`scripts/browser-extension/platform-login-helper/publish-automation.js`
- 调整：
  - 移除首页入口中的外层卡片 selector：
    - `div.bg-tCBPTN:*`
    - `div.content-V1koTs:*`
  - 只保留更窄的候选：
    - `button:has-text("发布图文")`
    - `[role="button"]:has-text("发布图文")`
    - `[role="tab"]:has-text("发布图文")`
    - `div.title-HvY9Az:has-text("发布图文")`
    - `span:has-text("发布图文")`

## 当前状态

- 已完成首页入口候选收紧
- 待做一次 `post-fix` 复现验证是否已稳定进入编辑页

## 最新复现结果

- 对应最新复现：
  - `runtime_vld3s30n`
  - `cmd_8obke72c`
- 关键结论：
  - 候选已从错误外层卡片切换为正确标题节点：
    - `nodeClassName = title-HvY9Az`
    - `nodeText = 发布图文`
  - 但点击标题后仍会：
    - `home -> content/upload?default-tab=3 -> home`
  - 同时上传页恢复仍能接住：
    - `page-resume`
    - `page-resume-home-recovery`
  - 说明当前问题已不再是 selector 命中错误
  - 剩余问题变为：首页进入策略本身不稳定

## 最新修复

- 文件：`scripts/browser-extension/platform-login-helper/publish-automation.js`
- 调整：
  - `home recovery` 不再把“发布图文标题点击”作为唯一首页入口
  - 先尝试点击：
    - `高清发布`
  - 若已直接进入 `content/upload|publish`，则直接返回
  - 仅当 `高清发布` 未把页面带进图文态时，才继续走“发布图文”标题入口

## 链路收口

- 用户已明确指定固定链路：
  - 进入 `https://creator.douyin.com/creator-micro/home`
  - 点击 `div.bg-tCBPTN:has(div.title-HvY9Az:has-text("发布图文"))`
  - 点击 `button.container-drag-btn-k6XmB4:has(span.semi-button-content-right:has-text("上传图文"))`
  - 后续标题、正文、话题、声明、发布仍沿用原链路
- 已按此要求收窄实现：
  - 删除抖音图文进入阶段的直跳上传路由
  - 删除 `高清发布` 分支
  - 删除首页入口 fallback / 宽泛 selector 适配
  - `openDouyinImageUpload()` 也改为只使用固定 `上传图文` 按钮 selector
