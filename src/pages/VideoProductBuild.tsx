import VideoGenerationWorkspace from "@/components/video/VideoGenerationWorkspace";
import { VIDU_VOICE_OPTIONS } from "@/config/viduVoices";

export default function VideoProductBuild() {
  return (
    <VideoGenerationWorkspace
      pageTitle="产品视频生成"
      cardTitle="产品视频生成"
      subtitle="上传首帧图片并填写提示词，即可生成短视频并在右侧查看当前生成结果。"
      badgeText="视频子模块"
      questionPlaceholder="先写产品信息（产品名/用途/人群/卖点/价格或优惠/联系方式等），再点「润色」生成可直接口播的成稿；也可以直接输入最终口播文案。"
      defaultPrompt={[
        "产品名称：",
        "目标人群：",
        "使用场景：",
        "核心卖点（最多 3 条）：",
        "差异点/对比（可选）：",
        "价格/优惠（可选）：",
        "行动引导（咨询方式/店铺名/私信关键词）：",
        "",
        "请基于以上信息写一段可直接口播的短视频文案：短句、节奏快、聚焦产品卖点与场景，结尾给明确 CTA；不编造参数与承诺。",
      ].join("\n")}
      scriptTitle="【产品视频脚本 Demo】"
      controlMode="duration"
      defaultDurationSec={5}
      draftSource="product_video"
      enableViduVoiceSelection={true}
      viduVoiceOptions={VIDU_VOICE_OPTIONS}
    />
  );
}
