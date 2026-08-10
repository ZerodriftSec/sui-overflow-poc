import Link from 'next/link';
import { Callout } from '@/components/docs/ui';
import { SupportedAssetsSection } from '@/components/docs/supported-assets-section';

export default function SupportedAssetsPage() {
  return (
    <>
      <h1>Supported Chains and Tokens</h1>
      <p className="subtitle">
        Browse all chains and tokens currently enabled in NodeRails.
      </p>

      <Callout type="success" title="Need another chain?">
        We can add any chain within 24 hours. Send us feedback or a feature request on the landing page, or reach out on Telegram.
      </Callout>

      <Callout type="info" title="Quick integration tip">
        In API and SDK requests, pass <code>allowedChains</code> using numeric chain IDs: EVM examples like <code>8453</code> (Base),
        Solana clusters <code>103</code> (mainnet), <code>102</code> (devnet), <code>101</code> (testnet), and Sui <code>201</code> (devnet), <code>202</code> (testnet), <code>203</code> (mainnet).
        Pass <code>allowedTokens</code> as symbols or token keys (e.g. <code>USDC</code>, <code>USDC-8453</code>, <code>SOL-103</code>, <code>SUI-202</code>).
        See the <Link href="/docs/getting-started">Quick Start guide</Link> and <Link href="/docs/chains/sui">Sui guide</Link> for examples.
      </Callout>

      <SupportedAssetsSection />
    </>
  );
}