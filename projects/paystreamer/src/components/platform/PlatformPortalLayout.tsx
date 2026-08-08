import { useState, useRef } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { useCurrentAccount, useWalletConnection } from "@mysten/dapp-kit-react";
import { ConnectModal } from "@mysten/dapp-kit-react/ui";
import { Menu, X, LayoutDashboard, Layers, Users, Wallet, Settings, Loader2, ExternalLink } from "lucide-react";
import { cn } from "../../lib/utils";

import { useOwnedPlatforms, PlatformObject } from "../../lib/platformDiscovery";
import { Tabs, TabsList, TabsTrigger } from "../ui/tabs";
import { Button } from "../ui/button";

const NAV_ITEMS = [
  { path: "/platforms", label: "Overview", icon: LayoutDashboard },
  { path: "/platforms/tiers", label: "Tiers", icon: Layers },
  { path: "/platforms/subscribers", label: "Subscribers", icon: Users },
  { path: "/platforms/treasury", label: "Treasury", icon: Wallet },
  { path: "/platforms/settings", label: "Settings", icon: Settings },
];

export function PlatformPortalLayout() {
  const account = useCurrentAccount();
  const { isConnecting } = useWalletConnection();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformObject | null>(null);
  const modalRef = useRef<React.ElementRef<typeof ConnectModal>>(null);

  const { data: platforms } = useOwnedPlatforms(account?.address ?? null);

  if (isConnecting) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-text-secondary" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="min-h-screen bg-bg-primary">

        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center flex flex-col items-center">
            <h2 className="text-2xl font-bold text-white mb-4">Platform Portal Access</h2>
            <p className="text-text-secondary mb-6">Please connect your wallet to access the platform portal.</p>
            <div className="flex gap-4">
              <Button onClick={() => navigate("/")} variant="outline" className="text-white border-white/20 hover:bg-white/10">
                Go to Home
              </Button>
              <Button
                onClick={() => modalRef.current?.show()}
                className="text-sm px-6 py-2"
                variant="gradient"
              >
                Connect Wallet
              </Button>
            </div>
            <ConnectModal ref={modalRef} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-primary">


      <div className="flex">
        <aside className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-card border-r transform transition-transform lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="flex items-center justify-between p-4 border-b">
            <Link to="/" className="flex items-center gap-3">
              <img src="/logo.png" alt="PayStreamer Logo" className="w-8 h-8 object-contain drop-shadow-[0_0_6px_rgba(108,99,255,0.5)]" />
              <span className="font-bold">PayStreamer</span>
            </Link>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden">
              <X className="h-5 w-5" />
            </button>
          </div>

          {platforms && platforms.length > 1 && (
            <div className="p-4 border-b">
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedPlatform?.objectId || ""}
                onChange={(e) => {
                  const platform = platforms.find(p => p.objectId === e.target.value);
                  setSelectedPlatform(platform || null);
                }}
              >
                <option value="">Select Platform</option>
                {platforms.map((p) => (
                  <option key={p.objectId} value={p.objectId}>
                    {p.json.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <nav className="p-4 space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path ||
                (item.path !== "/platforms" && location.pathname.startsWith(item.path));

              return (
                <button
                  key={item.path}
                  onClick={() => {
                    navigate(item.path);
                    setSidebarOpen(false);
                  }}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10 space-y-4">
            <Button
              variant="outline"
              className="w-full flex items-center justify-start gap-2 bg-transparent text-white border-white/20 hover:bg-white/10 hover:text-white"
              onClick={() => navigate("/dashboard")}
            >
              <ExternalLink size={16} />
              Subscription Dashboard
            </Button>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs text-muted-foreground font-mono">
                {account.address.slice(0, 6)}...{account.address.slice(-4)}
              </span>
            </div>
          </div>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 lg:ml-64">
          <div className="sticky top-0 z-30 bg-bg-primary/80 backdrop-blur border-b px-4 py-3 flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-md hover:bg-muted"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex-1">
              {platforms && platforms.length > 1 && (
                <Tabs
                  value={selectedPlatform?.objectId || platforms[0]?.objectId}
                  onValueChange={(id) => {
                    const platform = platforms.find(p => p.objectId === id);
                    setSelectedPlatform(platform || null);
                  }}
                  className="hidden md:block"
                >
                  <TabsList className="bg-white/5 border border-white/10">
                    {platforms.map((p) => (
                      <TabsTrigger
                        key={p.objectId}
                        value={p.objectId}
                        className="data-[state=active]:bg-white/10 data-[state=active]:text-white"
                      >
                        {p.json.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              )}
            </div>
          </div>

          <div className="p-4 md:p-6">
            <Outlet context={{ platform: selectedPlatform || platforms?.[0] }} />
          </div>
        </main>
      </div>
    </div>
  );
}