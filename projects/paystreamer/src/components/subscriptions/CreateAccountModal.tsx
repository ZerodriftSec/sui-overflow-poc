import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Transaction } from "@mysten/sui/transactions";
import { useCurrentClient, useCurrentAccount } from "@mysten/dapp-kit-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { DenominationSelector } from "./DenominationSelector";
import { TxStatusToast } from "../TxStatusToast";
import { TxStatus } from "../TxStatusToast";
import { X, ChevronRight, ChevronLeft, Check } from "lucide-react";
import { parseMoveError } from "../../lib/errors";
import { 
  COIN_TYPE_REGISTRY_ID,
  CLOCK_OBJECT_ID,
} from "@paystreamer/sdk";
import {  queryCoins  } from "@paystreamer/sdk/core";
import { useSponsoredTransaction } from "../../hooks/useSponsoredTransaction";
import { useAppConfig } from "../../hooks/useAppConfig";

type Step = "denomination" | "deposit" | "confirm";

interface CreateAccountModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (accountId: string, capId: string) => void;
}

export function CreateAccountModal({ open, onClose, onCreated }: CreateAccountModalProps) {
    const config = useAppConfig();
  const client = useCurrentClient();
  const account = useCurrentAccount();
  const queryClient = useQueryClient();
  const { executeSponsored } = useSponsoredTransaction();

  const [step, setStep] = useState<Step>("denomination");
  const [selectedDenomination, setSelectedDenomination] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState("");
  const [txStatus, setTxStatus] = useState<TxStatus>("idle");
  const [txMessage, setTxMessage] = useState("");
  const [txDigest, setTxDigest] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const steps: { key: Step; label: string }[] = [
    { key: "denomination", label: "Denomination" },
    { key: "deposit", label: "Deposit" },
    { key: "confirm", label: "Confirm" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  function goNext() {
    const idx = currentStepIndex;
    if (idx < steps.length - 1) {
      setStep(steps[idx + 1].key);
    }
  }

  function goBack() {
    const idx = currentStepIndex;
    if (idx > 0) {
      setStep(steps[idx - 1].key);
    }
  }

  async function executeCreate() {
    if (!account || !selectedDenomination) return;

    setTxStatus("pending");
    setTxMessage("Creating account...");
    setError(null);

    try {
      const depositParsed = parseFloat(depositAmount || "0");
      const depositMist = BigInt(Math.floor(depositParsed * 1_000_000_000));
      let coinsToUse: string[] = [];

      if (depositMist > 0n) {
        const availableCoins = await queryCoins(account.address, selectedDenomination);
        let total = 0n;
        for (const coin of availableCoins) {
          total += BigInt(coin.balance);
          coinsToUse.push(coin.id);
          if (total >= depositMist) break;
        }
        if (total < depositMist) {
          throw new Error(`Insufficient ${selectedDenomination.split('::').pop()} balance for deposit.`);
        }
      }

      const tx = new Transaction();

      const [accountObj, cap] = tx.moveCall({
        target: `${config.PACKAGE_ID}::account::create_account`,
        typeArguments: [selectedDenomination],
        arguments: [tx.object(COIN_TYPE_REGISTRY_ID), tx.object(CLOCK_OBJECT_ID)],
      });

      if (depositMist > 0n && coinsToUse.length > 0) {
        let primaryCoin: any;
        if (selectedDenomination === "0x2::sui::SUI") {
          const [splitCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(depositMist)]);
          primaryCoin = splitCoin;
        } else {
          const coinObjs = coinsToUse.map(id => tx.object(id));
          if (coinObjs.length > 1) {
             tx.mergeCoins(coinObjs[0], coinObjs.slice(1));
          }
          const [splitCoin] = tx.splitCoins(coinObjs[0], [tx.pure.u64(depositMist)]);
          primaryCoin = splitCoin;
        }
        
        tx.moveCall({
          target: `${config.PACKAGE_ID}::account::deposit`,
          typeArguments: [selectedDenomination],
          arguments: [cap, accountObj, primaryCoin, tx.object(CLOCK_OBJECT_ID)],
        });
      }

      tx.moveCall({
        target: `${config.PACKAGE_ID}::account::share_account`,
        typeArguments: [selectedDenomination],
        arguments: [accountObj, cap],
      });

      const result = await executeSponsored(tx);
      if (result.error) throw new Error(result.error);

      setTxStatus("success");
      setTxMessage("Account created successfully!");
      setTxDigest(result.digest!);

      await client.waitForTransaction({ digest: result.digest! });

      const txData = await client.getTransaction({
        digest: result.digest!,
        include: { objectTypes: true },
      });

      const objectChanges = "objectChanges" in txData ? (txData as any).objectChanges : [];
      const createdAccount = objectChanges.find(
        (change: any) =>
          change.type === "created" &&
          change.objectType?.includes("::account::SubscriptionAccount")
      );
      const createdCap = objectChanges.find(
        (change: any) =>
          change.type === "created" && change.objectType?.includes("::account::AccountCap")
      );

      if (createdAccount?.objectId && createdCap?.objectId) {
        onCreated(createdAccount.objectId, createdCap.objectId);
      }

      await queryClient.invalidateQueries({ queryKey: ["subscription-accounts", account.address] });

      setTimeout(() => {
        onClose();
        resetForm();
      }, 1500);
    } catch (err) {
      setTxStatus("error");
      setTxMessage("Transaction failed");
      setError(parseMoveError(err));
    }
  }

  function resetForm() {
    setStep("denomination");
    setSelectedDenomination(null);
    setDepositAmount("");
    setTxStatus("idle");
    setTxMessage("");
    setTxDigest("");
    setError(null);
  }

  function handleClose() {
    if (txStatus === "pending") return;
    onClose();
    resetForm();
  }

  const denominationSymbol = selectedDenomination?.includes("pusd")
    ? "USD"
    : selectedDenomination?.includes("usdc")
    ? "USDC"
    : selectedDenomination?.includes("usdsui")
    ? "USDSui"
    : "SUI";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-background rounded-xl border shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            {steps.map((s, i) => (
<div key={s.key} className="flex items-center gap-2">
               <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                    i <= currentStepIndex
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i < currentStepIndex ? <Check className="h-3 w-3" /> : i + 1}
                </div>
<span className="text-sm hidden md:inline">{s.label}</span>
                {i < steps.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </div>
            ))}
          </div>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {step === "denomination" && (
            <>
              <CardHeader className="p-0">
                <CardTitle>Choose Denomination</CardTitle>
                <CardDescription>Select the token type for this account</CardDescription>
              </CardHeader>
              <DenominationSelector selected={selectedDenomination} onSelect={setSelectedDenomination} />
            </>
          )}

          {step === "deposit" && (
            <>
              <CardHeader className="p-0">
                <CardTitle>Initial Deposit</CardTitle>
                <CardDescription>Deposit funds to get started (optional)</CardDescription>
              </CardHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Deposit amount ({denominationSymbol})</label>
                  <Input
                    type="number"
                    placeholder="0 = skip deposit"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    min={0}
                    step={0.001}
                  />
                  <p className="text-xs text-muted-foreground">
                    Funds will be split from your gas coin
                  </p>
                </div>
              </div>
            </>
          )}

          {step === "confirm" && (
            <>
              <CardHeader className="p-0">
                <CardTitle>Confirm Account Creation</CardTitle>
                <CardDescription>Review your settings before creating</CardDescription>
              </CardHeader>
              <Card>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Denomination</span>
                    <span className="text-sm font-medium">{denominationSymbol}</span>
                  </div>
                  {parseFloat(depositAmount) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Initial deposit</span>
                      <span className="text-sm font-medium">
                        {depositAmount} {denominationSymbol}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {error && (
            <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-between p-4 border-t">
          <Button variant="outline" onClick={goBack} disabled={currentStepIndex === 0 || txStatus === "pending"}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          {currentStepIndex < steps.length - 1 ? (
            <Button onClick={goNext} disabled={!selectedDenomination}>
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={executeCreate} disabled={!account || txStatus === "pending"} loading={txStatus === "pending"}>
              Create Account
            </Button>
          )}
        </div>
      </div>

      <TxStatusToast
        status={txStatus}
        message={txMessage}
        digest={txDigest}
        onClose={() => setTxStatus("idle")}
      />
    </div>
  );
}
