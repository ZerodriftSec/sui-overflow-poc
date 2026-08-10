# mUSDC Vault Fix — run once during the demo deploy

**Owner: whoever deploys (Tharun). ~30 seconds, ~0.01 SUI gas, no contract redeploy.**

## What's wrong
The configured mUSDC vault (`VAULT_OBJECT_ID=0xeb8402f9…`) is a `Vault<T>` typed for the
**retired** mock_usdc coin (`0xa630b97e…`), but the app now mints and settles the **current**
coin (`0x598434be…`). Every mUSDC vault flow — basket deposit, sim open, PPN / Protected-Notes
note+tranche — fails its `readVaultState` devInspect with:

```
CommandArgumentError { arg_idx: 0, kind: TypeMismatch }
```

dUSDC (DeepBook Predict) is unaffected. The release gate surfaces this as a **NO-GO on the
"reconciled $10 funded note"** once the backend is otherwise healthy.

## The fix (one-time)

### 2026-07-19 deployment resolution

The production operator already owns a current-coin vault. The read-only verifier confirmed:

```text
VAULT_OBJECT_ID=0x5fdc7d7a94d1dc7ae459b2e3f6760cb3b6745e6c3e4f2eed511da54bd0042d2d
VAULT_ADMIN_CAP_ID=0x177582ae9cb44b119835d224d4b8d2f14aac0157d41f0931b55ebef0f66ef348
```

The vault type is
`0xcaff49f8…::vault::Vault<0x598434be…::mock_usdc::MOCK_USDC>`, and the admin cap's
`vault_id` points to that exact shared vault. Reuse these IDs in Akash and **do not run the creator**
for this deployment.

The creation procedure below is retained only for an environment where the read-only verifier
reports an old-typed or missing vault.

From `backend/`, with the production operator key in the env (`PREDICT_SIGNER_PRIVATE_KEY`
or `SUI_PRIVATE_KEY`) and ~0.01 SUI of gas on it:

```bash
cd backend
RUN=1 npx tsx --tsconfig ./tsconfig.dev.json src/scripts/create-vault-musdc.ts
```

It calls `pelagos_vault::vault::create_vault<0x598434…::MOCK_USDC>(0, 0)` on the existing
vault package (`VAULT_PACKAGE_ID=0xa88c…`), then prints and writes into `backend/.env`
(timestamped backup kept):

```
VAULT_OBJECT_ID=0x…
VAULT_ADMIN_CAP_ID=0x…
```

Then:
1. Put those two values in the **Akash production env** (not just local `.env`).
2. Redeploy the backend.
3. Re-run the release gate (`npm run check:demo`) — the funded-note check passes.

## Verify (read-only, no writes)
```bash
cd backend && npx tsx --tsconfig ./tsconfig.dev.json src/scripts/verify-onchain-state.ts
```
Expect: `Vault is NEW-typed (0x598434). NO MISMATCH`.

## Why it's safe
- The vault is generic (`Vault<phantom T>`), so `create_vault` on the existing package yields a
  `Vault<current-coin>` — no Move redeploy.
- The old vault stays on-chain untouched; you only repoint `VAULT_OBJECT_ID` / `VAULT_ADMIN_CAP_ID`.
- mUSDC minting (faucet `0xd1f67a…`) is independent and already works.

## Already handled on `main`
- Signer fallback fix (empty `PREDICT_SIGNER_PRIVATE_KEY` → `SUI_PRIVATE_KEY`) — commit `2b99271`.
- `distribution-continuous.ts` fallback coin pinned to the current package (was the retired coin).

## Not blocking (note only)
- `VAULT_DUSDC_OBJECT_ID` is unset → dUSDC-vault requests 503. Only matters if structured products
  settle in dUSDC; the mUSDC rail is the default. Set it if you want that path live.
- Local dUSDC faucet reads the signer wallet; the dUSDC float lives in the manifest operator
  (`0xcad0…`). On production, run the backend as that operator (or pre-fund the demo wallet from the
  external DeepBook Predict faucet, per `DEMO_RUNBOOK.md`).
