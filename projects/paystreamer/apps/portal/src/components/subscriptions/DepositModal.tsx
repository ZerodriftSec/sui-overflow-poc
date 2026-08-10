import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Wallet } from "lucide-react";
import { useCurrentClient, useCurrentAccount } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { Button } from "@paystreamer/sdk";
import { TxStatusToast, TxStatus } from "../TxStatusToast";
import { parseMoveError } from "../../lib/errors";
import { parsePUSDToMist, APP_COIN_DECIMALS } from "../../lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { 
  CLOCK_OBJECT_ID,
} from "@paystreamer/sdk";
import { queryCoins, buildDepositTx } from "@paystreamer/sdk/core";
import { useSponsoredTransaction } from "@paystreamer/sdk/react";
import { useMintTestPusd } from "@paystreamer/sdk/react";
import { useAppConfig } from "../../hooks/useAppConfig";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  capId: string;
  denomination: string;
  onSuccess?: () => void;
}

export function DepositModal({
  isOpen,
  onClose,
  accountId,
  capId,
  denomination,
  onSuccess,
}: DepositModalProps) {
    const config = useAppConfig();
  const client = useCurrentClient();
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  const { executeSponsored } = useSponsoredTransaction();
  const { mint: mintPusd } = useMintTestPusd();

  const [depositAmount, setDepositAmount] = useState("");
  const [walletBalanceUsd, setWalletBalanceUsd] = useState(0);
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txMessage, setTxMessage] = useState("");
  const [txDigest, setTxDigest] = useState<string | undefined>();

  useEffect(() => {
    if (account && isOpen) {
      queryCoins(account.address, denomination).then(coins => {
        const total = coins.reduce((acc, coin) => acc + BigInt(coin.balance), 0n);
        setWalletBalanceUsd(Number(total) / Math.pow(10, APP_COIN_DECIMALS));
      });
    }
  }, [account, isOpen, denomination, txStatus]);

  useEffect(() => {
    if (isOpen) {
      setDepositAmount("");
      setTxStatus("idle");
      setTxDigest(undefined);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDeposit = async () => {
    if (!account) {
      setTxStatus("error");
      setTxMessage("Wallet not connected");
      return;
    }

    setTxStatus("pending");
    setTxMessage("Processing deposit...");

    try {
      const depositParsed = parseFloat(depositAmount || "0");
      if (depositParsed <= 0) throw new Error("Please enter a valid amount.");

      const depositMist = parsePUSDToMist(depositAmount || "0");
      
      const availableCoins = await queryCoins(account.address, denomination);
      let total = 0n;
      let coinsToUse: string[] = [];

      for (const coin of availableCoins) {
        total += BigInt(coin.balance);
        coinsToUse.push(coin.id);
        if (total >= depositMist) break;
      }
      
      if (total < depositMist) {
        throw new Error("Insufficient balance for deposit.");
      }

      const tx = new Transaction();
      tx.setGasBudget(100_000_000);


      buildDepositTx({
        tx,
        packageId: config.PACKAGE_ID,
        clockId: CLOCK_OBJECT_ID,
        denomination,
        accountId,
        capId,
        depositAmount: depositMist,
        coinsToUse,
      });

      const result = await executeSponsored(tx);
      if (result.error) throw new Error(result.error);

      const digest = result.digest!;
      await client.core.waitForTransaction({ digest });
      
      setTxDigest(digest);
      setTxStatus("success");
      setTxMessage("Deposit successful!");
      
      // Refresh balances
      await queryClient.invalidateQueries({ queryKey: ["sui-client", "getCoins"] });
      
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 2000);
    } catch (err) {
      console.error("Deposit Error:", err);
      setTxStatus("error");
      setTxMessage(parseMoveError(err));
    }
  };

  const handleMintPusd = async () => {
    setTxStatus("pending");
    setTxMessage("Minting Test PUSD...");
    try {
      const result = await mintPusd();
      if (!result) throw new Error("Transaction failed");
      
      setTimeout(async () => {
        setTxStatus("success");
        setTxMessage("Successfully minted 1,000 PUSD!");
        setTxDigest(result);
      }, 1000);
    } catch (err) {
      console.error("Mint Error:", err);
      setTxStatus("error");
      setTxMessage(parseMoveError(err));
    }
  };

  const isPending = txStatus === "pending";
  const depositParsed = parseFloat(depositAmount || "0");
  const hasInsufficientWalletBalance = walletBalanceUsd < depositParsed;

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
            <h2 className="text-xl font-bold">Deposit Funds</h2>
            <button
              onClick={onClose}
              disabled={isPending}
              className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-6 space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Amount to Deposit</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Wallet size={16} className="text-muted-foreground" />
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  disabled={isPending}
                  className="w-full pl-10 pr-4 py-2 bg-background border rounded-lg focus:ring-2 focus:ring-primary/50 transition-shadow disabled:opacity-50"
                  placeholder="Enter amount..."
                />
              </div>
            </div>

            {hasInsufficientWalletBalance && (
              <div className="p-4 bg-red-50/50 border border-red-200 dark:bg-red-950/20 dark:border-red-900/50 rounded-lg space-y-3">
                <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                  Insufficient PUSD in your wallet to fund this deposit.
                </p>
                <Button 
                  onClick={handleMintPusd} 
                  disabled={isPending}
                  variant="outline" 
                  className="w-full border-red-200 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
                >
                  Mint 1,000 Test PUSD
                </Button>
              </div>
            )}

            <Button
              onClick={handleDeposit}
              disabled={isPending || !depositAmount || hasInsufficientWalletBalance}
              loading={isPending}
              variant="default"
              className="w-full py-6 text-lg"
            >
              Deposit
            </Button>
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
