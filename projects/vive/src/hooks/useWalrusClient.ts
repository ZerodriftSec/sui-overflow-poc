import { useMemo } from "react";
import { useCurrentClient } from "@mysten/dapp-kit-react";
import { walrus } from "@mysten/walrus";

export function useWalrusClient() {
  const client = useCurrentClient();
  return useMemo(() => client.$extend(walrus()), [client]);
}
