# Debug Session: edit-page-bounce

- Status: OPEN
- User symptom: 视频号和抖音进入编辑页后又退回 `home` 页
- Scope: `server/src/modules/**`

## Hypotheses

1. 页面识别条件过早触发，编辑页的短暂中间态被误判为 `home`。
2. 编辑页需要真实鼠标 hover / move 才会激活可点击区域，当前自动化只有直接 click。
3. 页面跳转后存在二次重定向或前端保护脚本，当前流程没有等待关键 DOM 稳定。
4. BitBrowser / 自动化上下文缺少某些用户行为特征，导致平台在编辑页主动回退。
5. 编辑页 click 目标元素定位错位，实际点中了返回区或空白区，随后被路由回首页。

## Plan

1. 检查视频号/抖音编辑页的状态识别与跳转逻辑。
2. 找到当前 click 实现，确认是否只有“瞬时点击”而没有鼠标移动链路。
3. 先加最小化调试日志，记录页面 URL、标题、关键状态和点击前后状态。
4. 基于证据判断是否需要补“鼠标轨迹点击”或修正页面识别条件。

## Evidence

- `server/src/modules/publishing/publishing-bitbrowser.service.ts`
  - 抖音发布入口仍返回 `https://creator.douyin.com/creator-micro/home`
  - 视频号发布入口仍返回 `https://channels.weixin.qq.com/platform`
  - 说明 BitBrowser 发布链路不是直接打开编辑页，而是先到首页再二次进入编辑页
- `scripts/browser-extension/platform-login-helper/publish-automation.js`
  - 已存在 `humanClickElement()`
  - 当前会发 `pointerover / mouseover / pointermove / mousemove / pointerdown / mousedown / pointerup / mouseup`
  - 但没有真实跨坐标轨迹，只是在目标节点上用单一坐标派发事件，然后 `node.click()`
- 历史调试结论
  - `debug-douyin-home-click-cause.md`：抖音已成功进入 `content/upload`，约 `67ms` 后平台主动回到 `home`
  - `debug-douyin-home-stuck.md`：不是单纯没点中，首页入口与恢复链路都排查过，剩余问题是进入策略本身不稳定
  - `debug-wechat-publish-bounce.md`：视频号曾出现“创建页后退回 platform”，但已有证据表明页面侧发布可成功，另有状态同步桥接问题

## Interim Conclusion

1. 抖音当前主因不是“完全不会点”，而是首页进入后平台页会主动从上传/编辑态回退。
2. BitBrowser 链路当前确实缺少更像真人的“鼠标轨迹点击”，这一点仍值得补。
3. 视频号和抖音都不是直接进入编辑页，先到首页再点入口本身就更脆弱。
4. 若要继续修，优先级应为：
   - 先把扩展侧点击升级为真实轨迹式 move + down + up
   - 再缩窄首页入口 selector 与成功判定窗口
   - 最后复现确认是否仍有平台主动回退

## Implemented

- 已修改文件：
  - `scripts/browser-extension/platform-login-helper/publish-automation.js`
- 本轮改动：
  - 为 `humanClickElement()` 增加多段轨迹移动
  - 轨迹会记住上一次虚拟鼠标位置，避免每次点击都从固定点瞬移
  - 轨迹过程中会沿路径派发 `pointerover / mouseover / pointermove / mousemove`
  - 最终再执行 `pointerdown / mousedown / pointerup / mouseup / click`
  - 抖音专用点击参数 `douyinSlowClickOptions / douyinSlowActionClickOptions / douyinSlowPublishClickOptions` 全部强制开启轨迹模式
  - 抖音图文标题、视频标题输入前，先执行轨迹点击再输入

## Next Verify

1. 复现抖音图文发布，确认 `home -> upload/editor` 是否更稳定。
2. 复现抖音视频发布，确认标题框、声明、发布按钮都走轨迹点击。
3. 若仍回 `home`，继续抓平台侧主动回退证据，而不是再盲目加点击延迟。
