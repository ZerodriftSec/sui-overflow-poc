# Pelagos — Live Testnet Deployment (2026-07-18)

Fresh from-scratch deployment under a dedicated wallet. Sui **testnet** (chain `4c78adac`).

## Live hosting
- **Frontend:** <https://pelagos-sui.vercel.app> (Vercel).
- **Backend:** non-custodial API on **Akash Network** (container image
  `ghcr.io/tharune/pelagos-backend`, built by GitHub Actions). The frontend reaches it via
  `NEXT_PUBLIC_BACKEND_URL`; the public Akash ingress host is lease-bound (changes if the lease moves).
- **Prepared backend image (not yet deployed):** merge `17e14cf9a84e4ab1f6fd656cc99f84fc7c982bf4`
  published OCI index `sha256:3f64ada5324b855028fcfd29b9065dbd28a433a8e3c300da34884c04ecec5baf`
  with linux/amd64 payload `sha256:fe0f92bbc8be22da315822e6526fba2515561ab2738bf3d0f91ba01a2541fd63`.
  The Akash SDL is pinned to the index digest; the live lease remains unchanged until redeployment.
- **Database:** Supabase (bundles / positions persistence).

## Deployer / operator wallet
- **Address:** `0xcad0f800f44a48360c01e9fa2d21e779bd829cb60e7220227ed16bb74d4d73e5`
- Key in `backend/.env` (`SUI_PRIVATE_KEY`, gitignored) + CLI keystore. Funded with testnet SUI.

## Pelagos packages (published this deploy)
| Thing | ID |
|---|---|
| `pelagos_sui` package (mock_usdc + prediction_market) | `0x598434be38a69bf97b70490d320a698445990de38eb36e2f4c9d41dbe1ff3e45` |
| `mock_usdc::Faucet` (shared, permissionless mint) | `0xd1f67a0ec1d4b26631fcd1810f16bbc0fdf88a83cfe04c26ad400566528a07f0` |
| `MOCK_USDC` type | `0x598434be…3e45::mock_usdc::MOCK_USDC` (6 dp) |
| `prediction_market::AdminCap` | `0x0c14a699335427625eb7317cd16e758f201b8a0413d58fd0592b20e761597c4b` |
| `pelagos_vault` package | `0xcaff49f849bdf83b2df754ffc7d43c07b19ee33c2395255185607b55802e2b19` |
| `Vault<MOCK_USDC>` (shared) — baskets / freely-testable | `0x5fdc7d7a94d1dc7ae459b2e3f6760cb3b6745e6c3e4f2eed511da54bd0042d2d` |
| `VaultAdminCap` (MOCK_USDC vault) | `0x177582ae9cb44b119835d224d4b8d2f14aac0157d41f0931b55ebef0f66ef348` |
| `Vault<dUSDC>` (shared) — Predict-backed PPN/tranche wrappers | `0x9110df6651807391a65f060a5c1fb0cfecf3163ecb11d879e1aa552f1868c54a` |
| `VaultAdminCap` (dUSDC vault) | `0xeecb761376a03d5d875846886905af59ebd418150666666102806e54fe7f843f` |

## DeepBook Predict (Pelagos-operated deployment of official Mysten code)
| Thing | ID |
|---|---|
| Predict package | `0xf5716c88594bb34e89350717bc5938b0879f63262eedcb8cb1064d512563cb34` |
| Predict object (market root) | `0xc075248dc9e51527229564e37416d816e01df046ba77ce167151362a74fa9794` |
| Registry | `0xee273bfcfe17308125be540999d9a96348d5c6a7d62c93403342814ffdebba2c` |
| Oracle operator cap | `0xc98d88f907b50886eb2cd1fdf4ebe86273ac5071e970d800cba450e828247bf3` |
| dUSDC type (Predict quote, faucet-gated) | `0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC` |
| Contract source | MystenLabs/deepbookv3 `predict-testnet-4-16` @ `b63a565c6f867103553557912f87ef35574eef42` |
| Read path | Direct Sui gRPC object reads + `devInspect` |
| Oracle market data | Deribit public API → Pelagos `OracleSVICap` → Sui |
| dUSDC faucet (manual) | https://tally.so/r/Xx102L |

The Mysten public Predict server and its original BTC oracles remain unavailable/stale and are not
runtime dependencies. Pelagos vendors and deploys the exact official testnet branch, operates the
authorized oracle feed, and exposes the same API shapes from direct on-chain reads.

## Collateral model
- **dUSDC** (`0xe95040…::dusdc::DUSDC`, 6 dp) — the ONLY asset DeepBook Predict accepts. Used for every Predict leg (distribution range strips, PLP supply for the PPN floor, Predict-backed tranches). **Faucet-gated and not mintable by us** — its TreasuryCap is Mysten's. The managed Predict PLP vault was seeded with **500 dUSDC**, and the operator keeps a finite test-fund float. Top up via https://tally.so/r/Xx102L.
- **MOCK_USDC** — freely mintable via the shared `Faucet` (`faucet`/`mint`, ≤1,000,000/call). Used for Pelagos's own contracts (Polymarket baskets, vault flows) so testing/demos are never bottlenecked. **Cannot** be a Predict quote (protocol AdminCap required to register a quote).
- **DEEP** (`0x36dbef86…::deep::DEEP`) — **NOT used by our integration.** DEEP is DeepBook v3's CLOB fee token; DeepBook **Predict** is an AMM/PLP-backed range protocol that settles purely in dUSDC. Verified on-chain: a live range mint consumed **0 DEEP** (only dUSDC + SUI gas). We never place v3 CLOB orders (the only order books we touch are Polymarket's, for baskets; the BTC mark is a read), so no DEEP is required or seeded. The package exposes no public mint anyway. The ~1.5 DEEP in the operator wallet is incidental and unused.

## Test funds — in-app faucets
- **Header "Test funds"** (top bar, when a wallet is connected): one click sends the connected wallet **25 dUSDC** (Predict products, from the operator float) + **10,000 mUSDC** (vault/basket products, freshly minted) + **3 SUI** for gas in one operator-signed transaction. `POST /api/dev/faucet`.
- Each Predict surface also shows a contextual **"Get test dUSDC"** when the wallet is short.
- Both currencies are wired end-to-end: Predict surfaces read/gate **dUSDC** (`useDusdcBalance`); vault/basket surfaces read/gate **mUSDC** (`useUsdcBalance`).

## Verified on-chain
- `pelagos_sui` + `pelagos_vault` published; both `sui move test` green (2/2 each).
- mock_usdc `faucet` minted 1,000,000 mUSDC (CLI) + backend service minted +12,345 (digest `Gi1JgvinJLRi2tGNfi9UQx6zH82AmXF9zriDmuVMyGh4`) → balance 1,012,345 mUSDC.
- `Vault<MOCK_USDC>` + `Vault<dUSDC>` created and shared.
- Vendored Predict source matches the official commit above; **34/34 Move tests pass**.
- Managed Predict publish ✅ digest `4KkePUu1n2UASrCQqobADyaauxZ7Taq5U7DPfc4TcuFE`.
- Predict initialize ✅ digest `FR7QTiTGobkiNVbDPniMse688MnihdhsB8gdj3Yt16UX`.
- Four BTC expiry oracles created and activated; the backend refreshes price + SVI every 10 seconds
  and retries a failed push after 3 seconds.
- PLP vault seeded with 500 dUSDC ✅ digest `D8HpwRaYMeCA3bBADFrNNA2hBEubmjRwUjsYrPsgja63`.
- Direct on-chain reads and `get_(range_)trade_amounts` simulations return live non-zero quotes without
  `assert_quoteable_oracle` abort code 6.

## Managed Predict E2E — VERIFIED on-chain (2026-07-18)
Operator manager: `0x922267855cf2d90278f4373cc23c6d69a1fb53129fe5daa322c647707aa72251`
- `create_manager` ✅ digest `GjZ4Uad7UxcFrSrRg6nznj99UWsRKNxxUewpBB67FVpf`.
- **binary mint** ✅ digest `EpBWyMNjPb85NjZkixgo98PMJJ4mxfUwLuUzeHP8gN59`.
- **binary redeem** ✅ digest `B8Sc97CQGaJ6KpgsKqbBHpJZg5jRH7o9VcMcxYzwNRix`.
- **four-bucket range strip open** through the HTTP prepare/execute path ✅ digest
  `8fL7AogF5gMxrtvMhf5SohHepXb8zbWuMpiB1jibp2DQ`.
- **four-bucket range strip redeem** ✅ digest
  `HVJcwpi2F7ovQAY7p13j1uEmEW2QrkWY2AfLGMt3bRzb`.
- Direct object reads confirmed the exact opened quantities and then zero remaining quantity in every
  leg after redemption. API, robustness, production build, and on-chain verification suites pass.
- Pricing uses real MM ask/bid + size-dependent slippage from `get_(range_)trade_amounts`; the
  `[2%, 98%]` mintable-band and vault-capacity guards reject orders the on-chain pool cannot honor.

## Judge / E2E testing — funding the operator
The whole product is **non-custodial**: the judge connects their OWN wallet and signs.
They need two assets:
- **SUI for gas** — free from `sui client faucet` / faucet.sui.io. Not a bottleneck.
- **dUSDC** — the ONLY asset DeepBook Predict settles in, and it is **faucet-gated**
  (its TreasuryCap is Mysten's — it cannot be minted like mUSDC).

So the app ships an **in-app dUSDC faucet**: every Predict surface (Distribution,
Volatility, PPN, Tranche, PLP) shows a **"Get test dUSDC"** button when the connected
wallet is short. It transfers a 25-dUSDC grant from the operator float
(`POST /api/dev/airdrop-dusdc`, operator-signed) so anyone can run the full flow without
the manual DeepBook form. Proven to a fresh wallet: digest `8hTzz3yvUmjACoTJLbX8EvDcsSdz3Nsbp9fxwEFssNh7`.

**To keep it topped up, send testnet funds to the operator:**
`0xcad0f800f44a48360c01e9fa2d21e779bd829cb60e7220227ed16bb74d4d73e5`
- **dUSDC** (the float the faucet hands out, ~25/grant): request to that address via
  https://tally.so/r/Xx102L. This is the one worth topping up for a judging session.
- **SUI** (operator dispenser/faucet gas, ~0.003/grant): a couple of SUI is plenty.
- mUSDC is freely minted on demand (vault/basket products), no top-up needed.
