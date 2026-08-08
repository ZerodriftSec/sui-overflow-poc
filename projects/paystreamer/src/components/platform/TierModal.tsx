import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentAccount, useCurrentClient } from "@mysten/dapp-kit-react";
import { Transaction } from "@mysten/sui/transactions";
import { useSponsoredTransaction } from "../../hooks/useSponsoredTransaction";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalDescription,
  ModalFooter,
} from "../ui/modal";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {   PUSD_TYPE_ARG  } from "@paystreamer/sdk";
import { getErrorMessage } from "../../lib/errors";
import { useTxToast, generateToastId } from "../TxStatusToast";
import { useAppConfig } from "../../hooks/useAppConfig";
import { formatFrequency } from "../../lib/format";

interface TierModalProps {
  open: boolean;
  onClose: () => void;
  platformId: string;
  initialSharedVersion: number;
  tier?: {
    name: string;
    amount: string;
    frequency: string;
    subscriber_count: number;
    is_active: boolean;
  };
  tierIndex?: number;
}

type BillingCycle = "daily" | "weekly" | "monthly" | "yearly" | "custom";



const BILLING_CYCLE_SECONDS: Record<BillingCycle, number> = {
  daily: 86400,
  weekly: 604800,
  monthly: 2592000,
  yearly: 31536000,
  custom: 0,
};

export function TierModal({ open, onClose, platformId, initialSharedVersion, tier, tierIndex: _tierIndex }: TierModalProps) {
    const config = useAppConfig();
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const { executeSponsored } = useSponsoredTransaction();
  const queryClient = useQueryClient();
  const { addToast, confirmToast, failToast } = useTxToast();

  const [name, setName] = useState(tier?.name ?? "");
  const [amount, setAmount] = useState(
    tier ? (Number(tier.amount) / 1_000_000_000).toString() : ""
  );
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [customSeconds, setCustomSeconds] = useState("30");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 60-second frequency exists specifically so the "Process Now" button (Phase 1.1)
  // can be demoed end-to-end inside a 5-minute window for the live hackathon demo.
  const [useDemoDefaults, setUseDemoDefaults] = useState(false);

  const isEditMode = !!tier;

  function handleDemoToggle(checked: boolean) {
    setUseDemoDefaults(checked);
    if (checked) {
      setName(`Demo Tier ${Date.now() % 1000}`);
      setAmount("10.00");
      setBillingCycle("custom");
      setCustomSeconds("60");
    } else {
      setName("");
      setAmount("");
      setBillingCycle("monthly");
      setCustomSeconds("30");
    }
  }

  const frequencySeconds =
    billingCycle === "custom"
      ? parseInt(customSeconds) * 1000
      : BILLING_CYCLE_SECONDS[billingCycle] * 1000;

  const previewAmount = amount
    ? `${parseFloat(amount).toFixed(2)} PUSD / ${formatFrequency({ frequency_ms: String(frequencySeconds) })}`
    : "";

  async function handleSubmit() {
    if (!account || !name || !amount) {
      setError("Please fill in all required fields");
      return;
    }

    setIsPending(true);
    setError(null);

    const tx = new Transaction();
    const amountU64 = BigInt(Math.round(parseFloat(amount) * 1_000_000_000));
    const denominationTypeName = tx.moveCall({
      target: "0x1::type_name::get",
      typeArguments: [PUSD_TYPE_ARG],
      arguments: [],
    });

    tx.moveCall({
      target: `${config.PACKAGE_ID}::platform::create_tier`,
      arguments: [
        tx.sharedObjectRef({
          objectId: platformId,
          initialSharedVersion,
          mutable: true,
        }),
        tx.pure.string(name),
        tx.pure.u64(amountU64),
        tx.pure.u64(frequencySeconds),
        denominationTypeName,
      ],
    });

    const toastId = generateToastId();
    addToast(toastId);

    try {
      const result = await executeSponsored(tx);
      if (result.error) {
        throw new Error(result.error);
      }
      
      await client.waitForTransaction({ digest: result.digest! });
      confirmToast(toastId, result.digest!);
      
      setTimeout(async () => {
        await queryClient.invalidateQueries({ queryKey: ["owned-platforms", account.address] });
      }, 1500);
      
      onClose();
      resetForm();
    } catch (err) {
      console.error("DEBUG ERR in TierModal:", err);
      failToast(toastId, err);
      setError(getErrorMessage(err));
    } finally {
      setIsPending(false);
    }
  }

  function resetForm() {
    setName("");
    setAmount("");
    setBillingCycle("monthly");
    setCustomSeconds("30");
    setUseDemoDefaults(false);
  }

  return (
    <Modal open={open} onOpenChange={(openValue) => !openValue && onClose()}>
      <ModalContent className="sm:max-w-lg mx-4">
        <ModalHeader>
          <ModalTitle>{isEditMode ? "Edit Tier" : "Add New Tier"}</ModalTitle>
          <ModalDescription>
            {isEditMode
              ? "Update the subscription tier details."
              : "Create a new subscription tier for your platform."}
          </ModalDescription>
        </ModalHeader>

        <div className="space-y-4">
          {!isEditMode && (
            <label className="flex items-center gap-3 cursor-pointer rounded-lg border border-dashed border-accent-primary/40 bg-accent-primary/5 p-3">
              <input
                type="checkbox"
                checked={useDemoDefaults}
                onChange={(e) => handleDemoToggle(e.target.checked)}
                className="w-4 h-4"
              />
              <div>
                <span className="text-sm font-medium">Use demo defaults</span>
                <p className="text-xs text-muted-foreground">
                  Pre-fills a 60-second billing cycle so the live "Process Now" button can be demoed end-to-end in &lt;5 minutes.
                </p>
              </div>
            </label>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Tier Name</label>
            <Input
              placeholder="e.g., Basic, Pro, Enterprise"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Amount</label>
            <div className="relative">
              <Input
                type="number"
                placeholder="9.99"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pr-16"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <span className="text-muted-foreground text-sm">PUSD</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Billing Cycle</label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={billingCycle}
              onChange={(e) => setBillingCycle(e.target.value as BillingCycle)}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="custom">Custom (Seconds)</option>
            </select>
          </div>

          {billingCycle === "custom" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Custom Interval (seconds)</label>
              <Input
                type="number"
                placeholder="30"
                value={customSeconds}
                onChange={(e) => setCustomSeconds(e.target.value)}
              />
            </div>
          )}


          {previewAmount && (
            <div className="rounded-lg bg-muted p-3">
              <p className="text-sm text-muted-foreground">Live Preview</p>
              <p className="text-lg font-semibold">{previewAmount}</p>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!account || isPending} loading={isPending}>
            {isEditMode ? "Update Tier" : "Add Tier"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}