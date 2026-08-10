import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";
import { useCurrentNetwork, useDAppKit } from "@mysten/dapp-kit-react";
import {  SUBSCRIPTION_MAINNET_PACKAGE_ID  } from "@paystreamer/sdk";
import { cn } from "../lib/utils";

type SupportedNetwork = "mainnet" | "testnet" | "devnet";

const NETWORK_CONFIG: Record<
  SupportedNetwork,
  { label: string; color: string; dot: string }
> = {
  devnet: {
    label: "Devnet",
    color: "text-amber-200",
    dot: "bg-amber-400",
  },
  testnet: {
    label: "Testnet",
    color: "text-blue-200",
    dot: "bg-blue-400",
  },
  mainnet: {
    label: "Mainnet",
    color: "text-green-200",
    dot: "bg-green-400",
  },
};

interface NetworkSelectorProps {
  variant?: "navbar" | "mobile";
}

export default function NetworkSelector({
  variant = "navbar",
}: NetworkSelectorProps) {
  const currentNetwork = useCurrentNetwork() as SupportedNetwork;
  const dAppKit = useDAppKit();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  if (import.meta.env.PROD) {
    return null;
  }


  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const available = dAppKit.networks as readonly SupportedNetwork[];
  const isMainnetAvailable = SUBSCRIPTION_MAINNET_PACKAGE_ID !== undefined;

  const handleSelect = (network: SupportedNetwork) => {
    if (network === currentNetwork) {
      setOpen(false);
      return;
    }
    if (network === "mainnet" && !isMainnetAvailable) {
      setOpen(false);
      return;
    }
    dAppKit.switchNetwork(network);
    setOpen(false);
  };

  const current =
    NETWORK_CONFIG[currentNetwork] ?? NETWORK_CONFIG.devnet;

  const triggerClasses =
    variant === "navbar"
      ? "px-3 py-2 text-sm"
      : "px-4 py-3 text-sm w-full";

  const dropdownPosition =
    variant === "navbar"
      ? "right-0 mt-2 w-48"
      : "left-0 right-0 mt-2";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
          "bg-white/5 hover:bg-white/10 border border-white/10 text-white",
          triggerClasses
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={cn("h-2 w-2 rounded-full", current.dot)} />
        <span className={current.color}>{current.label}</span>
        <ChevronDown
          size={14}
          className={cn(
            "transition-transform text-white/60",
            open && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.ul
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            role="listbox"
            className={cn(
              "absolute z-50 rounded-md border border-white/10 bg-[#12121a] shadow-lg py-1",
              dropdownPosition
            )}
          >
            {available.map((network) => {
              const cfg = NETWORK_CONFIG[network];
              const isCurrent = network === currentNetwork;
              const disabled =
                network === "mainnet" && !isMainnetAvailable;
              return (
                <li key={network}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    disabled={disabled}
                    onClick={() => handleSelect(network)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 text-sm text-left",
                      "hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                    )}
                  >
                    <span className={cn("h-2 w-2 rounded-full", cfg.dot)} />
                    <span className={cn("flex-1", cfg.color)}>
                      {cfg.label}
                    </span>
                    {disabled && (
                      <span className="text-[10px] uppercase tracking-wide text-white/40">
                        Unavailable
                      </span>
                    )}
                    {isCurrent && (
                      <Check size={14} className="text-white/80" />
                    )}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
