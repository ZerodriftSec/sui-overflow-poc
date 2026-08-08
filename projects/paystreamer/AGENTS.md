# PayStreamer

## Workspace Structure

```
apps/
  docs/          # Documentation site
  scheduler/     # Scheduler backend
packages/
  sdk/           # React SDK
paystreamer-service/  # Gas sponsor service (Node.js)
src/             # Vite + React frontend
move/
  subscriptions/ # Move smart contract package
  stablecoin/   # PUSD stablecoin package
scripts/
  v2/           # Deployment and seeding scripts (config.ts is gitignored)
```

## Key Commands

```bash
# Frontend (Vite, not Next.js)
pnpm dev --port 5176 --host 0.0.0.0
pnpm build

# Codegen (regenerate TypeScript types from Move contracts)
pnpm codegen

# Move contracts
cd move && sui move test
cd move/subscriptions && sui move build

# Workspace build + test verification
pnpm test           # Runs verify-builds.sh (packages/sdk + apps/docs build + vitest)
pnpm test:move      # cd move && sui move test
pnpm test:sdk       # cd packages/sdk && npx vitest run
pnpm test:e2e       # cd apps/docs && npx playwright test

# E2E (uses localnet via docker compose, not devnet)
pnpm e2e            # Full payment cycle: deploy, seed, execute

# Seed demo platform (idempotent)
pnpm seed:demo

# Lint (checks for placeholder/fake implementations)
pnpm lint:no-fakes
```

## Environment Variables

- **Vite**: Use `import.meta.env.VITE_*` NOT `process.env`
- `.env` file in project root for Vite env vars
- `VITE_NETWORK` selects network: `"local" | "devnet" | "testnet"`

## SDK Patterns

### Transaction Building
- `build({ client, onlyTransactionKind: true })` — kind bytes only (no gas)
- `Transaction.fromKind(kindBytes)` — reconstruct from kind bytes
- `transaction.build({ client })` — full build with gas resolution
- `Transaction.from(fullBytes)` — for full transaction bytes (NOT kind bytes)

### Signing
- `keypair.signTransaction(bytes)` → `{ signature: string, bytes: Uint8Array }`
- `keypair.signTransaction(bytes).signature` — base64 signature string
- dAppKit `signTransaction({ transaction })` — accepts Transaction object, NOT raw bytes

### Client Methods
- `client.getCoins({ owner, coinType })` — returns coins with `coinObjectId` field
- `client.executeTransactionBlock` — NOT `executeTransaction`

## Deployment IDs

All deployment-specific IDs live in `src/constants.ts`. Update on every redeployment.

## Sponsored Transaction Flow

1. Frontend builds tx, sets `gasOwner` to sponsor address
2. Frontend calls `dAppKit.signTransaction({ transaction: txObject })`
3. Wallet rebuilds internally (with gas resolution), signs
4. Frontend sends `{ bytes, userSignature, userAddress }` to backend `/sponsor`
5. Backend fetches sponsor's gas coin, builds full tx, signs with sponsor key
6. Backend executes: `executeTransactionBlock({ transactionBlock: bytes, signature: userSig + sponsorSig })`

## Sponsor Keypair (Backend)

Stored in `.env` as hex-encoded bech32 string: `SPONSOR_PRIVATE_KEY=73756970...`

Decode pattern in `paystreamer-service/src/lib/sui.ts`:
```ts
const bech32Key = Buffer.from(SPONSOR_PRIVATE_KEY, 'hex').toString('utf8');
const { secretKey } = decodeSuiPrivateKey(bech32Key);
```

## Persistent Burner Wallet

Keypair persisted to LocalStorage (`paystreamer_burner_sk`). Auto-connects on reload.
See `src/lib/persistentBurnerWallet.ts`.

## Common Errors

- **"Invalid typed array length"** — `Transaction.from()` on kind bytes; use `Transaction.fromKind()` instead
- **"Cannot find gas coin"** — Gas model flaky; use explicit gas coin via `setGasPayment([{ objectId, digest, version }])`
- **"process is not defined"** — Using `process.env` in Vite browser code; use `import.meta.env.VITE_*`

## Move Contract Notes

- Contract source: `move/subscriptions/sources/`
- Modules: `account`, `asset`, `billing`, `payment`, `platform`, `policies`, `registry`, `scheduler`, `version`, `ac`
- `record_payment` lives in `subscription_account` module, called by `platform_registry::process_withdrawal`
- `PlatformOwnerCap` is the only platform capability
- On contract changes: **full redeployment from scratch** (no upgrades)

## Skills

Load before Sui work:
```sh
npx skills https://github.com/MystenLabs/skills
```

Key skills: `sui-move`, `ptbs`, `frontend-apps`, `sui-object-model`, `sui-publish`

## Architecture & Centralized SDK Rules

- **Single Source of Truth**: `@paystreamer/sdk` is the ONLY package authorized to execute smart contract calls, build PTBs, or run GraphQL queries. Client applications (`apps/docs`, `apps/portal`, `apps/checkout`) MUST NOT contain standalone GraphQL scripts or contract codegen.
- **GraphQL & RPC Endpoints**: Localnet GraphQL endpoint is on `http://127.0.0.1:8000/graphql` (port 8000), while JSON-RPC is on `http://127.0.0.1:9000` (port 9000). Always map local network names to `'localnet'` for `SuiGraphQLClient` and `'sui:local'` for dAppKit wallet accounts.

## Testing Architecture & Decisions

All blockchain-interacting apps must have automated unit & E2E tests in localnet (docker compose).
`pnpm build` (or `tsc --noEmit`) is required after code changes before declaring work done.

**Automated Testing Matrix:**
1. **SDK Unit & Integration Tests (`pnpm test:sdk`)**: Vitest suite in `packages/sdk` covering core SDK transaction builders, formatters, React hooks, UI components, and Next.js sponsor API handler mocks.
2. **Browser E2E Testing Strategy (`pnpm test:e2e`)**:
   - To test the SDK inside client applications effectively, we use **Playwright with a Persistent Burner Wallet**.
   - Bypasses Chrome extension automation complexity while testing real dAppKit wallet connection and transaction signing flows.
   - The Burner Wallet (in `src/lib/persistentBurnerWallet.ts`) uses a deterministic secret key in `localStorage` (`paystreamer_burner_sk`).
   - Shadow DOM Web Components (`<mysten-dapp-kit-connect-modal>`) are interacted with via `page.evaluate()` shadow root element selection to ensure robust cross-browser click dispatching.
   - Playwright is orchestrated inside `pnpm e2e` (`ci/e2e.sh`) to ensure localnet is seeded with test platforms before running browser testing across `apps/docs` and `apps/portal`.
   - `apps/portal` Playwright test suite (`apps/portal/tests/e2e/user-flow.spec.ts`) covers the entire user lifecycle (burner wallet connection, PUSD minting, platform registration, tier management, subscription creation, and deposit/withdrawal flows).

### Strict E2E Testing Rules (MANDATORY)
**Before writing, modifying, or executing any E2E tests**, all agents MUST read and strictly adhere to the rules defined in [E2E_TESTING_RULES.md](./E2E_TESTING_RULES.md). 
**Crucially, no test build or run is permitted to proceed without the agent first explicitly evaluating and confirming that the test is actually useful** (i.e., verifying it would fail if the application rendered a blank screen). Do not bypass this evaluation.
