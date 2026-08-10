import { PACKAGE_IDS, TEST_USDC, type NetworkName } from "./constants";

/**
 * The exact set of Move call targets the Enoki sponsor is willing to pay gas
 * for. Scoping sponsorship to StreamLine's own entry functions (plus the testnet
 * faucet) prevents the sponsor key from being drained on arbitrary transactions.
 */
const STREAM_FUNCTIONS = [
  "create_stream",
  "create_stream_v2",
  "create_stream_v3",
  "create_stream_from_treasury_v2",
  "drip_with_yield",
  "raise_completion",
  "approve_milestone",
  "start_payroll",
  "cancel",
  "cancel_to_treasury",
  "drip",
  "raise_dispute",
  "suspend_payroll",
  "resume_payroll",
  "stop_payroll",
  "stop_stream",
  "propose_resolution",
  "accept_resolution",
  "set_splits",
  // Confidential streaming (amounts hidden, Groth16-verified on-chain).
  "create_confidential_stream",
  "create_confidential_stream_v2",
  "create_confidential_stream_from_treasury_v2",
  "confidential_drip",
  "confidential_drip_v2",
  "claim",
  "confidential_dispute",
  "conf_suspend_payroll",
  "conf_resume_payroll",
  "conf_refund_remainder_to_treasury",
  "conf_propose_resolution",
  "conf_accept_resolution",
  "conf_raise_completion",
  "conf_approve_milestone",
  "conf_auto_approve",
  "update_confidential_secrets",
] as const;

export function allowedMoveCallTargets(
  network: NetworkName,
  pkgOverride?: string
): string[] {
  // Use the package the client actually built the tx against. This route runs
  // server-side, where `STREAMLINE_PACKAGE_ID_TESTNET` can resolve to a
  // different (stale) package than the browser's `TESTNET_PACKAGE` default —
  // which would allow-list the wrong package and reject every move call.
  const pkg =
    pkgOverride && /^0x[0-9a-fA-F]{64}$/.test(pkgOverride)
      ? pkgOverride
      : PACKAGE_IDS[network];
  const targets: string[] = [];

  if (pkg && pkg !== "0x0") {
    for (const fn of STREAM_FUNCTIONS) targets.push(`${pkg}::stream::${fn}`);
    targets.push(`${pkg}::collateral::collateralize`);
    // Borrow against a stream (gasless borrow/repay).
    targets.push(`${pkg}::collateral::borrow`);
    targets.push(`${pkg}::collateral::repay`);
    // Scallop-shaped yield vault (gasless deposit/redeem).
    targets.push(`${pkg}::yield_vault::deposit`);
    targets.push(`${pkg}::yield_vault::redeem`);
    // Payment QRs (gasless scan-to-pay into a treasury pool).
    targets.push(`${pkg}::pos::pay`);
    // Org treasury / Pro pool (gasless fund/withdraw/invest/divest).
    targets.push(`${pkg}::treasury::open`);
    targets.push(`${pkg}::treasury::deposit`);
    targets.push(`${pkg}::treasury::withdraw`);
    targets.push(`${pkg}::treasury::invest`);
    targets.push(`${pkg}::treasury::divest`);
    targets.push(`${pkg}::treasury::ensure_idle`);
    // Earmarked reserve cushion (gasless park/release).
    targets.push(`${pkg}::treasury::to_reserve`);
    targets.push(`${pkg}::treasury::from_reserve`);
    // Yield adapter allow-list (native vault today; more adapters on mainnet).
    targets.push(`${pkg}::protocol_registry::create`);
    targets.push(`${pkg}::protocol_registry::approve_native`);
    targets.push(`${pkg}::protocol_registry::approve`);
    targets.push(`${pkg}::protocol_registry::revoke`);
    // Lazy confidential stream (gasless create/settle/claim).
    targets.push(`${pkg}::lazy_stream::create`);
    targets.push(`${pkg}::lazy_stream::settle`);
    targets.push(`${pkg}::lazy_stream::settle_at`);
    targets.push(`${pkg}::lazy_stream::claim`);
    // ZK gift cards (amount hidden until claim).
    targets.push(`${pkg}::giftcard::create_vault`);
    targets.push(`${pkg}::giftcard::create`);
    targets.push(`${pkg}::giftcard::claim`);
    targets.push(`${pkg}::giftcard::cancel`);
    // Shielded pool (gasless deposit/spend/withdraw + note publish).
    targets.push(`${pkg}::shielded_pool::deposit`);
    targets.push(`${pkg}::shielded_pool::spend`);
    targets.push(`${pkg}::shielded_pool::withdraw`);
    targets.push(`${pkg}::shielded_pool::publish_note`);
    // Confidential balances (Tier 1: hide amounts) — gasless wrap/unwrap/transfer.
    targets.push(`${pkg}::confidential_balance::register`);
    targets.push(`${pkg}::confidential_balance::wrap`);
    targets.push(`${pkg}::confidential_balance::unwrap`);
    targets.push(`${pkg}::confidential_balance::confidential_transfer`);
    // Private engagement (default private stream: pool + lazy vest).
    targets.push(`${pkg}::private_stream::open_engagement`);
    targets.push(`${pkg}::private_stream::open_engagement_v2`);
    targets.push(`${pkg}::private_stream::pause_engagement`);
    targets.push(`${pkg}::private_stream::resume_engagement`);
    targets.push(`${pkg}::private_stream::settle_vested`);
    targets.push(`${pkg}::private_stream::claim_exit`);
  }

  // Test-USDC faucet is only deployed (and only worth sponsoring) on testnet.
  if (network === "testnet") {
    targets.push(`${TEST_USDC.packageId}::mock_usdc::faucet`);
  }

  return targets;
}
