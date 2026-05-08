import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { usePageMeta } from "@/hooks/usePageMeta";
import {
  listPlatformAccounts,
  listPublishingContents,
  listPublishingJobs,
  type PlatformAccountItem,
  type PublishingContentItem,
  type PublishingJobItem,
} from "@/lib/publishing";
import { listCustomerLeads, type CustomerLeadItem, type CustomerSourcePlatform } from "@/lib/customerManagement";
import { listKnowledgeDocuments, type KnowledgeDocumentItem } from "@/lib/knowledge";
import { listSupportConversations, type SupportConversationItem, type SupportConversationStatus } from "@/lib/support";
import { useAuthStore } from "@/store/authStore";
import { useProductsStore } from "@/store/productsStore";

type DashboardData = {
  contents: PublishingContentItem[];
  jobs: PublishingJobItem[];
  accounts: PlatformAccountItem[];
  leads: CustomerLeadItem[];
  conversations: SupportConversationItem[];
  knowledgeDocuments: KnowledgeDocumentItem[];
};

type PaginatedResult<T> = {
  items: T[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
  };
};

type ChartItem = {
  label: string;
  value: number;
  color: string;
};

type TrendPoint = {
  label: string;
  value: number;
};

const EMPTY_DASHBOARD_DATA: DashboardData = {
  contents: [],
  jobs: [],
  accounts: [],
  leads: [],
  conversations: [],
  knowledgeDocuments: [],
};

const CHART_COLORS = ["#38BDF8", "#22C55E", "#F59E0B", "#A855F7", "#F43F5E", "#14B8A6", "#8B5CF6"];
const RECENT_DAY_COUNT = 7;

const CONTENT_TYPE_LABELS = [
  { key: "copy", label: "文案" },
  { key: "image_text", label: "图文" },
  { key: "video", label: "视频" },
  { key: "product_asset", label: "商品素材" },
] as const;

const PUBLISH_STATUS_LABELS = [
  { key: "queued", label: "排队中" },
  { key: "running", label: "执行中" },
  { key: "success", label: "成功" },
  { key: "failed", label: "失败" },
] as const;

const LEAD_SOURCE_LABELS = [
  { key: "super_site", label: "超级站" },
  { key: "douyin", label: "抖音" },
  { key: "xiaohongshu", label: "小红书" },
  { key: "video_channel", label: "视频号" },
  { key: "kuaishou", label: "快手" },
  { key: "gaode_map", label: "高德地图" },
] as const;

const SUPPORT_STATUS_LABELS = [
  { key: "ai_chat", label: "AI 会话" },
  { key: "handoff_requested", label: "待转人工" },
  { key: "queueing", label: "排队中" },
  { key: "human_chat", label: "人工处理中" },
  { key: "ended", label: "已结束" },
] as const;

const PRODUCT_STATUS_LABELS = [
  { key: "draft", label: "草稿" },
  { key: "submitted", label: "待审核" },
  { key: "live", label: "已上架" },
  { key: "rejected", label: "已驳回" },
  { key: "offline", label: "已下架" },
] as const;

const KNOWLEDGE_STATUS_LABELS = [
  { key: "pending", label: "待处理" },
  { key: "indexing", label: "索引中" },
  { key: "ready", label: "可用" },
  { key: "failed", label: "失败" },
] as const;

export default function Dashboard() {
  usePageMeta("仪表盘");
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const products = useProductsStore((s) => s.items);
  const productsLoading = useProductsStore((s) => s.loading);
  const productsInitialized = useProductsStore((s) => s.initialized);
  const productsError = useProductsStore((s) => s.error);
  const loadProducts = useProductsStore((s) => s.load);
  const [dashboardData, setDashboardData] = useState<DashboardData>(EMPTY_DASHBOARD_DATA);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || user?.roleKey !== "main_company") return;
    void loadProducts();
  }, [accessToken, loadProducts, user?.id, user?.roleKey]);

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

  useEffect(() => {
    if (!accessToken || user?.roleKey !== "main_company") {
      setDashboardData(EMPTY_DASHBOARD_DATA);
      setDashboardError(null);
      return;
    }

    let cancelled = false;
    setDashboardLoading(true);

    void (async () => {
      const results = await Promise.allSettled([
        loadAllPages((page, limit) => listPublishingContents({ accessToken, page, limit })),
        loadAllPages((page, limit) => listPublishingJobs({ accessToken, page, limit })),
        loadAllPages((page, limit) => listPlatformAccounts({ accessToken, page, limit })),
        loadAllPages((page, limit) => listCustomerLeads({ accessToken, page, limit })),
        loadAllPages((page, limit) => listSupportConversations({ accessToken, page, limit })),
        loadAllPages((page, limit) => listKnowledgeDocuments({ accessToken, page, limit })),
      ]);

      if (cancelled) {
        return;
      }

      const nextData: DashboardData = { ...EMPTY_DASHBOARD_DATA };
      const failedModules: string[] = [];

      if (results[0].status === "fulfilled") nextData.contents = results[0].value;
      else failedModules.push("获客内容池");

      if (results[1].status === "fulfilled") nextData.jobs = results[1].value;
      else failedModules.push("发布任务");

      if (results[2].status === "fulfilled") nextData.accounts = results[2].value;
      else failedModules.push("平台账号");

      if (results[3].status === "fulfilled") nextData.leads = results[3].value;
      else failedModules.push("客户线索");

      if (results[4].status === "fulfilled") nextData.conversations = results[4].value;
      else failedModules.push("AI 客服");

      if (results[5].status === "fulfilled") nextData.knowledgeDocuments = results[5].value;
      else failedModules.push("知识库");

      setDashboardData(nextData);
      setDashboardError(failedModules.length > 0 ? `部分模块数据加载失败：${failedModules.join("、")}` : null);
      setDashboardLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, user?.roleKey]);

  const today = new Date().toISOString().slice(0, 10);
  const validAccountsCount = dashboardData.accounts.filter(
    (item) => item.status === "valid" || item.loginStatus === "authenticated",
  ).length;
  const waitingSupportCount = dashboardData.conversations.filter(
    (item) => item.status === "handoff_requested" || item.status === "queueing",
  ).length;
  const humanSupportCount = dashboardData.conversations.filter((item) => item.status === "human_chat").length;
  const readyKnowledgeCount = dashboardData.knowledgeDocuments.filter((item) => item.indexStatus === "ready").length;
  const failedKnowledgeCount = dashboardData.knowledgeDocuments.filter(
    (item) => item.indexStatus === "failed" || item.parseStatus === "failed",
  ).length;
  const liveProducts = products.filter((item) => item.status === "live").length;
  const submittedProducts = products.filter((item) => item.status === "submitted").length;
  const todayProductCount = products.filter((item) => getDateKey(item.createdAt) === today).length;
  const todayLeadCount = dashboardData.leads.filter((item) => getDateKey(item.createdAt) === today).length;
  const todayContentCount = dashboardData.contents.filter((item) => getDateKey(item.createdAt) === today).length;
  const todaySupportCount = dashboardData.conversations.filter((item) => getDateKey(item.createdAt) === today).length;
  const publishSuccessCount = dashboardData.jobs.filter((item) => item.status === "success").length;
  const publishFailedCount = dashboardData.jobs.filter((item) => item.status === "failed").length;
  const isLoading = dashboardLoading || (productsLoading && !productsInitialized);
  const mergedError = [dashboardError, productsError].filter(Boolean).join("；") || null;
  const hasAnyData = useMemo(
    () =>
      products.length > 0
      || dashboardData.contents.length > 0
      || dashboardData.jobs.length > 0
      || dashboardData.accounts.length > 0
      || dashboardData.leads.length > 0
      || dashboardData.conversations.length > 0
      || dashboardData.knowledgeDocuments.length > 0,
    [dashboardData, products.length],
  );

  const overviewMetrics = [
    { title: "内容池总数", value: dashboardData.contents.length, hint: "已进入获客内容池" },
    { title: "发布成功数", value: publishSuccessCount, hint: "累计成功发布任务" },
    { title: "商品总数", value: products.length, hint: "当前真实商品数据" },
    { title: "已上架商品", value: liveProducts, hint: "前台当前可展示商品" },
    { title: "客户线索数", value: dashboardData.leads.length, hint: "客户管理已收录线索" },
    { title: "待人工客服", value: waitingSupportCount, hint: "待接管会话数" },
    { title: "知识文档数", value: dashboardData.knowledgeDocuments.length, hint: "知识库已上传文件" },
    { title: "可用账号数", value: validAccountsCount, hint: "平台登录状态可用" },
  ];

  const contentTypeChart = buildCountChart(
    CONTENT_TYPE_LABELS,
    dashboardData.contents.map((item) => item.contentType),
  );
  const publishStatusChart = buildCountChart(
    PUBLISH_STATUS_LABELS,
    dashboardData.jobs.map((item) => item.status),
  );
  const leadSourceChart = buildCountChart(
    LEAD_SOURCE_LABELS,
    dashboardData.leads.map((item) => item.sourcePlatform),
  );
  const supportStatusChart = buildCountChart(
    SUPPORT_STATUS_LABELS,
    dashboardData.conversations.map((item) => item.status),
  );
  const productStatusChart = buildCountChart(
    PRODUCT_STATUS_LABELS,
    products.map((item) => item.status),
  );
  const knowledgeStatusChart = buildCountChart(
    KNOWLEDGE_STATUS_LABELS,
    dashboardData.knowledgeDocuments.map((item) => item.indexStatus),
  );

  const recentContentTrend = buildDailyTrend(dashboardData.contents, (item) => item.createdAt);
  const recentLeadTrend = buildDailyTrend(dashboardData.leads, (item) => item.createdAt);
  const recentProductTrend = buildDailyTrend(products, (item) => item.createdAt);

  return (
    <div className="space-y-4">
      {mergedError ? (
        <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {mergedError}
        </div>
      ) : null}

      {isLoading && !hasAnyData ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-zinc-400">正在加载仪表盘数据...</CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overviewMetrics.map((item) => (
          <MetricCard key={item.title} title={item.title} value={item.value} hint={item.hint} />
        ))}
      </div>

      <DashboardSection
        title="获客与发布"
        description="展示获客内容池、发布任务和平台账号的当前数据。"
        linkTo="/publishing"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <SectionMetric title="今日入池" value={todayContentCount} hint="今日新增内容" />
          <SectionMetric title="发布任务" value={dashboardData.jobs.length} hint="累计任务总数" />
          <SectionMetric title="发布失败" value={publishFailedCount} hint="待处理失败任务" />
          <SectionMetric title="已接通账号" value={validAccountsCount} hint="登录状态可用" />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <BarChartCard title="内容类型分布" items={contentTypeChart} emptyText="暂无内容池数据" />
          <BarChartCard title="发布任务状态" items={publishStatusChart} emptyText="暂无发布任务数据" />
          <TrendChartCard title="最近 7 天内容新增" items={recentContentTrend} color="#38BDF8" />
        </div>
      </DashboardSection>

      <DashboardSection
        title="客户与客服"
        description="展示客户线索来源和 AI 客服会话承接情况。"
        linkTo="/customer-management"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <SectionMetric title="今日新增线索" value={todayLeadCount} hint="今日导入或新增" />
          <SectionMetric title="客服总会话" value={dashboardData.conversations.length} hint="AI 客服全部会话" />
          <SectionMetric title="待人工处理" value={waitingSupportCount} hint="待接管或排队中" />
          <SectionMetric title="人工处理中" value={humanSupportCount} hint="当前人工接待中" />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <BarChartCard title="线索来源分布" items={leadSourceChart} emptyText="暂无客户线索数据" />
          <BarChartCard title="客服会话状态" items={supportStatusChart} emptyText="暂无 AI 客服数据" />
          <TrendChartCard title="最近 7 天线索新增" items={recentLeadTrend} color="#22C55E" />
        </div>
      </DashboardSection>

      <DashboardSection
        title="商品与知识库"
        description="展示商品状态和知识库文档当前可用情况。"
        linkTo="/products"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <SectionMetric title="今日新增商品" value={todayProductCount} hint="按创建时间统计" />
          <SectionMetric title="待审核商品" value={submittedProducts} hint="等待主公司审核" />
          <SectionMetric title="可用知识文档" value={readyKnowledgeCount} hint="索引已就绪" />
          <SectionMetric title="失败文档" value={failedKnowledgeCount} hint="需重新处理" />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <BarChartCard title="商品状态分布" items={productStatusChart} emptyText="暂无商品数据" />
          <BarChartCard title="知识库状态分布" items={knowledgeStatusChart} emptyText="暂无知识库文档" />
          <TrendChartCard title="最近 7 天商品新增" items={recentProductTrend} color="#F59E0B" />
        </div>
      </DashboardSection>
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
        <div className="text-2xl font-semibold text-zinc-100">{formatNumber(props.value)}</div>
        <div className="text-xs text-zinc-400">{props.hint}</div>
      </CardContent>
    </Card>
  );
}

function DashboardSection(props: {
  title: string;
  description: string;
  linkTo: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>{props.title}</CardTitle>
            <div className="mt-2 text-sm text-zinc-400">{props.description}</div>
          </div>
          <Link to={props.linkTo}>
            <Button type="button" size="sm" variant="secondary">
              查看模块
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">{props.children}</CardContent>
    </Card>
  );
}

function SectionMetric(props: { title: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3">
      <div className="text-xs text-zinc-400">{props.title}</div>
      <div className="mt-1 text-xl font-semibold text-zinc-100">{formatNumber(props.value)}</div>
      <div className="mt-1 text-xs text-zinc-500">{props.hint}</div>
    </div>
  );
}

function BarChartCard(props: { title: string; items: ChartItem[]; emptyText: string }) {
  const maxValue = Math.max(...props.items.map((item) => item.value), 0);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm font-semibold text-zinc-100">{props.title}</div>
      {maxValue === 0 ? (
        <div className="mt-6 text-sm text-zinc-500">{props.emptyText}</div>
      ) : (
        <div className="mt-4 space-y-3">
          {props.items.map((item) => (
            <div key={item.label} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs text-zinc-300">
                <span>{item.label}</span>
                <span>{formatNumber(item.value)}</span>
              </div>
              <div className="h-2 rounded-full bg-white/10">
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${item.value > 0 ? Math.max((item.value / maxValue) * 100, 8) : 0}%`,
                    backgroundColor: item.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrendChartCard(props: { title: string; items: TrendPoint[]; color: string }) {
  const maxValue = Math.max(...props.items.map((item) => item.value), 0);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm font-semibold text-zinc-100">{props.title}</div>
      <div className="mt-4 flex h-44 items-end gap-3">
        {props.items.map((item) => (
          <div key={item.label} className="flex flex-1 flex-col items-center justify-end gap-2">
            <div className="text-[11px] text-zinc-400">{formatNumber(item.value)}</div>
            <div className="flex h-28 w-full items-end rounded-xl bg-black/20 px-1.5 pb-1.5">
              <div
                className="w-full rounded-lg"
                style={{
                  height: `${item.value > 0 && maxValue > 0 ? Math.max((item.value / maxValue) * 100, 12) : 6}%`,
                  backgroundColor: props.color,
                }}
              />
            </div>
            <div className="text-[11px] text-zinc-500">{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function getDateKey(value?: string | null) {
  const text = value?.slice(0, 10);
  return text || "";
}

function buildCountChart<const T extends string>(
  definitions: readonly { key: T; label: string }[],
  values: T[],
) {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return definitions.map((item, index) => ({
    label: item.label,
    value: counts.get(item.key) ?? 0,
    color: CHART_COLORS[index % CHART_COLORS.length],
  }));
}

function buildDailyTrend<T>(items: T[], getDate: (item: T) => string | null | undefined) {
  const dateKeys = Array.from({ length: RECENT_DAY_COUNT }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (RECENT_DAY_COUNT - index - 1));
    return date.toISOString().slice(0, 10);
  });

  return dateKeys.map((dateKey) => ({
    label: dateKey.slice(5),
    value: items.filter((item) => getDateKey(getDate(item)) === dateKey).length,
  }));
}

async function loadAllPages<T>(
  requestPage: (page: number, limit: number) => Promise<PaginatedResult<T>>,
  limit = 100,
) {
  const firstPage = await requestPage(1, limit);
  const items = [...firstPage.items];
  const total = firstPage.pagination?.total ?? firstPage.items.length;
  const totalPages = firstPage.pagination
    ? Math.max(1, Math.ceil(total / (firstPage.pagination.limit || limit)))
    : 1;

  for (let page = 2; page <= totalPages; page += 1) {
    const response = await requestPage(page, limit);
    items.push(...response.items);
  }

  return items;
}
