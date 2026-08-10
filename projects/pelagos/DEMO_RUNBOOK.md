# Pelagos Final Demo Runbook

Target: Sui testnet. Frontend on Vercel, backend on one Akash replica.

## Release Gate

The demo is GO only when this command passes against the public endpoints:

```bash
cd backend
DEMO_BACKEND_URL=https://2m13s87c5h8d38oc2t38a3kpso.ingress.m3a.eu-n-3.digitalfrontier.network \
DEMO_FRONTEND_URL=https://pelagos-sui.vercel.app \
npm run check:demo
```

The gate verifies backend/Sui/Predict health, managed mode, four fresh BTC
oracles, a running feed at 10-second cadence, non-zero binary pricing, a live
six-leg $10 strip, a reconciled $10 funded note, the PLP yield catalogue and
liquidity/risk capacity, feed advancement, and the public frontend.

The canonical product write audit is opt-in because it executes five testnet
transactions and opens $10 dUSDC plus $15 mUSDC of positions:

```bash
cd backend
LIVE_YIELD_NOTES_E2E=1 \
AUDIT_BASE_URL=https://<current-backend-ingress> \
npm run audit:yield-notes
```

It opens and confirms both settlement rails, verifies the terminal and first
autocall observation locks, then reconciles PLP, live ranges, and mUSDC receipts.

Current verified backend artifact:

```text
ghcr.io/tharune/pelagos-backend@sha256:419737f6e02e0b389f73be0e0ae3064c86f7daa6412559f8c100567b5d5d3521
```

## Five-Minute Preflight

1. Run the release gate above. Any `NO-GO` is a stop condition.
2. Open `https://pelagos-sui.vercel.app/app/distribution` in Chrome.
3. Connect Slush on Sui testnet and confirm at least 10 dUSDC and 2.5 SUI.
4. Confirm Distribution shows 6/6 live legs and a non-zero deploy cost.
5. Confirm Earn Yield shows live PLP NAV, utilization, capacity, and no annualized
   APY. Confirm Protected Notes reconciles reserve + strip premium + buffer to $10.
6. Keep exactly one oracle-feed writer running. Stop local feed processes while
   the Akash feed is healthy.

## Demo Flow

1. Distribution Markets: show the live BTC forward, six payout bands, bid/ask,
   max payout, and remaining pool capacity. Open a $10 dUSDC strip.
2. Volatility: show a $10 straddle, Greeks, live strip depth, and hedge quote.
3. Range Strips: show a $10 shaped settlement range and its six live bands.
4. Earn Yield: show PLP share price, launch-to-date return, current-book stress,
   and a hedged counterparty allocation. Explain that PLP NAV can fall.
5. Protected Notes: show the $10 reconciliation, terminal payout schedule, and
   the mUSDC-only three-observation autocall with final knock-in downside.
6. Portfolio: show the confirmed on-chain position and explorer digest.

Use the Test funds control at most once per demo wallet. One grant is 25 dUSDC,
10,000 mUSDC, and 3 SUI. Wait for the first request to finish; never double-click
or approve duplicate wallet transactions.

## Recovery

- Predict unavailable or stale: inspect `/api/predict/status`. Restart the one
  Akash replica if the feed is stopped, then rerun the release gate. Do not start
  a second production writer.
- Frontend calls the wrong host: set Vercel `NEXT_PUBLIC_BACKEND_URL` to the Akash
  HTTPS ingress and redeploy; the value is compiled at build time.
- Wallet transaction fails: record the wallet error and transaction digest before
  retrying. Confirm balances and manager state. Do not blindly resubmit.
- dUSDC path blocked during presentation: use the mUSDC testnet rail for the UI
  walkthrough while preserving the failed dUSDC evidence for diagnosis.
- Provider outage: redeploy the pinned image digest, restore the same environment,
  update Vercel only if the ingress hostname changes, then rerun the public gate.

## After The Demo

Rotate the dedicated operator/admin secrets, withdraw unnecessary testnet float,
and retain the immutable image digest plus transaction digests in the handoff.
