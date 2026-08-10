import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentAccount } from "@mysten/dapp-kit-react";

import { ConnectModal } from "@mysten/dapp-kit-react/ui";
import { useRef } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@paystreamer/sdk";
import { Button } from "@paystreamer/sdk";
import { Badge } from "@paystreamer/sdk";
import NavBar from "../components/NavBar";

import { SetupSubscriptionModal } from "../components/subscriptions/SetupSubscriptionModal";
import {  queryAccountCreatedEvents, queryAccount, queryCoins, queryPlatform  } from "@paystreamer/sdk/core";
import {  DEMO_PLATFORM_ID, PUSD_TYPE_ARG  } from "@paystreamer/sdk";
import { formatMistToPUSD, APP_COIN_DECIMALS, formatFrequency, getFrequencyMs } from "../lib/format";
import { useAppConfig } from "../hooks/useAppConfig";

export default function SubscribePage() {
    const config = useAppConfig();
  const { platformId } = useParams<{ platformId: string }>();
  const account = useCurrentAccount();
  const modalRef = useRef<any>(null);
  const queryClient = useQueryClient();
  const [subscriptionSuccess, setSubscriptionSuccess] = useState(false);
  const [nextBillingDate, setNextBillingDate] = useState<string | null>(null);

  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [selectedTierParams, setSelectedTierParams] = useState<{
    index: number;
    amount: bigint;
    frequencyMs: bigint;
  } | null>(null);

  const { data: platform, isPending: platformLoading } = useQuery({
    queryKey: ["platform", platformId, config.network],
    queryFn: async () => {
      if (!platformId) return null;
      return await queryPlatform(platformId, config.network as any);
    },
    enabled: !!platformId && platformId.length >= 66,
  });

  const { data: accountCreatedEvents } = useQuery({
    queryKey: ["account-created-events", account?.address, config.network],
    queryFn: async () => {
      if (!account?.address) return [];
      return await queryAccountCreatedEvents(account.address, config.network);
    },
    enabled: !!account,
  });

  const uniqueAccounts = (accountCreatedEvents || [])
    .filter((acc, idx, arr) => arr.findIndex((a) => a.account_id === acc.account_id) === idx)
    .map((e) => ({
      accountId: e.account_id,
      capId: e.cap_id,
      denomination: (e as any).denomination || PUSD_TYPE_ARG,
    }));

  const accountId = uniqueAccounts[0]?.accountId;
  const accountCapId = uniqueAccounts[0]?.capId;

  const platformJson = platform as any;
  const tiersJson = platformJson?.tiers as any;
  const tiersList = Array.isArray(tiersJson) 
    ? tiersJson 
    : (Array.isArray(tiersJson?.contents) 
        ? tiersJson.contents 
        : []);
  const mappedTiers = tiersList.map((t: any) => t.value || t);
  const activeTiers = mappedTiers.filter((t: any) => t.is_active !== false);

  const { data: accountObj } = useQuery({
    queryKey: ["subscription-account-details", accountId, config.network],
    queryFn: async () => {
      if (!accountId) return null;
      return await queryAccount(accountId, config.network as any);
    },
    enabled: !!accountId,
  });

  const accountJson = accountObj as any;
  const accountSubscriptions = Array.isArray(accountJson?.subscriptions) 
    ? accountJson.subscriptions 
    : (Array.isArray(accountJson?.subscriptions?.contents) ? accountJson.subscriptions.contents : []);

  const isSubscribed = accountSubscriptions.some((s: any) => {
    const key = s.key || s.platform_id || (s.value && s.value.platform_id);
    return key === platformId;
  });

  const { data: pusdCoins } = useQuery({
    queryKey: ["getCoins", account?.address, PUSD_TYPE_ARG, config.network],
    queryFn: async () => {
      return await queryCoins(account?.address as string, PUSD_TYPE_ARG);
    },
    enabled: !!account,
  });

  const walletBalance = pusdCoins?.reduce((sum: bigint, coin: any) => sum + BigInt(coin.balance), 0n) || 0n;
  const walletBalanceUsd = Number(walletBalance) / Math.pow(10, APP_COIN_DECIMALS);

  const handleSubscribeClick = (tierIndex: number, tierAmount: bigint, tierFrequency: bigint) => {
    if (!account) {
      modalRef.current?.show();
      return;
    }

    if (isSubscribed) {
      return;
    }

    setSelectedTierParams({
      index: tierIndex,
      amount: tierAmount,
      frequencyMs: tierFrequency,
    });
    setIsSetupModalOpen(true);
  };



  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="noise" />

      <NavBar />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-12">
        {platformLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-[#6c63ff]" />
          </div>
        ) : !platform || !platformJson ? (
          <div className="text-center py-20">
            <h2 className="text-2xl font-bold text-white mb-4">Platform Not Found</h2>
            <p className="text-[#94a3b8]">This platform does not exist or has been removed.</p>
          </div>
        ) : (
          <>
            <div className="text-center mb-12">
              <div className="flex items-center justify-center gap-3 mb-4">
                {platformJson.is_verified && (
                  <Badge variant="default" className="bg-[#10b981]/20 text-[#10b981] border-[#10b981]/30">
                    Verified
                  </Badge>
                )}
                {platformId && platformId === DEMO_PLATFORM_ID && (
                  <Badge className="bg-[#6c63ff]/20 text-[#a78bfa] border-[#6c63ff]/30">
                    Featured Demo
                  </Badge>
                )}
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
                {platformJson.name ?? "Unnamed Platform"}
              </h1>
              {platformJson.description && (
                <p className="text-lg text-[#94a3b8] max-w-2xl mx-auto mb-4">
                  {platformJson.description}
                </p>
              )}
              {platformJson.category && (
                <p className="text-sm text-[#94a3b8]">{platformJson.category}</p>
              )}
            </div>

            {!subscriptionSuccess && activeTiers.length > 0 && (
              <div className="mb-8">
                <p className="text-sm text-[#94a3b8] mb-4 text-center">How subscription works:</p>
                <div className="flex items-center justify-center gap-2 text-sm">
                  <div className={`flex items-center gap-2 ${account ? "text-[#10b981]" : "text-white"}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${account ? "bg-[#10b981]" : "bg-[#6c63ff]"}`}>
                      {account ? <CheckCircle className="w-4 h-4 text-white" /> : "1"}
                    </div>
                    <span>Connect Wallet</span>
                  </div>
                  <div className="w-8 h-px bg-white/20" />
                  <div className="flex items-center gap-2 text-white">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs bg-[#6c63ff]">2</div>
                    <span>Subscribe</span>
                  </div>
                </div>
              </div>
            )}

            {subscriptionSuccess ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="max-w-md mx-auto"
              >
                <Card className="border-[#10b981]/30 bg-[#10b981]/5">
                  <CardContent className="pt-6 text-center">
                    <CheckCircle className="h-16 w-16 text-[#10b981] mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-white mb-2">You're subscribed!</h2>
                    {nextBillingDate && (
                      <p className="text-[#94a3b8] mb-6">Next billing: {nextBillingDate}</p>
                    )}
                    <div className="flex flex-col gap-3">
                      <Button onClick={() => window.location.href = "/"} className="w-full">
                        Back to Home
                      </Button>
                      <Button variant="secondary" onClick={() => window.location.href = "/dashboard"} className="w-full">
                        Go to Dashboard
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : activeTiers.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-[#94a3b8]">This platform has no active subscription tiers yet.</p>
                </CardContent>
              </Card>
            ) : (
              <div>
                {activeTiers.length > 1 && (
                  <div className="mb-8 overflow-x-auto">
                    <h3 className="text-lg font-semibold text-white mb-4 text-center">Compare Plans</h3>
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-3 px-4 text-[#94a3b8] font-medium text-sm">Feature</th>
                          {activeTiers.map((tier: any, index: number) => (
                            <th key={index} className="text-center py-3 px-4 text-white font-semibold text-sm">
                              {tier.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-white/10">
                          <td className="py-3 px-4 text-[#94a3b8] text-sm">Price</td>
                          {activeTiers.map((tier: any, index: number) => (
                            <td key={index} className="py-3 px-4 text-center text-white font-medium">
                              {formatMistToPUSD(tier.amount)}/{formatFrequency(tier)}
                            </td>
                          ))}
                        </tr>
                        <tr className="border-b border-white/10">
                          <td className="py-3 px-4 text-[#94a3b8] text-sm">Billing</td>
                          {activeTiers.map((tier: any, index: number) => (
                            <td key={index} className="py-3 px-4 text-center text-white text-sm capitalize">
                              {formatFrequency(tier)}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td className="py-3 px-4 text-[#94a3b8] text-sm">Automatic renewals</td>
                          {activeTiers.map((_: any, index: number) => (
                            <td key={index} className="py-3 px-4 text-center">
                              <CheckCircle className="h-5 w-5 text-[#10b981] mx-auto" />
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                <div className={`grid gap-6 ${activeTiers.length === 1 ? "max-w-md mx-auto" : "md:grid-cols-2 lg:grid-cols-3"}`}>
                  {activeTiers.map((tier: any, index: number) => {


                    return (
                      <Card key={index} className="relative overflow-hidden">
                        <CardHeader>
                          <CardTitle className="flex items-center justify-between">
                            <span>{tier.name}</span>
                            {isSubscribed && (
                              <Badge variant="secondary" className="text-[#10b981]">Subscribed</Badge>
                            )}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="text-2xl font-bold text-white">
                            {formatMistToPUSD(tier.amount)}
                            <span className="text-sm font-normal text-[#94a3b8]">
                              {" "}/ {formatFrequency(tier)}
                            </span>
                          </div>

                          {isSubscribed ? (
                            <Button onClick={() => window.location.href = "/dashboard"} className="w-full" variant="secondary">
                              Manage Subscription
                            </Button>
                          ) : !account ? (
                            <Button
                              onClick={() => modalRef.current?.show()}
                              className="w-full"
                            >
                              Connect to Subscribe
                            </Button>
                          ) : (
                            <div className="space-y-2">
                              <Button
                                onClick={() => {
                                  const frequencyMs = getFrequencyMs(tier);
                                  handleSubscribeClick(index, BigInt(tier.amount), frequencyMs);
                                }}
                                className="w-full"
                                variant="gradient"
                              >
                                {isSubscribed ? "Current Plan" : "Subscribe"}
                              </Button>
                              <p className="text-xs text-center text-[#94a3b8] mt-2">
                                Cancel anytime. Secure smart contract.
                              </p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-t border-white/10 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="PayStreamer Logo" className="w-8 h-8 object-contain drop-shadow-[0_0_6px_rgba(108,99,255,0.5)]" />
              <span className="text-sm text-[#94a3b8]">PayStreamer on Sui</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-[#94a3b8]">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
              <a href="#" className="hover:text-white transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>

      <ConnectModal ref={modalRef} />

      {selectedTierParams && (
        <SetupSubscriptionModal
          isOpen={isSetupModalOpen}
          onClose={() => {
            setIsSetupModalOpen(false);
            setSelectedTierParams(null);
          }}
          platformId={platformId!}
          tierIndex={selectedTierParams.index}
          tierAmount={selectedTierParams.amount}
          tierFrequencyMs={selectedTierParams.frequencyMs}
          accountId={accountId ?? undefined}
          accountCapId={accountCapId ?? undefined}
          currentBalance={accountJson?.address_balance ? BigInt(accountJson.address_balance) : 0n}
          walletBalanceUsd={walletBalanceUsd}
          onSuccess={() => {
            setIsSetupModalOpen(false);
            setSubscriptionSuccess(true);
            const nextDate = new Date();
            nextDate.setTime(nextDate.getTime() + Number(selectedTierParams.frequencyMs));
            setNextBillingDate(nextDate.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
            queryClient.invalidateQueries({ queryKey: ["platform", platformId] });
            queryClient.invalidateQueries({ queryKey: ["account-created-events", account?.address] });
          }}
        />
      )}

    </div>
  );
}
