'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Web3Provider } from '@/components/web3-provider';
import { AppSidebar } from '@/components/app-sidebar';
import { Spinner } from '@/components/ui';
import { OnboardingWizard } from '@/components/onboarding';
import { EmailVerificationModal } from '@/components/email-verification-modal';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Separator } from '@/components/ui/separator';
import * as api from '@/lib/api';
import { AlertTriangle } from 'lucide-react';

function DashboardShell({
  children,
  suspension,
}: {
  children: React.ReactNode;
  suspension?: { isSuspended: boolean; reason?: string | null };
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        {/* Top bar with sidebar trigger + breadcrumb area */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-6">
          <SidebarTrigger className="-ml-2" />
          <Separator orientation="vertical" className="mr-2 !h-4" />
          <span className="text-sm font-medium text-muted-foreground">Dashboard</span>
        </header>
        {/* Main content */}
        <main className="flex-1 p-6 lg:p-8">
          {suspension?.isSuspended && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold">Your organization has been suspended.</p>
                  <p className="mt-1">
                    {suspension.reason?.trim()
                      ? `Reason: ${suspension.reason}. `
                      : ''}
                    Please reach out to help@noderails.com.
                  </p>
                </div>
              </div>
            </div>
          )}
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function DashboardGuard({ children }: { children: React.ReactNode }) {
  const { merchant, teamMember, token, loading, isTeamMember } = useAuth();
  const router = useRouter();
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);
  const [createdAppId, setCreatedAppId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !merchant && !teamMember) {
      router.push('/login');
    }
  }, [loading, merchant, teamMember, router]);

  // Determine if onboarding is needed: no orgName OR no apps (skip for team members)
  useEffect(() => {
    if (isTeamMember) {
      setNeedsOnboarding(false);
      return;
    }
    if (!merchant || !token) return;
    if (merchant.isSuspended) {
      setNeedsOnboarding(false);
      return;
    }
    if (!merchant.orgName) {
      setNeedsOnboarding(true);
      return;
    }
    api.getApps(token).then((apps) => {
      const list = Array.isArray(apps) ? apps : [];
      setNeedsOnboarding(list.length === 0);
    }).catch(() => {
      setNeedsOnboarding(false);
    });
  }, [merchant, token, isTeamMember]);

  if (loading || needsOnboarding === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!merchant && !teamMember) return null;

  // ── Email verification gate — blocks all access (merchants only) ──
  if (merchant && !merchant.emailVerified) {
    return (
      <TooltipProvider>
        <DashboardShell suspension={{ isSuspended: merchant.isSuspended, reason: merchant.suspendedReason }}>
          <EmailVerificationModal />
          {children}
        </DashboardShell>
      </TooltipProvider>
    );
  }

  return (
    <>
      {needsOnboarding && (
        <OnboardingWizard onComplete={(appId) => {
          setCreatedAppId(appId);
          setNeedsOnboarding(false);
          setTimeout(() => router.push(`/dashboard/apps/${appId}`), 100);
        }} />
      )}
      <TooltipProvider>
        <DashboardShell suspension={merchant ? { isSuspended: merchant.isSuspended, reason: merchant.suspendedReason } : undefined}>
          {children}
        </DashboardShell>
      </TooltipProvider>
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Web3Provider>
        <DashboardGuard>{children}</DashboardGuard>
      </Web3Provider>
    </AuthProvider>
  );
}
