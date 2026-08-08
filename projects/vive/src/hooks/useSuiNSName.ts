import { useCurrentClient } from "@mysten/dapp-kit-react";
import { normalizeSuiNSName } from "@mysten/sui/utils";
import { useQuery } from "@tanstack/react-query";

export function useSuiNSName(address: string | null | undefined) {
  const client = useCurrentClient();

  return useQuery({
    queryKey: ["suins-name", address],
    enabled: Boolean(address),
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: async () => {
      if (!address) return null;

      try {
        const result = await client.defaultNameServiceName({ address });
        const name = result.data.name;
        return name ? normalizeSuiNSName(name, "at") : null;
      } catch {
        return null;
      }
    },
  });
}
