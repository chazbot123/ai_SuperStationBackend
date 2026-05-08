import type {
  Account,
  AgentL1,
  KeywordItem,
  KeywordRule,
  KeywordSubmission,
  PermissionMatrix,
  Role,
} from "@/types/demo";

export function createDemoSeed() {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();

  const roles: Role[] = [
    { key: "main_company", name: "主公司", description: "全局后台管理权限", isSystem: true },
    { key: "level1_agent", name: "1级代理", description: "代理账号，可访问代理侧页面", isSystem: true },
  ];

  const rules: KeywordRule[] = [
    {
      id: "rule_default",
      name: "默认提示词规则",
      minCount: 1,
      maxCount: 30,
      minLen: 2,
      maxLen: 30,
      dedupeRequired: true,
      sensitiveFilterEnabled: true,
      submitRateLimitPerDay: null,
      createdAt: iso(new Date(now.getTime() - 7 * 24 * 3600 * 1000)),
    },
  ];

  const agents: AgentL1[] = [
    {
      id: "agent_a001",
      code: "A001",
      name: "一级代理 A001",
      status: "active",
      ruleId: rules[0].id,
      createdAt: iso(new Date(now.getTime() - 10 * 24 * 3600 * 1000)),
    },
    {
      id: "agent_a002",
      code: "A002",
      name: "一级代理 A002",
      status: "active",
      ruleId: rules[0].id,
      createdAt: iso(new Date(now.getTime() - 8 * 24 * 3600 * 1000)),
    },
  ];

  const submissions: KeywordSubmission[] = [
    {
      id: "sub_1001",
      displayId: "#1001",
      agentId: agents[0].id,
      status: "submitted",
      rejectReason: null,
      createdAt: iso(new Date(now.getTime() - 2 * 3600 * 1000)),
      reviewedAt: null,
    },
  ];

  const items: KeywordItem[] = [
    { id: "item_1", submissionId: "sub_1001", keyword: "AI 超级站" },
    { id: "item_2", submissionId: "sub_1001", keyword: "产品审核工作台" },
  ];

  const accounts: Account[] = [
    {
      id: "acc_main_company",
      email: "main@demo.local",
      displayName: "主公司账号",
      roleKey: "main_company",
      status: "active",
      createdAt: iso(new Date(now.getTime() - 30 * 24 * 3600 * 1000)),
    },
    {
      id: "acc_agent_a001",
      email: "a001@demo.local",
      displayName: "一级代理 A001",
      roleKey: "level1_agent",
      agentId: agents[0].id,
      status: "active",
      createdAt: iso(new Date(now.getTime() - 15 * 24 * 3600 * 1000)),
    },
  ];

  const permissionMatrix: PermissionMatrix = {
    main_company: {
      dashboard: true,
      studio: true,
      publishing: true,
      products: true,
      assets: true,
      videos: true,
      support: true,
      personalization: true,
      agents: false,
      rules: true,
      reviews: true,
      rbac: true,
    },
    level1_agent: {
      dashboard: false,
      studio: true,
      publishing: true,
      products: true,
      assets: false,
      videos: true,
      support: false,
      personalization: false,
      agents: false,
      rules: false,
      reviews: false,
      rbac: false,
    },
    department_admin: {
      dashboard: false,
      studio: true,
      publishing: true,
      products: true,
      assets: false,
      videos: true,
      support: false,
      personalization: false,
      agents: false,
      rules: false,
      reviews: false,
      rbac: false,
    },
    employee: {
      dashboard: false,
      studio: true,
      publishing: false,
      products: false,
      assets: false,
      videos: false,
      support: false,
      personalization: false,
      agents: false,
      rules: false,
      reviews: false,
      rbac: false,
    },
  };

  return {
    roles,
    accounts,
    permissionMatrix,
    agents,
    rules,
    submissions,
    items,
  };
}
