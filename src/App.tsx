import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import RequireAuth from "@/routes/RequireAuth";
import AgentDetail from "@/pages/AgentDetail";
import Agents from "@/pages/Agents";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import Rbac from "@/pages/Rbac";
import Assets from "@/pages/Assets";
import Personalization from "@/pages/Personalization";
import Publishing from "@/pages/Publishing";
import Reviews from "@/pages/Reviews";
import Rules from "@/pages/Rules";
import Studio from "@/pages/Studio";
import Support from "@/pages/Support";
import Videos from "@/pages/Videos";
import { useEffect } from "react";
import { useAppStore } from "@/store/appStore";

export default function App() {
  const seedIfEmpty = useAppStore((s) => s.seedIfEmpty);
  useEffect(() => {
    seedIfEmpty();
  }, [seedIfEmpty]);
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="studio" element={<Studio />} />
            <Route path="publishing" element={<Publishing />} />
            <Route path="assets" element={<Assets />} />
            <Route path="videos" element={<Videos />} />
            <Route path="support" element={<Support />} />
            <Route path="personalization" element={<Personalization />} />
            <Route path="agents" element={<Agents />} />
            <Route path="agents/:id" element={<AgentDetail />} />
            <Route path="rules" element={<Rules />} />
            <Route path="reviews" element={<Reviews />} />
            <Route path="keyword-rules" element={<Navigate to="/rules" replace />} />
            <Route path="keyword-reviews" element={<Navigate to="/reviews" replace />} />
            <Route path="rbac" element={<Rbac />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
