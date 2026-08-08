import { useState, useRef } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { useCurrentAccount, useWalletConnection } from "@mysten/dapp-kit-react";
import { ConnectModal } from "@mysten/dapp-kit-react/ui";
import { Button } from "../ui/button";

import { Menu, Wallet, CreditCard, Bell, Settings, Loader2, ExternalLink } from "lucide-react";

const NAV_ITEMS = [
  { path: "/dashboard/accounts", label: "Accounts", icon: Wallet },
  { path: "/dashboard/subscriptions", label: "Subscriptions", icon: CreditCard },
  { path: "/dashboard/activity", label: "Activity", icon: Bell },
  { path: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function DashboardLayout() {
  const account = useCurrentAccount();
  const { isConnecting } = useWalletConnection();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const modalRef = useRef<React.ElementRef<typeof ConnectModal>>(null);

  if (isConnecting) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="min-h-screen bg-background">

        <div className="flex items-center justify-center h-[calc(100vh-200px)]">
          <div className="text-center flex flex-col items-center">
            <h2 className="text-2xl font-bold mb-4">Dashboard Access</h2>
            <p className="text-muted-foreground mb-6">Please connect your wallet to access the dashboard.</p>
            <p className="text-sm text-muted-foreground mb-6 -mt-3">
              All transaction fees are sponsored. No SUI required!
            </p>
            <div className="flex gap-4">
              <Button onClick={() => navigate("/")} variant="outline">
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
    <div className="min-h-screen bg-background">


      <div className="flex">
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 bg-card border-r transform transition-transform duration-200 ease-in-out ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } md:translate-x-0`}
        >
          <div className="p-4 border-b">
            <Link to="/" className="flex items-center gap-3">
              <img src="/logo.png" alt="PayStreamer Logo" className="w-8 h-8 object-contain drop-shadow-[0_0_6px_rgba(108,99,255,0.5)]" />
              <span className="font-bold">PayStreamer</span>
            </Link>
          </div>

          <nav className="p-4 space-y-1">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
              const isActive = location.pathname === path;
              return (
                <Link
                  key={path}
                  to={path}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="absolute bottom-0 left-0 right-0 p-4 border-t space-y-4">
            <Button
              variant="outline"
              className="w-full flex items-center justify-start gap-2"
              onClick={() => navigate("/platforms")}
            >
              <ExternalLink size={16} />
              Platform Portal
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
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 md:ml-64">
          <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b px-4 py-3 md:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>

          <div className="container mx-auto px-4 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
