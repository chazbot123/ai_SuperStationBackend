import type { PageKey, PermissionMatrix, RoleKey } from "@/types/demo";

export function hasPageAccess(matrix: PermissionMatrix, roleKey: RoleKey, pageKey: PageKey) {
  return !!matrix[roleKey]?.[pageKey];
}

export function canEdit(roleKey: RoleKey, pageKey: PageKey) {
  if (roleKey === "main_company") return true;
  if (roleKey === "level1_agent") {
    return pageKey === "studio" || pageKey === "videos" || pageKey === "publishing" || pageKey === "products";
  }
  return false;
}
