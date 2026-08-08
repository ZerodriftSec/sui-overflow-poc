# HANDOFF - read this first

Pelagos is a Sui-testnet structured-products dApp built around a Pelagos-operated deployment of
the official DeepBook Predict testnet contracts. The Next.js frontend is wallet-signed and
non-custodial; the Express backend reads on-chain state, produces live quotes, and builds unsigned
Programmable Transaction Blocks.

For depth, read `README.md`, `ARCHITECTURE.md`, `PRODUCTS.md`, `README_DEEPBOOK.md`,
`DEPLOYMENT.md`, and `DEMO_RUNBOOK.md`.

_Last updated: 2026-07-19. Comprehensive release plus vault verification fixes merged to `main` at
`17e14cf9a84e4ab1f6fd656cc99f84fc7c982bf4`; public redeployment is ready._

## Release state

- Local frontend: `http://127.0.0.1:13100`.
- Local development backend: `http://127.0.0.1:13101` (feed disabled to avoid a duplicate writer).
- Exact Docker release candidate: `http://127.0.0.1:13301`, image
  `sha256:562b58b4dd1dd2b0dc8ef2e84002dd44d08f28b072648a0a1e4c67884cda6b12`.
- GitHub Actions published OCI index
  `sha256:3f64ada5324b855028fcfd29b9065dbd28a433a8e3c300da34884c04ecec5baf`
  with linux/amd64 payload `sha256:fe0f92bbc8be22da315822e6526fba2515561ab2738bf3d0f91ba01a2541fd63`;
  `deploy/akash/deploy.yaml` is pinned to the index digest.
- One older local container remains the sole authorized oracle writer until the morning redeploy.
- The public `r3` backend does not contain the new yield/note routes. Do not call the public demo
  fully released until Akash is redeployed from the pinned image and strict public `check:demo`
  passes.

## What is now implemented

- **Buy Strips:** live DeepBook terminal range recipes with real bid/ask and exit pricing.
- **Earn Yield:** Core Market Maker, Downside Guard, Two-Way Guard, and Center Rebate. dUSDC owns
  pooled PLP shares plus optional on-chain range hedges; mUSDC is an isolated testnet payoff model.
- **Protected Notes:** Capital Guard, Range Coupon, terminal knock-out, terminal knock-in, Two-Way
  Buffer, and a three-observation mUSDC autocall with a final 70% knock-in.
- **Portfolio/account lifecycle:** PLP mark, live range bids, manager idle collateral, range exit,
  idle reclaim, PLP withdrawal, durable mUSDC receipts, and settling/failed states.
- **Managed Predict:** official Mysten source at commit
  `b63a565c6f867103553557912f87ef35574eef42`, four authorized BTC oracles, direct object/devInspect
  reads, and Sui GraphQL manager-event discovery.

## Settlement rails

- **dUSDC:** the real DeepBook Predict quote asset. It is faucet-gated, scarce, and used for PLP,
  range positions, and funded terminal notes. PLP can lose value; no principal guarantee is made.
- **mUSDC:** Pelagos testnet collateral used for isolated simulation receipts. It does not create
  PLP ownership or dUSDC rights. There is no swap or peg between the two units.
- Both rails use live DeepBook reference pricing where a Predict payoff is modeled, but they have
  separate custody and settlement lifecycles.

## Verification completed

- Frontend lint and production build pass.
- Backend TypeScript build passes.
- Structured math: 25/25, including 500 randomized terminal schedules and 500 randomized PLP
  balance sheets.
- Yield/note API reconciliation: 94/94.
- API: 19/19; robustness: 24/24; PPN maturity lock: 5/5.
- Predict Move: 34/34; vendored DeepBook Move: 360/360.
- Frontend and backend dependency audits: zero known vulnerabilities.
- Live testnet yield/note transaction audit: 7/7.
- Exact Docker candidate production-testnet preflight: GO.
- Akash SDL converts successfully and includes persistent `/app/state` storage.

## Morning release gate

1. Reject or close the two stale Slush approval windows left from the browser audit.
2. Complete fresh signed-wallet flows for mUSDC/dUSDC yield, terminal notes, and mUSDC autocall.
3. Redeploy Akash from the pinned digest while preserving `/app/state`; do not run two oracle-feed
   writers.
4. Deploy the frontend and run strict public `npm run check:demo` with feed advancement enabled.
5. Recheck Portfolio positions and all Range Strips surfaces in Chrome.

## Run and verify

```bash
# Backend
cd backend
npm run dev

# Frontend (from repository root)
npm run dev

# Release checks
npm run lint
npm run build
cd backend
npm run build
npm run test:structured
npm run test:yield-notes
```

Optional live writes are guarded and documented in `DEMO_RUNBOOK.md`; they spend testnet assets.

## Important files

- Product UI: `app/app/deepbook/page.tsx`
- Portfolio: `app/app/portfolio/page.tsx`
- Yield engine: `backend/src/services/deepbook-yield.ts`
- Note allocation: `backend/src/services/notes-allocation.ts`
- Payoff math: `backend/src/services/structured-payoffs.ts`
- Predict transaction builders: `backend/src/services/predict/structured.ts`
- Direct Predict server: `backend/src/services/predict/onchain-server.ts`
- Durable receipts: `backend/src/services/sim-settlement.ts`
- Managed deployment manifest: `backend/config/predict-managed.testnet.json`
- Akash SDL: `deploy/akash/deploy.yaml`

## Credentials

Runtime secrets stay in gitignored environment files and deployment secret fields. Never commit
private keys. Public package IDs, object IDs, cap object IDs, and transaction digests are recorded in
`DEPLOYMENT.md` and the managed deployment manifest for reproducibility.
