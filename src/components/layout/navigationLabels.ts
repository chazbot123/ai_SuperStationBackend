export const navLabels = {
  dashboard: "仪表盘",
  studio: "图片/文案生成",
  studioDrafts: "草稿箱",
  studioSocial: "社媒图文生成",
  studioProductImages: "商品图与详情图生成",
  videos: "视频生成",
  videosDrafts: "草稿箱",
  videosProductBuild: "产品视频生成",
  videosAvatarAds: "真人口播视频生成",
  products: "产品管理",
  agents: "代理管理",
  reviews: "审核中心",
  reviewsMaterials: "素材审核",
  reviewsProducts: "商品审核",
  publishing: "AI获客",
  publishingStoreSearch: "门店搜索",
  publishingPlatformLogin: "平台登录",
  publishingJobs: "发布任务",
  personalization: "超级站配置中心",
  personalizationLayout: "超级站地址设置",
  personalizationMetrics: "运营指标",
  personalizationIndustry: "行业与招商",
  rules: "模型配置",
  assets: "知识库管理",
  customerManagement: "客户管理",
  support: "AI客服",
  rbac: "用户/角色/权限",
  rbacUsers: "用户管理",
  rbacRoles: "角色管理",
  rbacPermissions: "权限矩阵",
  appTitle: "AI 超级站后台",
  loadingMenu: "正在加载功能菜单...",
  syncingPermissions: "正在同步账号权限...",
  menuLoadFailed: "权限菜单加载失败，正在自动重试...",
  noVisibleMenu: "当前账号暂无可访问菜单",
  logout: "退出",
} as const;

export function resolveTopbarTitle(pathname: string) {
  if (pathname === "/") return navLabels.dashboard;
  if (pathname.startsWith("/studio/drafts")) return navLabels.studioDrafts;
  if (pathname.startsWith("/studio/product-images")) return navLabels.studioProductImages;
  if (pathname.startsWith("/studio/social")) return navLabels.studioSocial;
  if (pathname.startsWith("/studio")) return navLabels.studio;
  if (pathname.startsWith("/publishing/store-search")) return navLabels.publishingStoreSearch;
  if (pathname.startsWith("/publishing")) return navLabels.publishing;
  if (pathname.startsWith("/products") || pathname.startsWith("/special-offers")) return navLabels.products;
  if (pathname.startsWith("/assets")) return navLabels.assets;
  if (pathname.startsWith("/customer-management")) return navLabels.customerManagement;
  if (pathname.startsWith("/videos/product-build")) return navLabels.videosProductBuild;
  if (pathname.startsWith("/videos/avatar-ads")) return navLabels.videosAvatarAds;
  if (pathname.startsWith("/videos")) return navLabels.videos;
  if (pathname.startsWith("/support")) return navLabels.support;
  if (pathname.startsWith("/personalization")) return navLabels.personalization;
  if (pathname.startsWith("/rules")) return navLabels.rules;
  if (pathname.startsWith("/reviews")) return navLabels.reviews;
  if (pathname.startsWith("/rbac")) return navLabels.rbac;
  if (pathname.startsWith("/agents")) return navLabels.agents;
  return navLabels.appTitle;
}
