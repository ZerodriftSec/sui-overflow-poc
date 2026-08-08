# Sui Next Demo

## Project Structure

- `move/` — Move smart contracts
  - `move/subscriptions/sources/` — Contract source modules
  - `move/subscriptions/tests/` — Contract integration tests
- `src/` — Frontend application (TypeScript/React)
- `docs/` — Project documentation

## Sui Development Skills

Install community-maintained skills for Sui development:

```sh
npx skills https://github.com/MystenLabs/skills
```

## Sui SDK Reference

Every `@mysten/*` package ships LLM documentation in its `docs/` directory. When working with these packages, find the relevant docs by looking for `docs/llms-index.md` files inside `node_modules/@mysten/*/`. Read the index first to find the page you need, then read that page for details.

## Official Resources

When unsure about Move patterns or Sui APIs, consult these sources. Do not guess or extrapolate from other blockchains.

- Move Book: https://move-book.com (use https://move-book.com/llms.txt)
- Sui Docs: https://docs.sui.io (use https://docs.sui.io/llms.txt)
- Sui Move examples: https://github.com/MystenLabs/sui/tree/main/examples/move

## Project Rules

- Build contracts with `cd move/subscriptions && sui move build`
- Run tests with `cd move/subscriptions && sui move test`
- Use `suiperpower` skill for debugging: `/suiper:debug-move`
- The subscription contract uses embedded `Subscription` structs in `SubscriptionAccount<VecMap<platform_id, Subscription>>` — not standalone objects
- `PlatformOwnerCap` is the only platform capability — `PlatformCap` was removed
- `record_payment` lives in `subscription_account` module and is called by `platform_registry::process_withdrawal`
- During this stage, any changes to the smart contracts should result in a full redeployment from scratch without attempting to upgrade the old package.

## Constants Management

- **Centralize all constants** — do NOT use V1_, V2_, V3_ prefixes. All deployment-specific IDs live in `src/constants.ts`
- When a new deployment is made, update the constants in `src/constants.ts` and rebuild (no historical versions)
- Scripts use `scripts/v2/config.ts` which is gitignored (contains deployment-specific IDs per environment)

## PTB Development

- **Test PTB inferences in shell** before writing code — use `sui client ptb` or SDK to dry-run
- Load the `ptbs` skill for PTB patterns, `sui-move` for Move API reference
- Key files: `src/components/subscriptions/*.tsx` and `src/components/platform/*.tsx` for transaction builders
- When debugging: verify exact function signatures against Move source, not assumptions
## Project Context
check ./suiperpower/

always keep ./suiperpower/build-context.md up to date.