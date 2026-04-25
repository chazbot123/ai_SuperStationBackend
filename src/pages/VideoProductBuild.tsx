import VideoGenerationWorkspace from "@/components/video/VideoGenerationWorkspace";

export default function VideoProductBuild() {
  return (
    <VideoGenerationWorkspace
      pageTitle="产品视频生成"
      cardTitle="产品视频生成"
      subtitle="面向小红书、抖音、视频号等社媒平台，生成产品、招商、热点内容视频。主输入区统一使用“用户提示词”。"
      badgeText="视频子模块"
      questionPlaceholder="请输入用户提示词，也可拖入图片、视频、Word、PPT、PDF 等素材。例如：请根据上传素材生成一条适合抖音投放的产品招商视频。"
      defaultPrompt="请根据素材生成一条适合产品传播和招商推广的视频脚本。"
      scriptTitle="【产品视频脚本 Demo】"
      controlMode="duration"
      defaultDurationSec={30}
      draftSource="product_video"
    />
  );
}
