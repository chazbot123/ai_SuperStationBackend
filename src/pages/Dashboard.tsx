import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Table, TableWrap, Td, Th, Tr } from "@/components/ui/Table";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useAuthStore } from "@/store/authStore";
import { useAppStore } from "@/store/appStore";
import { useProductsStore } from "@/store/productsStore";

export default function Dashboard() {
  usePageMeta("仪表盘");
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const contents = useAppStore((s) => s.contents);
  const jobs = useAppStore((s) => s.publishJobs);
  const products = useProductsStore((s) => s.items);
  const productsInitialized = useProductsStore((s) => s.initialized);
  const productsError = useProductsStore((s) => s.error);
  const loadProducts = useProductsStore((s) => s.load);

  useEffect(() => {
    if (!accessToken || user?.roleKey !== "main_company") return;
    if (!productsInitialized || productsError) {
      void loadProducts();
    }
  }, [accessToken, loadProducts, productsError, productsInitialized, user?.roleKey]);

  if (user?.roleKey !== "main_company") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>工作台说明</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-zinc-300">
          1级代理默认从“图片/文案生成”开始使用后台，不单独展示全局仪表盘。
        </CardContent>
      </Card>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const pendingMaterials = contents.filter((item) => item.reviewStatus === "submitted").length;
  const pendingProducts = products.filter((item) => item.status === "submitted").length;
  const todayGenerated = contents.filter((item) => item.createdAt.slice(0, 10) === today).length;
  const todayPublishSuccess = jobs.filter(
    (item) => item.status === "success" && item.createdAt.slice(0, 10) === today
  ).length;
  const liveProducts = products.filter((item) => item.status === "live").length;
  const draftProducts = products.filter((item) => item.status === "draft").length;
  const unseenCopy = contents.filter((item) => item.type === "copy" && !item.syncedToLeads).length;
  const unseenVideo = contents.filter((item) => item.type === "video" && !item.syncedToLeads).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard title="待审核素材数" value={pendingMaterials} hint="代理提交的图文/视频素材" />
        <MetricCard title="待审核商品数" value={pendingProducts} hint="代理提交的商品上架申请" />
        <MetricCard title="今日生成数" value={todayGenerated} hint="今日新增素材包总量" />
        <MetricCard title="今日发布成功数" value={todayPublishSuccess} hint="发布任务成功回传数" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard title="图文已生成未预览" value={unseenCopy} hint="尚未同步到获客内容池" />
        <MetricCard title="视频已生成未预览" value={unseenVideo} hint="尚未同步到获客内容池" />
        <MetricCard title="已上架商品数" value={liveProducts} hint="前台当前可展示商品" />
        <MetricCard title="草稿商品数" value={draftProducts} hint="尚未提审的商品" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>功能总览</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <FeatureGroup
            title="当前已实现"
            items={[
              { label: "用户/角色/权限", to: "/rbac", hint: "真实后端接口已接通" },
              { label: "代理管理", to: "/agents", hint: "列表、详情、创建、更新已接通" },
              { label: "产品管理", to: "/products", hint: "列表、编辑、提审、上下架已切到真实后端接口" },
            ]}
            variant="green"
          />
          <FeatureGroup
            title="Demo 展示"
            items={[
              { label: "图片/文案生成", to: "/studio", hint: "当前主要展示前端 Demo 流程" },
              { label: "视频生成", to: "/videos", hint: "当前主要展示前端 Demo 流程" },
              { label: "审核中心", to: "/reviews", hint: "当前主要展示前端 Demo 审核流" },
              { label: "获客内容池", to: "/publishing", hint: "当前主要展示前端 Demo 流程" },
              { label: "模型配置", to: "/rules", hint: "当前主要展示前端 Demo 配置页" },
              { label: "知识库 / AI客服 / 前台配置", to: "/assets", hint: "相关页面当前均以 Demo 展示为主" },
            ]}
            variant="gray"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>审核概览</CardTitle>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>类型</Th>
                  <Th>数量</Th>
                  <Th>说明</Th>
                </tr>
              </thead>
              <tbody>
                <Tr>
                  <Td className="font-medium text-zinc-100">素材审核</Td>
                  <Td><Badge variant="amber">{pendingMaterials}</Badge></Td>
                  <Td className="text-zinc-400">代理生成的图片/视频/标题/文案需主公司审核</Td>
                </Tr>
                <Tr>
                  <Td className="font-medium text-zinc-100">产品审核</Td>
                  <Td><Badge variant="amber">{pendingProducts}</Badge></Td>
                  <Td className="text-zinc-400">代理创建的商品需审核通过后才能上架</Td>
                </Tr>
              </tbody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>商品运营概览</CardTitle>
        </CardHeader>
        <CardContent>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>商品</Th>
                  <Th>创建人</Th>
                  <Th>状态</Th>
                  <Th>更新时间</Th>
                </tr>
              </thead>
              <tbody>
                {products.slice(0, 6).map((product) => (
                  <Tr key={product.id}>
                    <Td className="font-medium text-zinc-100">{product.name}</Td>
                    <Td className="text-zinc-300">{product.ownerName}</Td>
                    <Td><StatusBadge status={product.status} /></Td>
                    <Td className="text-zinc-400">{new Date(product.updatedAt).toLocaleString()}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard(props: { title: string; value: number; hint: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-zinc-100">{props.value}</div>
        <div className="text-xs text-zinc-400">{props.hint}</div>
      </CardContent>
    </Card>
  );
}

function FeatureGroup(props: {
  title: string;
  variant: "green" | "gray";
  items: { label: string; to: string; hint: string }[];
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-100">{props.title}</div>
        <Badge variant={props.variant}>{props.variant === "green" ? "已实现" : "Demo"}</Badge>
      </div>
      <div className="space-y-3">
        {props.items.map((item) => (
          <div key={`${props.title}-${item.label}`} className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-medium text-zinc-100">{item.label}</div>
                <div className="mt-1 text-xs leading-5 text-zinc-400">{item.hint}</div>
              </div>
              <Link to={item.to}>
                <Button size="sm" variant="secondary">进入</Button>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge(props: { status: "draft" | "submitted" | "live" | "rejected" | "offline" }) {
  if (props.status === "live") return <Badge variant="green">已上架</Badge>;
  if (props.status === "submitted") return <Badge variant="amber">待审核</Badge>;
  if (props.status === "rejected") return <Badge variant="red">审核驳回</Badge>;
  if (props.status === "offline") return <Badge variant="gray">已下架</Badge>;
  return <Badge variant="gray">草稿</Badge>;
}
