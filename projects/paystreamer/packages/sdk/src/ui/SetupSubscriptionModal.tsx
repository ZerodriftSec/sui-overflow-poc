// @ts-nocheck
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Wallet, CheckCircle } from "lucide-react";
import { Button } from "./components/button";
import { useSubscribe } from "../react/useSubscribe";

import { usePlatform } from "../react/usePlatform";
import { useUserAccount } from "../react/useUserAccount";
import { usePusdBalance } from "../react/usePusdBalance";
import { PayStreamerTheme, useThemeStyles } from "./ThemeContext";
import { usePayStreamerConfig } from "../react/provider";

export interface SetupSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  platformId: string;
  tierIndex: number;
  onSuccess?: (txDigest: string) => void;
  // Format utility
  formatUsd?: (amount: bigint | number | string) => number;
  theme?: PayStreamerTheme;
}

export function SetupSubscriptionModal({
  isOpen,
  onClose,
  platformId,
  tierIndex,
  onSuccess,
  formatUsd = (amount) => Number(amount) / 1e9,
  theme,
}: SetupSubscriptionModalProps) {
  const styles = useThemeStyles(theme);
  const config = usePayStreamerConfig();
  const { data: platform, isLoading: isPlatformLoading } = usePlatform(platformId);
  const { userAccount, isLoading: isAccountLoading } = useUserAccount();
  const { data: walletBalance, isLoading: isBalanceLoading } = usePusdBalance();

  const tier = platform?.tiers?.[tierIndex];
  const resolvedTierAmount = tier ? BigInt(tier.amount) : 0n;
  const resolvedTierFrequencyMs = tier ? BigInt(tier.frequency) : 0n;
  const currentBalance = userAccount?.balance ?? 0n;
  const walletBalanceVal = walletBalance ?? 0n;
  const walletBalanceUsd = formatUsd(walletBalanceVal);

  const { subscribe, isLoading: isSubscribeLoading, error: subscribeError, recommendedDeposit, hasAccount } = useSubscribe({
    platformId,
    tierIndex,
    tierAmount: resolvedTierAmount,
    tierFrequencyMs: resolvedTierFrequencyMs,
    accountId: userAccount?.accountId,
    accountCapId: userAccount?.accountCapId,
  });

  const shortfall = currentBalance < recommendedDeposit ? recommendedDeposit - currentBalance : 0n;
  const absoluteMinRequired = currentBalance < resolvedTierAmount ? resolvedTierAmount - currentBalance : 0n;

  const minDepositUsd = formatUsd(absoluteMinRequired);
  const defaultDepositUsd = formatUsd(shortfall);
  const currentBalanceUsd = formatUsd(currentBalance);
  const tierAmountUsd = formatUsd(resolvedTierAmount);

  const [depositAmount, setDepositAmount] = useState(defaultDepositUsd.toString());
  const [step, setStep] = useState<"input" | "success">("input");

  const requiredDeposit = Math.max(minDepositUsd, parseFloat(depositAmount || "0"));
  const hasInsufficientWalletBalance = !config.isMockMode && walletBalanceUsd < requiredDeposit;

  useEffect(() => {
    if (isOpen) {
      setStep("input");
      setDepositAmount(defaultDepositUsd.toString());
    }
  }, [isOpen, platformId, tierIndex, defaultDepositUsd]);

  const isLoading = isPlatformLoading || isAccountLoading || isBalanceLoading || isSubscribeLoading;

  if (!isOpen) return null;

  const handleSubscribe = async () => {
    const depositParsed = parseFloat(depositAmount || "0");
    const depositMist = BigInt(Math.round(depositParsed * 1e9));

    const digest = await subscribe(depositMist);
    if (digest) {
      setStep("success");
      if (onSuccess) onSuccess(digest);
    }
  };


  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={styles}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={!isLoading ? onClose : undefined}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-md bg-card border shadow-xl rounded-xl overflow-hidden"
        >
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-xl font-bold">
              {step === "success" ? "Success!" : hasAccount && !config.isMockMode ? "Fill Up & Subscribe" : "Setup Subscription"}
            </h2>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {step === "input" ? (
              <>
                <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Tier Amount</span>
                    <span className="font-semibold">{tierAmountUsd.toFixed(2)} PUSD</span>
                  </div>
                  {hasAccount && !config.isMockMode && (
                    <div className="flex justify-between items-center text-sm border-t pt-2 mt-2">
                      <span className="text-muted-foreground">Current Balance</span>
                      <span className="font-semibold text-primary">{currentBalanceUsd.toFixed(2)} PUSD</span>
                    </div>
                  )}
                  {!config.isMockMode && (
                    <div className="flex justify-between items-center text-sm border-t pt-2 mt-2">
                      <span className="text-muted-foreground">Wallet Balance</span>
                      <span className="font-semibold">{walletBalanceUsd.toFixed(2)} PUSD</span>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    {hasAccount ? "Additional Deposit (PUSD)" : "Initial Deposit (PUSD)"}
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Wallet size={16} className="text-muted-foreground" />
                    </div>
                    <input
                      type="number"
                      min={minDepositUsd}
                      step="0.01"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      disabled={isLoading}
                      className="w-full pl-10 pr-4 py-2 bg-background border rounded-lg focus:ring-2 focus:ring-primary/50 transition-shadow disabled:opacity-50"
                      placeholder="Enter amount..."
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {minDepositUsd > 0
                      ? `Minimum required: ${minDepositUsd.toFixed(2)} PUSD to cover the first cycle.`
                      : "Your existing balance covers the first cycle."}{" "}
                    We recommend keeping a buffer to avoid interruptions.
                  </p>
                </div>

                {hasInsufficientWalletBalance && (
                  <div className="p-4 bg-red-50/50 border border-red-200 dark:bg-red-950/20 dark:border-red-900/50 rounded-lg space-y-3">
                    <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                      Insufficient PUSD in your wallet to fund this deposit.
                    </p>
                  </div>
                )}

                {subscribeError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                    {subscribeError}
                  </div>
                )}

                <Button
                  onClick={handleSubscribe}
                  disabled={isLoading || hasInsufficientWalletBalance}
                  className="w-full py-6 text-lg"
                >
                  {isLoading ? "Processing..." : hasAccount ? "Subscribe" : "Setup & Subscribe"}
                </Button>
              </>
            ) : (
              <div className="text-center space-y-6 py-4">
                <div className="flex justify-center">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", bounce: 0.5 }}>
                    <CheckCircle className="w-20 h-20 text-green-500" />
                  </motion.div>
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold">You're Subscribed!</h3>
                  <p className="text-muted-foreground">
                    Your subscription is active and automated billing has been configured.
                  </p>
                </div>

                <div className="flex flex-col gap-3 pt-4">
                  <Button onClick={onClose} className="w-full py-6">
                    Close
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
