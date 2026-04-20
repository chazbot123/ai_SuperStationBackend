import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import RequireAuth from "@/routes/RequireAuth";
import RequirePageAccess from "@/routes/RequirePageAccess";
import AgentDetail from "@/pages/AgentDetail";
import Agents from "@/pages/Agents";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import Rbac from "@/pages/Rbac";
import Assets from "@/pages/Assets";
import Personalization from "@/pages/Personalization";
import Publishing from "@/pages/Publishing";
import Products from "@/pages/Products";
import Reviews from "@/pages/Reviews";
import Rules from "@/pages/Rules";
import SpecialOffers from "@/pages/SpecialOffers";
import Studio from "@/pages/Studio";
import StudioHome from "@/pages/StudioHome";
import StudioImages from "@/pages/StudioImages";
import Support from "@/pages/Support";
import VideoAvatarAds from "@/pages/VideoAvatarAds";
import VideoProductBuild from "@/pages/VideoProductBuild";
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
            <Route index element={<RequirePageAccess pageKey="dashboard"><Dashboard /></RequirePageAccess>} />
            <Route path="studio" element={<RequirePageAccess pageKey="studio"><StudioHome /></RequirePageAccess>} />
            <Route path="studio/social" element={<RequirePageAccess pageKey="studio"><Studio /></RequirePageAccess>} />
            <Route path="studio/product-images" element={<RequirePageAccess pageKey="studio"><StudioImages /></RequirePageAccess>} />
            <Route path="studio/images" element={<Navigate to="/studio/product-images" replace />} />
            <Route path="publishing" element={<RequirePageAccess pageKey="publishing"><Publishing /></RequirePageAccess>} />
            <Route path="products" element={<RequirePageAccess pageKey="products"><Products /></RequirePageAccess>} />
            <Route path="products/special-offers" element={<RequirePageAccess pageKey="products"><SpecialOffers /></RequirePageAccess>} />
            <Route path="assets" element={<RequirePageAccess pageKey="assets"><Assets /></RequirePageAccess>} />
            <Route path="videos" element={<RequirePageAccess pageKey="videos"><Videos /></RequirePageAccess>} />
            <Route path="videos/avatar-ads" element={<RequirePageAccess pageKey="videos"><VideoAvatarAds /></RequirePageAccess>} />
            <Route path="videos/product-build" element={<RequirePageAccess pageKey="videos"><VideoProductBuild /></RequirePageAccess>} />
            <Route path="support" element={<RequirePageAccess pageKey="support"><Support /></RequirePageAccess>} />
            <Route path="personalization" element={<RequirePageAccess pageKey="personalization"><Personalization /></RequirePageAccess>} />
            <Route path="special-offers" element={<Navigate to="/products" replace />} />
            <Route path="agents" element={<RequirePageAccess pageKey="agents"><Agents /></RequirePageAccess>} />
            <Route path="agents/:id" element={<RequirePageAccess pageKey="agents"><AgentDetail /></RequirePageAccess>} />
            <Route path="rules" element={<RequirePageAccess pageKey="rules"><Rules /></RequirePageAccess>} />
            <Route path="reviews" element={<RequirePageAccess pageKey="reviews"><Reviews /></RequirePageAccess>} />
            <Route path="keyword-rules" element={<Navigate to="/rules" replace />} />
            <Route path="keyword-reviews" element={<Navigate to="/reviews" replace />} />
            <Route path="rbac" element={<RequirePageAccess pageKey="rbac"><Rbac /></RequirePageAccess>} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
