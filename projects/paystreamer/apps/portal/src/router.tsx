import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AccountsPage } from "./pages/dashboard/AccountsPage";
import { SubscriptionsPage } from "./pages/dashboard/SubscriptionsPage";
import { ActivityPage } from "./pages/dashboard/ActivityPage";
import { SettingsPage } from "./pages/dashboard/SettingsPage";
import { PlatformOverviewPage } from "./pages/platforms/PlatformOverviewPage";
import { TiersPage } from "./pages/platforms/TiersPage";
import { SubscribersPage } from "./pages/platforms/SubscribersPage";
import { TreasuryPage } from "./pages/platforms/TreasuryPage";
import { PlatformSettingsPage } from "./pages/platforms/PlatformSettingsPage";
import { SchedulerPage } from "./pages/platforms/SchedulerPage";
import CheckoutPage from "./pages/checkout/CheckoutPage";

import { DashboardLayout } from "./components/dashboard/DashboardLayout";
import { PlatformPortalLayout } from "./components/platform/PlatformPortalLayout";

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Navigate to="/dashboard/subscriptions" replace />} />
          <Route path="/dashboard/accounts" element={<AccountsPage />} />
          <Route path="/dashboard/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/dashboard/activity" element={<ActivityPage />} />
          <Route path="/dashboard/settings" element={<SettingsPage />} />
        </Route>
        <Route element={<PlatformPortalLayout />}>
          <Route path="/platforms" element={<Navigate to="/platforms/overview" replace />} />
          <Route path="/platforms/overview" element={<PlatformOverviewPage />} />
          <Route path="/platforms/tiers" element={<TiersPage />} />
          <Route path="/platforms/subscribers" element={<SubscribersPage />} />
          <Route path="/platforms/treasury" element={<TreasuryPage />} />
          <Route path="/platforms/settings" element={<PlatformSettingsPage />} />
          <Route path="/platforms/scheduler" element={<SchedulerPage />} />
        </Route>
        <Route path="/checkout/:platformId" element={<CheckoutPage />} />

        {/* Catch-all route for 404s */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
