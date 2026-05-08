import VideoGenerationWorkspace from "@/components/video/VideoGenerationWorkspace";
import { VIDU_VOICE_OPTIONS } from "@/config/viduVoices";

export default function VideoAvatarAds() {
  return (
    <VideoGenerationWorkspace
      pageTitle="真人口播视频生成"
      cardTitle="真人口播视频生成"
      subtitle="上传一张人物肖像图 + 粘贴长文本脚本，系统会自动拆分脚本并生成多个视频片段，最终拼接成完整口播视频。"
      badgeText="视频子模块"
      questionPlaceholder="请粘贴完整口播脚本（可包含换行与段落）。同时上传一张人物正面肖像图作为参考图。"
      defaultPrompt={[
        "【主题/产品】",
        "产品名称：",
        "一句话卖点：",
        "",
        "【补充信息】",
        "目标人群：",
        "使用场景：",
        "核心卖点（最多 3 条）：",
        "价格/优惠（可选）：",
        "限制点（如禁用词/不能承诺/不能虚构数据）：",
        "",
        "【口播脚本】",
        "开场钩子（3 秒内）：",
        "展开讲解（分 3-6 段，每段 1-2 句短句）：",
        "转化收口（行动引导：关注/私信关键词/进店/咨询）：",
        "",
        "要求：口吻自然像真实直播间，节奏快但信息清楚；不编造参数与背书。",
      ].join("\n")}
      scriptTitle="【真人口播脚本】"
      controlMode="scene"
      defaultScene="产品讲解"
      sceneOptions={["产品讲解", "招商咨询", "直播转化"]}
      enableViduVoiceSelection={true}
      viduVoiceOptions={VIDU_VOICE_OPTIONS}
      draftSource="avatar_video"
    />
  );
}
