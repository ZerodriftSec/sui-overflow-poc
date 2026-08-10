import { cn } from "../lib/utils";
import { WalletConnectControl } from "./WalletConnectControl";

interface WalletConnectCTAProps {
  label?: string;
  size?: "default" | "sm" | "lg";
  className?: string;
}

export function WalletConnectCTA({
  label = "Connect Sui Wallet",
  size = "lg",
  className,
}: WalletConnectCTAProps) {
  return (
    <WalletConnectControl
      size="cta"
      connectLabel={label}
      className={cn(
        size === "sm" && "[&_button]:px-4 [&_button]:py-2 [&_button]:text-sm",
        size === "lg" && "[&_button]:h-10 [&_button]:px-8",
        className,
      )}
    />
  );
}
