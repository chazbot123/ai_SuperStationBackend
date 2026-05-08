import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { useAuthStore } from "@/store/authStore";
import { useRbacStore } from "@/store/rbacStore";

export default function AppShell() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const initialized = useRbacStore((s) => s.initialized);
  const loading = useRbacStore((s) => s.loading);
  const loadRbac = useRbacStore((s) => s.load);
  const resetRbac = useRbacStore((s) => s.reset);

  useEffect(() => {
    if (!accessToken) {
      resetRbac();
      return;
    }

    if (!initialized && !loading) {
      void loadRbac();
    }
  }, [
    accessToken,
    initialized,
    loadRbac,
    loading,
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
