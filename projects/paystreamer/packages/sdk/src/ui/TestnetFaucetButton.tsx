// @ts-nocheck
import React from "react";
import { Coins } from "lucide-react";
import { Button, ButtonProps } from "./components/button";
import { useMintTestPusd } from "../react/useMintTestPusd";

export interface TestnetFaucetButtonProps extends Omit<ButtonProps, "onClick" | "loading"> {
  amountMist?: bigint;
  onSuccess?: (digest: string) => void;
  onError?: (err: string) => void;
  containerClassName?: string;
}

export function TestnetFaucetButton({
  amountMist = 100000000000n, // default 100 PUSD
  onSuccess,
  onError,
  containerClassName = "flex flex-col gap-1 w-full sm:w-auto",
  children,
  className,
  ...props
}: TestnetFaucetButtonProps) {
  const { mint, isLoading, error } = useMintTestPusd();

  const handleMint = async () => {
    try {
      const digest = await mint(amountMist);
      if (digest) {
        if (onSuccess) onSuccess(digest);
      } else if (error) {
        if (onError) onError(error);
      }
    } catch (err: any) {
      if (onError) onError(err.message || String(err));
    }
  };

  return (
    <div className={containerClassName}>
      <Button
        variant="outline"
        loading={isLoading}
        onClick={handleMint}
        className={className}
        {...props}
      >
        {!isLoading && <Coins className="h-4 w-4 mr-2" />}
        {children || (isLoading ? "Minting..." : "Mint 100 PUSD")}
      </Button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
