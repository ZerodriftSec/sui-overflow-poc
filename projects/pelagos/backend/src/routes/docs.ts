import { Router, Request, Response } from 'express';

const router = Router();

const apiDocs = {
  name: 'Pelagos API',
  version: '1.0.0',
  description: 'Structured prediction-market products on Sui testnet',
  base_url: '/api',
  deployment: {
    chain: 'sui',
    network: process.env.SUI_NETWORK ?? 'testnet',
    package_id: process.env.SUI_PACKAGE_ID ?? null,
    mock_usdc_type: process.env.MOCK_USDC_TYPE ?? null,
    active_address: process.env.SUI_ACTIVE_ADDRESS ?? null,
  },
  notes: [
    'User mutations are prepared by the backend and signed by the connected Sui wallet.',
    'mUSDC and DeepBook dUSDC are separate settlement rails and are reported separately.',
    'Live Predict routes fail closed when an oracle cannot be priced; they never fabricate a quote.',
  ],
  endpoints: [
    {
      method: 'GET',
      path: '/api/health',
      description: 'Backend health check covering Supabase, Polymarket, Sui gRPC, DeepBook Predict, uptime, and memory.',
      response: '{ status, timestamp, uptime_seconds, memory_mb, services }',
    },
    {
      method: 'GET',
      path: '/api/docs',
      description: 'This Sui-focused API documentation endpoint.',
      response: '{ name, version, description, deployment, endpoints[] }',
    },
    {
      method: 'GET',
      path: '/api/distribution/candidates',
      description: 'Discovers live launchable distribution-market candidates from Polymarket event groups using outcome-fit classification, NLP quality/category scoring, volume, CLOB depth, spread, and time-to-resolution. The reference curve is the normalized CLOB-implied probability vector.',
      response: '{ candidates: DistributionCandidate[], funnel, fetched_at }',
    },
    {
      method: 'POST',
      path: '/api/distribution/quote',
      description: 'Normalizes a submitted target curve against the live reference curve and returns the L2 quote, target-reference payout curve, required collateral, fees, and per-band P/L.',
      body: {
        candidate_id: 'Live distribution candidate id',
        weights: 'number[] with one entry per live band',
        collateral_usdc: 'UI amount in USDC',
      },
      response: '{ quote: DistributionQuote }',
    },
    {
      method: 'POST',
      path: '/api/distribution/launch-plan',
      description: 'Builds a local launch plan for a candidate, including band market ids, token ids, initial weights, required depth, and readiness status.',
      body: {
        candidate_id: 'Live distribution candidate id',
      },
      response: '{ plan: DistributionLaunchPlan }',
    },
    {
      method: 'GET',
      path: '/api/bundles',
      description: 'Lists Pelagos basket metadata and NAV inputs used by the frontend. In local Sui mode, the frontend falls back to seeded local universe data if live DB rows are unavailable.',
      response: 'BundleWithLegs[]',
    },
    {
      method: 'GET',
      path: '/api/markets',
      description: 'Polymarket market data proxy used for basket/NAV context.',
      query_params: [
        'limit - max results',
        'active - filter active markets',
      ],
      response: '{ count, markets }',
    },
    {
      method: 'GET',
      path: '/api/vaults/yields',
      description: 'Yield-source snapshot used by the PPN UI. Current Sui local mode treats this as a routing/display input rather than a Sui-native lending integration.',
      response: '{ pools, selected, generated_at }',
    },
    {
      method: 'GET',
      path: '/api/ppn/portfolio/:walletAddress',
      description: 'Live protected-note and tranche positions from ppn:-labeled on-chain vault receipts.',
      response: '{ wallet_address, vaults, summary }',
    },
    {
      method: 'POST',
      path: '/api/deposit/prepare',
      description: 'Builds a non-custodial mUSDC or dUSDC vault deposit for wallet signing.',
      body: { bundle_id: 'Bundle UUID or product label', wallet_address: 'Canonical Sui address', amount_usdc: 'Positive UI amount', currency: 'mUSDC | dUSDC' },
      response: '{ tx_bytes, sender, economics, vault_id }',
    },
    {
      method: 'GET',
      path: '/api/deposit/portfolio/:walletAddress',
      description: 'Lists basket vault receipts only; sim and ppn receipts use their dedicated endpoints.',
      response: '{ wallet_address, positions, total_value, total_pnl }',
    },
    {
      method: 'GET',
      path: '/api/options/chain?underlying=BTC',
      description: 'Live options chain priced from DeepBook Predict range liquidity. Returns 503 PREDICT_UNAVAILABLE when active oracles cannot be quoted.',
      response: '{ underlying, spot, source, expiries }',
    },
    {
      method: 'GET',
      path: '/api/deepbook/strategies',
      description: 'Curated structured-range strategies used by the DeepBook desk.',
      response: '{ strategies }',
    },
    {
      method: 'POST',
      path: '/api/sim/open/prepare',
      description: 'Builds a wallet-signed mUSDC premium deposit for the independent simulation settlement rail.',
      response: '{ tx_bytes, sender, sim_id, label }',
    },
    {
      method: 'GET',
      path: '/api/sim/positions/:owner',
      description: 'Lists pending, open, and settled structured simulation positions for one wallet.',
      response: '{ positions }',
    },
    {
      method: 'GET',
      path: '/api/predict/config',
      description: 'Safe snapshot of the active DeepBook Predict testnet deployment.',
      response: '{ network, rpc_url, server_url, package_id, predict_object_id, dusdc_type }',
    },
    {
      method: 'GET',
      path: '/api/lending',
      description: 'Current lending-rate and utilization snapshot for the portfolio and lending desk.',
      response: '{ total_deposits, utilization, supply_rate_apy, market_supply_apy, rate_source }',
    },
  ],
};

router.get('/', (_req: Request, res: Response) => {
  res.json(apiDocs);
});

export const docsRoutes = router;
