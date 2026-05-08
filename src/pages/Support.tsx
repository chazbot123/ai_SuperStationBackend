import { useState } from "react";
import Tabs from "@/components/ui/Tabs";
import { usePageMeta } from "@/hooks/usePageMeta";
import SupportAdminPanel from "@/pages/support/SupportAdminPanel";
import SupportWorkbenchPanel from "@/pages/support/SupportWorkbenchPanel";

export default function Support() {
  usePageMeta("AI客服");
  const [tab, setTab] = useState<"admin" | "workbench">("admin");

  return (
    <div className="space-y-4">
      <Tabs
        value={tab}
        onChange={(key) => {
          if (key === "admin" || key === "workbench") {
            setTab(key);
          }
        }}
        tabs={[
          { key: "admin", label: "客服后台" },
          { key: "workbench", label: "开发测试台" },
        ]}
      />
      {tab === "admin" ? <SupportAdminPanel /> : <SupportWorkbenchPanel />}
    </div>
  );
}
