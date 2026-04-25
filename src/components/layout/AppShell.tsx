import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { useAuthStore } from "@/store/authStore";
import { useRbacStore } from "@/store/rbacStore";

export default function AppShell() {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const roles = useRbacStore((s) => s.roles);
  const permissionMatrix = useRbacStore((s) => s.permissionMatrix);
  const initialized = useRbacStore((s) => s.initialized);
  const loading = useRbacStore((s) => s.loading);
  const error = useRbacStore((s) => s.error);
  const loadRbac = useRbacStore((s) => s.load);
  const resetRbac = useRbacStore((s) => s.reset);

  const missingRolePermissions = !!user && !permissionMatrix[user.roleKey];
  const missingRoleDefinition = !!user && !roles.some((role) => role.key === user.roleKey);

  useEffect(() => {
    if (!accessToken) {
      resetRbac();
      return;
    }

    if ((!initialized || missingRolePermissions || missingRoleDefinition || !!error) && !loading) {
      void loadRbac();
    }
  }, [
    accessToken,
    error,
    initialized,
    loadRbac,
    loading,
    missingRoleDefinition,
    missingRolePermissions,
    resetRbac,
  ]);

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1 overflow-auto p-4 text-zinc-100 md:p-6">
          <div className="mx-auto w-full max-w-[1200px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
