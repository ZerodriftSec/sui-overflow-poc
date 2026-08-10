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
import {   CLOCK_OBJECT_ID  } from "@paystreamer/sdk";
import { getErrorMessage } from "../../lib/errors";
import { useTxToast, generateToastId } from "../TxStatusToast";
import { useAppConfig } from "../../hooks/useAppConfig";

interface RegisterPlatformModalProps {
  open: boolean;
  onClose: () => void;
}

export function RegisterPlatformModal({ open, onClose }: RegisterPlatformModalProps) {
    const config = useAppConfig();
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const { executeSponsored } = useSponsoredTransaction();
  const queryClient = useQueryClient();
  const { addToast, confirmToast, failToast } = useTxToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [iconUrl, setIconUrl] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 60-second tier frequency (set on the matching TierModal preset) exists specifically
  // so the "Process Now" button (Phase 1.1) can be demoed end-to-end inside a 5-minute
  // window for the live hackathon demo.
  const [useDemoDefaults, setUseDemoDefaults] = useState(false);

  function handleDemoToggle(checked: boolean) {
    setUseDemoDefaults(checked);
    if (checked) {
      setName(`Demo SaaS ${Date.now() % 1000}`);
      setDescription("A demo platform for the PayStreamer hackathon. Subscribe for a few minutes of test billing.");
      setCategory("SaaS");
    } else {
      setName("");
      setDescription("");
      setCategory("Software");
    }
  }

  async function handleSubmit() {
    if (!account || !name || !description || !category) {
      setError("Please fill in all required fields (Name, Description, Category)");
      return;
    }

    setIsPending(true);
    setError(null);

    const tx = new Transaction();

    tx.moveCall({
      target: `${config.PACKAGE_ID}::platform::register_platform`,
      arguments: [
        tx.pure.string(name),
        tx.pure.string(description),
        tx.pure.string(category),
        tx.pure.option("string", iconUrl || null),
        tx.object(CLOCK_OBJECT_ID),
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
      console.error("DEBUG ERR in RegisterPlatformModal:", err);
      failToast(toastId, err);
      setError(getErrorMessage(err));
    } finally {
      setIsPending(false);
    }
  }

  function resetForm() {
    setName("");
    setDescription("");
    setCategory("");
    setIconUrl("");
    setUseDemoDefaults(false);
  }

  return (
    <Modal open={open} onOpenChange={(openValue) => !openValue && onClose()}>
      <ModalContent className="sm:max-w-lg mx-4">
        <ModalHeader>
          <ModalTitle>Register New Platform</ModalTitle>
          <ModalDescription>
            Register your platform on the Sui network to start accepting subscriptions.
          </ModalDescription>
        </ModalHeader>

        <div className="space-y-4">
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
                Pre-fills a demo platform name and category. Pair with the matching 60-second demo tier so the live "Process Now" button can be demoed end-to-end in &lt;5 minutes.
              </p>
            </div>
          </label>

          <div className="space-y-2">
            <label className="text-sm font-medium">Platform Name *</label>
            <Input
              placeholder="e.g., Acme Corp"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description *</label>
            <Input
              placeholder="Brief description of your platform"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Category *</label>
            <Input
              placeholder="e.g., Software, Media, AI"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Icon URL (Optional)</label>
            <Input
              placeholder="https://example.com/logo.png"
              value={iconUrl}
              onChange={(e) => setIconUrl(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!account || isPending} loading={isPending}>
            Register Platform
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
