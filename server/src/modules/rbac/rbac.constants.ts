import { RBAC_PAGE_KEYS, RbacPageKey } from './dto/update-permission-matrix.dto';

export const MAIN_COMPANY_ROLE_KEY = 'main_company';

export type DefaultRoleDefinition = {
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
};

export const DEFAULT_ROLES: DefaultRoleDefinition[] = [
  {
    key: MAIN_COMPANY_ROLE_KEY,
    name: '主公司',
    description: '全局后台管理权限',
    isSystem: true,
  },
  {
    key: 'level1_agent',
    name: '1级代理',
    description: '代理账号，可访问代理侧页面',
    isSystem: true,
  },
  {
    key: 'department_admin',
    name: '部门管理员',
    description: '部门级管理角色',
    isSystem: true,
  },
  {
    key: 'employee',
    name: '普通员工',
    description: '普通员工基础角色',
    isSystem: true,
  },
];

export const DEFAULT_PERMISSION_MATRIX: Record<string, Record<RbacPageKey, boolean>> = {
  main_company: {
    dashboard: true,
    studio: true,
    publishing: true,
    products: true,
    assets: true,
    customerManagement: true,
    videos: true,
    support: true,
    personalization: true,
    agents: true,
    rules: true,
    reviews: true,
    rbac: true,
  },
  level1_agent: {
    dashboard: true,
    studio: true,
    publishing: true,
    products: true,
    assets: false,
    customerManagement: false,
    videos: true,
    support: false,
    personalization: true,
    agents: true,
    rules: true,
    reviews: false,
    rbac: false,
  },
  department_admin: {
    dashboard: false,
    studio: true,
    publishing: true,
    products: true,
    assets: false,
    customerManagement: false,
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
    customerManagement: false,
    videos: false,
    support: false,
    personalization: false,
    agents: false,
    rules: false,
    reviews: false,
    rbac: false,
  },
};

export function buildEmptyPermissionMap() {
  return RBAC_PAGE_KEYS.reduce(
    (pageMap, pageKey) => {
      pageMap[pageKey] = false;
      return pageMap;
    },
    {} as Record<RbacPageKey, boolean>,
  );
}
