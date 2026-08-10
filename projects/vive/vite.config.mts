import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

const SUI_FULLNODES = {
  mainnet: "https://fullnode.mainnet.sui.io",
  testnet: "https://fullnode.testnet.sui.io",
  devnet: "https://fullnode.devnet.sui.io",
} as const;

/** Keep in sync with TESTNET_SEAL_KEY_SERVER_ORIGINS in src/lib/walrus/constants.ts */
const TESTNET_SEAL_KEY_SERVER_ORIGINS = [
  "https://seal-key-server-testnet-1.mystenlabs.com",
  "https://seal-key-server-testnet-2.mystenlabs.com",
] as const;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // Dev-only: avoids browser CORS for Sui gRPC and Seal key servers.
    // Production (Vercel) talks to those hosts directly — see dApp-kit.ts and seal-fetch-proxy.ts.
    proxy: Object.fromEntries([
      ...Object.entries(SUI_FULLNODES).map(([network, target]) => [
        `/sui-rpc/${network}`,
        {
          target,
          changeOrigin: true,
          secure: true,
          rewrite: (path: string) => path.replace(`/sui-rpc/${network}`, ""),
        },
      ]),
      ...TESTNET_SEAL_KEY_SERVER_ORIGINS.map((target, index) => [
        `/seal-key-server/${index}`,
        {
          target,
          changeOrigin: true,
          secure: true,
          rewrite: (path: string) =>
            path.replace(`/seal-key-server/${index}`, ""),
        },
      ]),
    ]),
  },
});
