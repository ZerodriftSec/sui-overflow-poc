import { TESTNET_SEAL_KEY_SERVER_ORIGINS } from "./constants";

let installed = false;

/**
 * Route Seal key-server requests through the Vite dev proxy to avoid browser CORS.
 * Mirrors the `/sui-rpc/*` pattern used for Sui fullnodes in development.
 */
export function installSealKeyServerFetchProxy(): void {
  if (!import.meta.env.DEV || installed) {
    return;
  }
  installed = true;

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;

    for (let index = 0; index < TESTNET_SEAL_KEY_SERVER_ORIGINS.length; index += 1) {
      const origin = TESTNET_SEAL_KEY_SERVER_ORIGINS[index];
      if (!url.startsWith(origin)) {
        continue;
      }

      const proxiedUrl = url.replace(
        origin,
        `${window.location.origin}/seal-key-server/${index}`,
      );

      if (typeof input === "string" || input instanceof URL) {
        return originalFetch(proxiedUrl, init);
      }

      return originalFetch(new Request(proxiedUrl, input), init);
    }

    return originalFetch(input, init);
  };
}
