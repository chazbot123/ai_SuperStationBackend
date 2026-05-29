# [OPEN] douyin-home-click-cause

## 症状

- 抖音图文发布从 `home` 进入后，页面仍会回退到 `home`
- 用户怀疑是平台侧回退，或点击速度/人工模拟不够像真人

## 复现口径

- 当前固定链路：
  - 进入 `https://creator.douyin.com/creator-micro/home`
  - 点击 `发布图文` 卡片
  - 点击 `上传图文` 按钮
- 现象：
  - 没有稳定停留在编辑页
  - 最终回到 `home`

## 假设

- H1：卡片点击已经触发，但平台前端在进入上传路由后主动重定向回 `home`
- H2：点击目标节点正确，但点击事件链不满足平台判定，导致页面短暂跳转后回退
- H3：点击速度/节奏过快，未满足平台对人工交互的时序要求
- H4：上传按钮页其实已出现，但检测窗口过短或日志不足，误判为未进入编辑态
- H5：固定 DOM 查找本身已命中，但新的实现尚未真正在用户当前扩展实例中生效

## 当前策略

- 第一步只补运行时取证，不改业务逻辑
- 重点记录：
  - 卡片/按钮是否命中
  - 实际点击的节点
  - 点击前后 URL 与页面文本
  - 点击耗时与等待耗时
  - 是否出现上传按钮 / 编辑器 ready 节点

## 最新证据

- 已确认不是“后端素材未拉取导致无法上传”
- 关键时间线：
  - `1779959158967`：页面进入 `https://creator.douyin.com/creator-micro/content/upload?default-tab=3`
  - `1779959159197`：`fixed-chain-end` 记录到：
    - `hasUploadNode = true`
    - `hasUploadButton = true`
    - 页面文本已出现图片格式、大小、比例等上传页内容
  - `1779959159201`：`ensureDouyinImagePublishReady:start` 再次确认：
    - `hasUploadNode = true`
    - 当前仍在 `content/upload`
  - `1779959159268`：运行时心跳已回到 `https://creator.douyin.com/creator-micro/home`
- 结论：
  - 上传页不是没打开
  - 上传按钮和文件输入框已经渲染出来
  - 但在进入上传页后约 `67ms` 内页面主动回退到 `home`
  - 回退发生在 `before-upload-click`、`fetchFile:start` 之前

## 当前判断

- H1 基本成立：平台前端在上传页已渲染后仍主动回退到 `home`
- H4 也成立：此前不是“没进上传页”，而是上传页存在时间太短，后续步骤来不及执行
- 当前可排除：
  - 不是素材下载失败
  - 不是文件上传失败
  - 不是单纯“找不到上传按钮”
