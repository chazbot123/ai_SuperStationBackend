import type { PageKey, PermissionMatrix, RoleKey } from "@/types/demo";

export function hasPageAccess(matrix: PermissionMatrix, roleKey: RoleKey, pageKey: PageKey) {
  return !!matrix[roleKey]?.[pageKey];
}

export function canEdit(roleKey: RoleKey, pageKey: PageKey) {
  if (roleKey === "super_admin") return true;
  if (roleKey === "operator") return pageKey !== "rbac";
  if (roleKey === "agent_l1") return pageKey === "keywordReviews";
  return false;
}
