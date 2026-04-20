import VideoGenerationWorkspace from "@/components/video/VideoGenerationWorkspace";

export default function VideoAvatarAds() {
  return (
    <VideoGenerationWorkspace
      pageTitle="真人口播视频生成"
      cardTitle="真人口播视频生成"
      subtitle="基于真人图片或真人视频和口播文案，生成适合讲解、咨询和招商传播的真人口播视频。主输入区统一使用“用户提示词”。"
      badgeText="视频子模块"
      questionPlaceholder="请输入用户提示词，也可拖入真人图片、真人视频和文档素材。例如：请根据上传人物素材生成一条适合视频号传播的招商口播视频。"
      defaultPrompt="请根据素材生成一条适合真人口播传播的视频脚本。"
      scriptTitle="【真人口播脚本 Demo】"
      controlMode="scene"
      defaultScene="产品讲解"
      sceneOptions={["产品讲解", "招商咨询", "直播转化"]}
      enableVoiceSelection
      defaultVoice="女声·亲和"
      voiceOptions={["女声·亲和", "男声·稳重", "中性·专业"]}
      historyTitle="生成结果"
    />
  );
}
