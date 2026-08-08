import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Wallet, CheckCircle } from "lucide-react";
import { useCurrentClient, useCurrentAccount } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { Button } from "../ui/button";
import { TxStatusToast, TxStatus } from "../TxStatusToast";
import { parseMoveError } from "../../lib/errors";
import { APP_COIN_DECIMALS, parsePUSDToMist } from "../../lib/format";
import { useNavigate } from "react-router-dom";
import { useMintPusd } from "../../hooks/useMintPusd";
import { useSponsoredTransaction } from "../../hooks/useSponsoredTransaction";
import { useQueryClient } from "@tanstack/react-query";
import { 
  COIN_TYPE_REGISTRY_ID,
  CLOCK_OBJECT_ID,
  PUSD_TYPE_ARG,
} from "@paystreamer/sdk";
import {  queryCoins  } from "@paystreamer/sdk/core";
import { useAppConfig } from "../../hooks/useAppConfig";

interface SetupSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  platformId: string;
  tierIndex: number;
  tierAmount: bigint;
  tierFrequencyMs: bigint;
  accountId?: string;
  accountCapId?: string;
  currentBalance?: bigint;
  walletBalanceUsd?: number;
  onSuccess: (txDigest: string) => void;
}

export function SetupSubscriptionModal({
  isOpen,
  onClose,
  platformId,
  tierIndex,
  tierAmount,
  tierFrequencyMs,
  accountId,
  accountCapId,
  currentBalance = 0n,
  walletBalanceUsd = 0,
  onSuccess,
}: SetupSubscriptionModalProps) {
    const config = useAppConfig();
  const client = useCurrentClient();
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { mintPusd } = useMintPusd();
  const { executeSponsored } = useSponsoredTransaction();
  
  const hasAccount = !!accountId && !!accountCapId;
  const THREE_MONTHS_MS = 90n * 24n * 60n * 60n * 1000n;
  let cyclesBuffer = THREE_MONTHS_MS / tierFrequencyMs;
  if (cyclesBuffer < 3n) cyclesBuffer = 3n;
  if (cyclesBuffer > 10n) cyclesBuffer = 10n;
  
  let recommendedBuffer = tierAmount * cyclesBuffer;
  const maxBuffer = parsePUSDToMist("100");
  if (recommendedBuffer > maxBuffer) {
    recommendedBuffer = maxBuffer;
  }
  if (recommendedBuffer < tierAmount) {
    recommendedBuffer = tierAmount;
  }
  const shortfall = currentBalance < recommendedBuffer ? recommendedBuffer - currentBalance : 0n;
  const absoluteMinRequired = currentBalance < tierAmount ? tierAmount - currentBalance : 0n;
  
  const pusdScale = Math.pow(10, APP_COIN_DECIMALS);
  const minDepositUsd = Number(absoluteMinRequired) / pusdScale;
  const defaultDepositUsd = Number(shortfall) / pusdScale;
  const currentBalanceUsd = Number(currentBalance) / pusdScale;
  const tierAmountUsd = Number(tierAmount) / pusdScale;

  const [depositAmount, setDepositAmount] = useState(defaultDepositUsd.toString());
  const [step, setStep] = useState<"input" | "success">("input");
  
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txMessage, setTxMessage] = useState("");
  const [txDigest, setTxDigest] = useState<string | undefined>();

  useEffect(() => {
    if (isOpen) {
      setStep("input");
      setDepositAmount(defaultDepositUsd.toString());
      setTxStatus("idle");
      setTxDigest(undefined);
    }
  }, [isOpen, platformId, tierIndex]);

  if (!isOpen) return null;

  const isValidSuiAddress = (addr: string): boolean => {
    return /^0x[0-9a-fA-F]{64}$/.test(addr);
  };

  const handleSubscribe = async () => {
    if (hasAccount && accountId && !isValidSuiAddress(accountId)) {
      setTxStatus("error");
      setTxMessage("Invalid account reference. Please refresh and try again.");
      return;
    }

    setTxStatus("pending");
    setTxMessage(hasAccount ? "Subscribing..." : "Setting up account and subscribing...");

    try {
      const depositParsed = parseFloat(depositAmount || "0");
      const depositMist = depositParsed > 0 ? parsePUSDToMist(depositAmount || "0") : 0n;
      let coinsToUse: string[] = [];

      if (depositMist > 0n) {
        if (!account) throw new Error("Wallet not connected");
        const availableCoins = await queryCoins(account.address, PUSD_TYPE_ARG);
        let total = 0n;
        for (const coin of availableCoins) {
          total += BigInt(coin.balance);
          coinsToUse.push(coin.id);
          if (total >= depositMist) break;
        }
        if (total < depositMist) {
          throw new Error("Insufficient PUSD balance for deposit.");
        }
      }

      const tx = new Transaction();
      tx.setGasBudget(100_000_000);

      let workingAccountObj: any;
      let workingCap: any;

      if (!hasAccount) {
        const [newAccountObj, newCap] = tx.moveCall({
          target: `${config.PACKAGE_ID}::account::create_account`,
          typeArguments: [PUSD_TYPE_ARG],
          arguments: [
            tx.object(COIN_TYPE_REGISTRY_ID),
            tx.object(CLOCK_OBJECT_ID),
          ],
        });
        workingAccountObj = newAccountObj;
        workingCap = newCap;
      } else {
        workingAccountObj = tx.object(accountId!);
        workingCap = tx.object(accountCapId!);
      }

      if (depositMist > 0n && coinsToUse.length > 0) {
        const coinObjs = coinsToUse.map(id => tx.object(id));
        if (coinObjs.length > 1) {
           tx.mergeCoins(coinObjs[0], coinObjs.slice(1));
        }
        const [splitCoin] = tx.splitCoins(coinObjs[0], [tx.pure.u64(depositMist)]);
        
        tx.moveCall({
          target: `${config.PACKAGE_ID}::account::deposit`,
          typeArguments: [PUSD_TYPE_ARG],
          arguments: [workingCap, workingAccountObj, splitCoin, tx.object(CLOCK_OBJECT_ID)],
        });
      }

      tx.moveCall({
        target: `${config.PACKAGE_ID}::billing::create_subscription`,
        typeArguments: [PUSD_TYPE_ARG],
        arguments: [
          workingCap,
          workingAccountObj,
          tx.pure.id(platformId),
          tx.pure.u64(BigInt(tierIndex)),
          tx.pure.u64(tierAmount),
          tx.pure.u64(tierFrequencyMs),
          tx.object(CLOCK_OBJECT_ID),
        ],
      });

      if (!hasAccount) {
        tx.moveCall({
          target: `${config.PACKAGE_ID}::account::share_account`,
          typeArguments: [PUSD_TYPE_ARG],
          arguments: [workingAccountObj, workingCap],
        });
      }

      const result = await executeSponsored(tx);
      if (result.error) throw new Error(result.error);
      const txDigest = result.digest!;

      await client.waitForTransaction({ digest: txDigest });
      
      setTxDigest(txDigest);
      setTxStatus("success");
      setTxMessage("Subscription active!");
      
      onSuccess(txDigest);
      setStep("success");
    } catch (err) {
      console.error("Subscription Error:", err);
      setTxStatus("error");
      setTxMessage(parseMoveError(err));
    }
  };

  const handleMintPusd = async () => {
    setTxStatus("pending");
    setTxMessage("Minting Test PUSD...");
    try {
      const result = await mintPusd();
      if (result.error || !result.digest) throw new Error(result.error || "Transaction failed");
      const txDigest = result.digest;
      
      await client.waitForTransaction({ digest: txDigest });
      
      setTimeout(async () => {
        await queryClient.invalidateQueries({ queryKey: ["sui-client", "getCoins"] });
        await queryClient.invalidateQueries({ queryKey: ["sui-client", "getAllBalances"] });
        setTxStatus("success");
        setTxMessage("Successfully minted 1,000 PUSD!");
        setTxDigest(txDigest);
      }, 1000);
    } catch (err) {
      console.error("Mint Error:", err);
      setTxStatus("error");
      setTxMessage(parseMoveError(err));
    }
  };

  const isPending = txStatus === "pending";
  const requiredDeposit = Math.max(minDepositUsd, parseFloat(depositAmount || "0"));
  const hasInsufficientWalletBalance = walletBalanceUsd < requiredDeposit;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={!isPending ? onClose : undefined}
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
              {step === "success" ? "Success!" : (hasAccount ? "Fill Up & Subscribe" : "Setup Subscription")}
            </h2>
            <button
              onClick={onClose}
              disabled={isPending}
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
                  {hasAccount && (
                    <div className="flex justify-between items-center text-sm border-t pt-2 mt-2">
                      <span className="text-muted-foreground">Current Balance</span>
                      <span className="font-semibold text-primary">{currentBalanceUsd.toFixed(2)} PUSD</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center text-sm border-t pt-2 mt-2">
                    <span className="text-muted-foreground">Wallet Balance</span>
                    <span className="font-semibold">{walletBalanceUsd.toFixed(2)} PUSD</span>
                  </div>
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
                      disabled={isPending}
                      className="w-full pl-10 pr-4 py-2 bg-background border rounded-lg focus:ring-2 focus:ring-primary/50 transition-shadow disabled:opacity-50"
                      placeholder="Enter amount..."
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {minDepositUsd > 0 
                      ? `Minimum required: ${minDepositUsd.toFixed(2)} PUSD to cover the first cycle.`
                      : "Your existing balance covers the first cycle."}
                    {" "}We recommend keeping a buffer to avoid interruptions.
                  </p>
                </div>

                {hasInsufficientWalletBalance && (
                  <div className="p-4 bg-red-50/50 border border-red-200 dark:bg-red-950/20 dark:border-red-900/50 rounded-lg space-y-3">
                    <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                      Insufficient PUSD in your wallet to fund this deposit.
                    </p>
                    <Button 
                      onClick={handleMintPusd} 
                      disabled={isPending}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-medium"
                    >
                      Mint 1,000 Test PUSD
                    </Button>
                  </div>
                )}

                <Button
                  onClick={handleSubscribe}
                  disabled={isPending || hasInsufficientWalletBalance}
                  loading={isPending}
                  variant="gradient"
                  className="w-full py-6 text-lg disabled:opacity-40 disabled:cursor-not-allowed disabled:grayscale"
                >
                  {hasAccount 
                    ? (parseFloat(depositAmount || "0") > 0 ? "Fill Up & Subscribe" : "Subscribe Now") 
                    : "Complete Setup & Subscribe"}
                </Button>
              </>
            ) : (
              <div className="text-center space-y-6 py-4">
                <div className="flex justify-center">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", bounce: 0.5 }}
                  >
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
                  <Button
                    onClick={() => {
                      onClose();
                      navigate("/dashboard");
                    }}
                    variant="gradient"
                    className="w-full py-6"
                  >
                    Manage Subscriptions
                  </Button>
                  <Button
                    onClick={() => {
                      onClose();
                      navigate("/");
                    }}
                    variant="outline"
                    className="w-full py-6"
                  >
                    Browse More Platforms
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        <TxStatusToast
          status={txStatus}
          message={txMessage}
          digest={txDigest}
          onClose={() => setTxStatus("idle")}
        />
      </div>
    </AnimatePresence>
  );
}
