import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Next only auto-loads `.env*` from `apps/payment-ui/`. Many monorepos keep
 * `NEXT_PUBLIC_*` in the repo root `.env` — merge those so Dodo / API URLs work.
 */
function mergeNextPublicFromRepoRootEnv() {
  const repoRoot = path.resolve(__dirname, '../..');
  for (const name of ['.env.local', '.env']) {
    const filePath = path.join(repoRoot, name);
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, 'utf8');
    for (let line of text.split(/\r?\n/)) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      let key = line.slice(0, eq).trim();
      if (key.startsWith('export ')) key = key.slice(7).trim();
      if (!key.startsWith('NEXT_PUBLIC_')) continue;
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  }
}

mergeNextPublicFromRepoRootEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  webpack: (config) => {
    // wagmi v3 optional tempo connector — not used in checkout
    config.resolve.alias = {
      ...config.resolve.alias,
      accounts: false,
      '@metamask/connect-evm': false,
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      '@metamask/connect-evm': false,
    };
    return config;
  },
  async headers() {
    return [
      {
        // Allow the hosted checkout to be embedded as an iframe by merchant
        // integrations (e.g. the pretix-noderails plugin). We rely on
        // `frame-ancestors` instead of `X-Frame-Options` because the latter
        // does not support multiple/wildcard origins.
        source: '/checkout/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: "frame-ancestors *" },
        ],
      },
    ];
  },
};

export default nextConfig;
