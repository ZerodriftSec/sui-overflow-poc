import { useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Wallet, CheckCircle, ExternalLink } from "lucide-react";
import { ConnectModal } from "@mysten/dapp-kit-react/ui";
import { useCurrentAccount } from "@mysten/dapp-kit-react";
import { Button } from "@paystreamer/sdk";

interface OnboardModalProps {
  open: boolean;
  onClose: () => void;
}

const SUI_WALLET_URL = "https://chrome.google.com/webstore/detail/sui-wallet/opcgpfmipidbgpenhmajoajpbobppdil";
const SUIET_URL = "https://suiet.app/";

export function OnboardModal({ open, onClose }: OnboardModalProps) {
  const account = useCurrentAccount();
  const navigate = useNavigate();
  const connectModalRef = useRef<React.ElementRef<typeof ConnectModal>>(null);

  useEffect(() => {
    if (open && account) {
      onClose();
    }
  }, [open, account, onClose]);

  if (!open) return null;

  const handleCreatePlatform = () => {
    onClose();
    navigate("/platforms");
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="relative w-full max-w-md rounded-xl border bg-card shadow-xl overflow-hidden"
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1.5 rounded-md hover:bg-muted transition-colors z-10"
            aria-label="Close"
          >
            <X size={18} />
          </button>

          <div className="p-6 space-y-5">
            {account ? (
              <div className="text-center space-y-4 py-2">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", bounce: 0.5 }}
                  className="flex justify-center"
                >
                  <CheckCircle className="w-14 h-14 text-green-500" />
                </motion.div>
                <div>
                  <h2 className="text-xl font-bold mb-1">All set!</h2>
                  <p className="text-sm text-muted-foreground">
                    Click below to create your platform.
                  </p>
                </div>
                <Button
                  onClick={handleCreatePlatform}
                  variant="gradient"
                  className="w-full py-5 text-base"
                >
                  Create Platform
                </Button>
              </div>
            ) : (
              <>
                <div className="text-center pt-2">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-[#6c63ff] to-[#3b82f6] mb-3">
                    <Wallet className="w-6 h-6 text-white" />
                  </div>
                  <h2 className="text-xl font-bold mb-1">Get a Sui wallet</h2>
                  <p className="text-sm text-muted-foreground">
                    A Sui wallet is your account on-chain. It stores your funds and signs transactions.
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Install a wallet
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <a
                      href={SUI_WALLET_URL}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm"
                    >
                      <span className="font-medium">Sui Wallet</span>
                      <ExternalLink size={14} className="text-muted-foreground" />
                    </a>
                    <a
                      href={SUIET_URL}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm"
                    >
                      <span className="font-medium">Suiet</span>
                      <ExternalLink size={14} className="text-muted-foreground" />
                    </a>
                  </div>
                </div>

                <Button
                  onClick={() => connectModalRef.current?.show()}
                  variant="gradient"
                  className="w-full py-5 text-base"
                >
                  Connect Wallet
                </Button>
              </>
            )}
          </div>
        </motion.div>

        <ConnectModal ref={connectModalRef} />
      </div>
    </AnimatePresence>
  );
}
