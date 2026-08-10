import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthGuard } from "./components/AuthGuard";
import { SettingsProvider } from "./components/SettingsProvider";
import { SetupProvider } from "./components/SetupProvider";
import { ToastHost } from "./components/ToastHost";
import { WalletSessionManager } from "./components/WalletSessionManager";
import { LandingPage } from "./pages/LandingPage";
import { ProjectHubPage } from "./pages/ProjectHubPage";
import { ProjectWorkspacePage } from "./pages/ProjectWorkspacePage";
import { SkillsPage } from "./pages/SkillsPage";
import type { ReactNode } from "react";

function AuthenticatedRoute({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <SettingsProvider>
        <SetupProvider>{children}</SetupProvider>
      </SettingsProvider>
    </AuthGuard>
  );
}

function App() {
  return (
    <BrowserRouter>
      <WalletSessionManager />
      <ToastHost />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/app"
          element={
            <AuthenticatedRoute>
              <ProjectHubPage />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/app/skills"
          element={
            <AuthenticatedRoute>
              <SkillsPage />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/app/projects/:projectId"
          element={
            <AuthenticatedRoute>
              <ProjectWorkspacePage />
            </AuthenticatedRoute>
          }
        />
        <Route
          path="/app/projects/:projectId/:phase"
          element={
            <AuthenticatedRoute>
              <Navigate to=".." replace />
            </AuthenticatedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
