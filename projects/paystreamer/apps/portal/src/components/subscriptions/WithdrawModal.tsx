import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Wallet } from "lucide-react";
import { useCurrentClient, useCurrentAccount } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { Button } from "@paystreamer/sdk";
import { TxStatusToast, TxStatus } from "../TxStatusToast";
import { parseMoveError } from "../../lib/errors";
import { parsePUSDToMist } from "../../lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { buildWithdrawTx } from "@paystreamer/sdk/core";
import { useSponsoredTransaction } from "@paystreamer/sdk/react";
import { useAppConfig } from "../../hooks/useAppConfig";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string;
  capId: string;
  denomination: string;
  onSuccess?: () => void;
}

export function WithdrawModal({
  isOpen,
  onClose,
  accountId,
  capId,
  denomination,
  onSuccess,
}: WithdrawModalProps) {
    const config = useAppConfig();
  const client = useCurrentClient();
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  const { executeSponsored } = useSponsoredTransaction();

  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txMessage, setTxMessage] = useState("");
  const [txDigest, setTxDigest] = useState<string | undefined>();

  useEffect(() => {
    if (isOpen) {
      setWithdrawAmount("");
      setTxStatus("idle");
      setTxDigest(undefined);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleWithdraw = async () => {
    if (!account) {
      setTxStatus("error");
      setTxMessage("Wallet not connected");
      return;
    }

    setTxStatus("pending");
    setTxMessage("Processing withdrawal...");

    try {
      const withdrawParsed = parseFloat(withdrawAmount || "0");
      if (withdrawParsed <= 0) throw new Error("Please enter a valid amount.");

      const withdrawMist = parsePUSDToMist(withdrawAmount || "0");

      const tx = new Transaction();
      tx.setGasBudget(100_000_000);

      buildWithdrawTx({
        tx,
        packageId: config.PACKAGE_ID,
        denomination,
        accountId,
        capId,
        withdrawAmount: withdrawMist,
        recipientAddress: account.address,
      });

      const result = await executeSponsored(tx);
      if (result.error) throw new Error(result.error);

      const digest = result.digest!;
      await client.core.waitForTransaction({ digest });
      
      setTxDigest(digest);
      setTxStatus("success");
      setTxMessage("Withdrawal successful!");
      
      // Refresh balances
      await queryClient.invalidateQueries({ queryKey: ["sui-client", "getCoins"] });
      
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 2000);
    } catch (err) {
      console.error("Withdraw Error:", err);
      setTxStatus("error");
      setTxMessage(parseMoveError(err));
    }
  };

  const isPending = txStatus === "pending";

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
            <h2 className="text-xl font-bold">Withdraw Funds</h2>
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
              <label className="text-sm font-medium">Amount to Withdraw</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Wallet size={16} className="text-muted-foreground" />
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  disabled={isPending}
                  className="w-full pl-10 pr-4 py-2 bg-background border rounded-lg focus:ring-2 focus:ring-primary/50 transition-shadow disabled:opacity-50"
                  placeholder="Enter amount..."
                />
              </div>
            </div>

            <Button
              onClick={handleWithdraw}
              disabled={isPending || !withdrawAmount}
              loading={isPending}
              variant="default"
              className="w-full py-6 text-lg"
            >
              Withdraw
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
