import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Clapperboard, Mic, Sparkles } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAuthStore } from "@/store/authStore";

export default function Videos() {
  usePageMeta("视频生成");

  const user = useAuthStore((s) => s.user);
  const isAgent = user?.roleKey === "level1_agent";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-amber-300" />
                视频生成
              </CardTitle>
              <div className="mt-2 text-sm leading-6 text-zinc-400">
                当前后台将视频生成拆成两个正式模块：产品视频生成、真人口播视频生成。
                {isAgent
                  ? " 一级代理生成后先留在当前页结果列表，提交审核通过后才能同步获客。"
                  : " 主公司生成后无需提审，可直接进入后续获客和发布流程。"}
              </div>
            </div>
            <Badge variant="gray">统一走素材包审核流</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <VideoEntryCard
            icon={<Clapperboard className="h-5 w-5 text-amber-300" />}
            title="产品视频生成"
            description="面向小红书、抖音、视频号等社媒平台，生成产品、招商、热点跟拍视频。输出标题、简介、脚本、分镜、标签和视频任务结果。"
            bullets={[
              "适合产品传播、招商推广、热点跟拍",
              "支持参考图片、参考视频、参考资料上传",
              isAgent ? "一级代理需提交审核后才能同步获客" : "主公司可直接同步获客",
            ]}
            to="/videos/product-build"
            buttonText="进入产品视频生成"
          />

          <VideoEntryCard
            icon={<Mic className="h-5 w-5 text-amber-300" />}
            title="真人口播视频生成"
            description="基于上传的真人图片或真人视频，再结合口播文案，生成适合传播和获客的口播视频任务。"
            bullets={[
              "支持时长、音色、字幕、比例配置",
              "适合讲解型、咨询型、招商型内容",
              isAgent ? "一级代理结果默认带水印，提交审核后进入审核中心" : "主公司生成结果可直接使用",
            ]}
            to="/videos/avatar-ads"
            buttonText="进入真人口播视频生成"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function VideoEntryCard(props: {
  icon: ReactNode;
  title: string;
  description: string;
  bullets: string[];
  to: string;
  buttonText: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">{props.icon}</div>
        <Badge variant="gray">视频子模块</Badge>
      </div>
      <div className="mt-4 text-lg font-semibold text-zinc-100">{props.title}</div>
      <div className="mt-2 text-sm leading-6 text-zinc-400">{props.description}</div>
      <div className="mt-4 space-y-2 text-sm text-zinc-300">
        {props.bullets.map((item) => (
          <div key={item} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            {item}
          </div>
        ))}
      </div>
      <Link to={props.to} className="mt-5 inline-flex">
        <Button>{props.buttonText}</Button>
      </Link>
    </div>
  );
}
