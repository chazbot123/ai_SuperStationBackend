import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import RequireAuth from "@/routes/RequireAuth";
import RequirePageAccess from "@/routes/RequirePageAccess";
import Dashboard from "@/pages/Dashboard";
import Login from "@/pages/Login";
import Rbac from "@/pages/Rbac";
import UserAgreement from "@/pages/UserAgreement";
import Assets from "@/pages/Assets";
import CustomerManagement from "@/pages/CustomerManagement";
import Personalization from "@/pages/Personalization";
import Publishing from "@/pages/Publishing";
import PublishingStoreSearch from "@/pages/PublishingStoreSearch";
import PublishingPlatformLogin from "@/pages/PublishingPlatformLogin";
import Products from "@/pages/Products";
import Reviews from "@/pages/Reviews";
import MaterialReviewsPanel from "@/pages/reviewCenter/MaterialReviewsPanel";
import ProductReviewsPanel from "@/pages/reviewCenter/ProductReviewsPanel";
import Rules from "@/pages/Rules";
import SpecialOffers from "@/pages/SpecialOffers";
import Studio from "@/pages/Studio";
import StudioDrafts from "@/pages/StudioDrafts";
import StudioImages from "@/pages/StudioImages";
import Support from "@/pages/Support";
import VideoAvatarAds from "@/pages/VideoAvatarAds";
import VideoDrafts from "@/pages/VideoDrafts";
import VideoProductBuild from "@/pages/VideoProductBuild";
import { useEffect } from "react";
import { useAppStore } from "@/store/appStore";
import { useAuthStore } from "@/store/authStore";
import { useModelConfigStore } from "@/store/modelConfigStore";

export default function App() {
  const seedIfEmpty = useAppStore((s) => s.seedIfEmpty);
  const user = useAuthStore((s) => s.user);
  const bindModelConfigOwner = useModelConfigStore((s) => s.bindOwner);
  useEffect(() => {
    seedIfEmpty();
  }, [seedIfEmpty]);
  useEffect(() => {
    bindModelConfigOwner(user?.id);
  }, [bindModelConfigOwner, user?.id]);
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/user-agreement" element={<UserAgreement />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route index element={<RequirePageAccess pageKey="dashboard"><Dashboard /></RequirePageAccess>} />
            <Route path="studio" element={<Navigate to="/studio/drafts" replace />} />
            <Route path="studio/drafts" element={<RequirePageAccess pageKey="studio"><StudioDrafts /></RequirePageAccess>} />
            <Route path="studio/social" element={<RequirePageAccess pageKey="studio"><Studio /></RequirePageAccess>} />
            <Route path="studio/product-images" element={<RequirePageAccess pageKey="studio"><StudioImages /></RequirePageAccess>} />
            <Route path="studio/images" element={<Navigate to="/studio/product-images" replace />} />
            <Route path="publishing" element={<RequirePageAccess pageKey="publishing"><Publishing /></RequirePageAccess>} />
            <Route path="publishing/store-search" element={<RequirePageAccess pageKey="publishing"><PublishingStoreSearch /></RequirePageAccess>} />
            <Route path="publishing/platform-login" element={<RequirePageAccess pageKey="publishing"><PublishingPlatformLogin /></RequirePageAccess>} />
            <Route path="products" element={<RequirePageAccess pageKey="products"><Products /></RequirePageAccess>} />
            <Route path="products/special-offers" element={<RequirePageAccess pageKey="products"><SpecialOffers /></RequirePageAccess>} />
            <Route path="assets" element={<RequirePageAccess pageKey="assets"><Assets /></RequirePageAccess>} />
            <Route
              path="customer-management"
              element={
                <RequirePageAccess pageKey="customerManagement">
                  <CustomerManagement />
                </RequirePageAccess>
              }
            />
            <Route path="videos" element={<Navigate to="/videos/drafts" replace />} />
            <Route path="videos/drafts" element={<RequirePageAccess pageKey="videos"><VideoDrafts /></RequirePageAccess>} />
            <Route path="videos/avatar-ads" element={<RequirePageAccess pageKey="videos"><VideoAvatarAds /></RequirePageAccess>} />
            <Route path="videos/product-build" element={<RequirePageAccess pageKey="videos"><VideoProductBuild /></RequirePageAccess>} />
            <Route path="support" element={<RequirePageAccess pageKey="support"><Support /></RequirePageAccess>} />
            <Route path="personalization" element={<Navigate to="/personalization/layout" replace />} />
            <Route path="personalization/layout" element={<RequirePageAccess pageKey="personalization"><Personalization /></RequirePageAccess>} />
            <Route path="personalization/metrics" element={<RequirePageAccess pageKey="personalization"><Personalization /></RequirePageAccess>} />
            <Route path="personalization/industry" element={<RequirePageAccess pageKey="personalization"><Personalization /></RequirePageAccess>} />
            <Route path="special-offers" element={<Navigate to="/products" replace />} />
            <Route path="agents" element={<Navigate to="/" replace />} />
            <Route path="agents/:id" element={<Navigate to="/" replace />} />
            <Route path="rules" element={<RequirePageAccess pageKey="rules"><Rules /></RequirePageAccess>} />
            <Route path="reviews" element={<RequirePageAccess pageKey="reviews"><Reviews /></RequirePageAccess>}>
              <Route index element={<Navigate to="/reviews/materials" replace />} />
              <Route path="materials" element={<MaterialReviewsPanel />} />
              <Route path="products" element={<ProductReviewsPanel />} />
            </Route>
            <Route path="keyword-rules" element={<Navigate to="/rules" replace />} />
            <Route path="keyword-reviews" element={<Navigate to="/reviews" replace />} />
            <Route path="rbac" element={<Navigate to="/rbac/users" replace />} />
            <Route path="rbac/users" element={<RequirePageAccess pageKey="rbac"><Rbac /></RequirePageAccess>} />
            <Route path="rbac/roles" element={<RequirePageAccess pageKey="rbac"><Rbac /></RequirePageAccess>} />
            <Route path="rbac/permissions" element={<RequirePageAccess pageKey="rbac"><Rbac /></RequirePageAccess>} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
