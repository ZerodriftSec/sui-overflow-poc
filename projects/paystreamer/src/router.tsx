import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import { ExplorePage } from "./pages/ExplorePage";
import PricingPage from "./pages/PricingPage";

function PortalRedirect() {
  window.location.href = `http://localhost:5177${window.location.pathname}`;
  return null;
}

function CheckoutRedirect() {
  const { platformId } = useParams<{ platformId: string }>();
  window.location.href = `http://localhost:5178/${platformId}`;
  return null;
}

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        
        <Route path="/dashboard/*" element={<PortalRedirect />} />
        <Route path="/platforms/*" element={<PortalRedirect />} />
        
        <Route path="/subscribe/:platformId" element={<CheckoutRedirect />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/pricing" element={<PricingPage />} />

        {/* Catch-all route for 404s */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
