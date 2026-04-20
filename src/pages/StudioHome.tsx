import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FileImage, LayoutTemplate, Sparkles } from "lucide-react";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAuthStore } from "@/store/authStore";

export default function StudioHome() {
  usePageMeta("图片/文案生成");

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
                图片/文案生成
              </CardTitle>
              <div className="mt-2 text-sm leading-6 text-zinc-400">
                当前后台已将图片/文案生成拆成两个正式模块：社媒图文生成、商品图与详情图生成。
                {isAgent
                  ? " 一级代理生成后先留在当前页结果列表，提交审核通过后才能同步获客或产品管理。"
                  : " 主公司生成后无需提审，可直接进入后续获客或商品流程。"}
              </div>
            </div>
            <Badge variant="gray">统一走素材包审核流</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <EntryCard
            icon={<LayoutTemplate className="h-5 w-5 text-amber-300" />}
            title="社媒图文生成"
            description="面向小红书、抖音、视频号/微信生态，生成产品、招商、热点跟拍类图片、标题、正文和标签。"
            bullets={[
              "适合产品种草、招商推广、热点跟拍",
              "支持图片与文档素材上传",
              isAgent ? "一级代理需提交审核后才能同步获客" : "主公司可直接同步获客",
            ]}
            to="/studio/social"
            buttonText="进入社媒图文生成"
          />

          <EntryCard
            icon={<FileImage className="h-5 w-5 text-amber-300" />}
            title="商品图与详情图生成"
            description="根据产品名称、卖点和人群生成电商平台商品图、前台多场景图、详情图，并可同步到产品管理。"
            bullets={[
              "适合商品主图、场景图、详情图输出",
              "支持图生图和商品图片素材沉淀",
              isAgent ? "一级代理审核通过后才能同步产品管理" : "主公司可直接同步获客和产品管理",
            ]}
            to="/studio/product-images"
            buttonText="进入商品图与详情图生成"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function EntryCard(props: {
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
        <Badge variant="gray">图文子模块</Badge>
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
