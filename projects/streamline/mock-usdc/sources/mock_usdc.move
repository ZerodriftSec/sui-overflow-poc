/// Mintable test USDC for StreamLine on testnet. Six decimals, symbol "USDC".
/// The `TreasuryCap` is shared on publish, so anyone can call `faucet` to mint
/// test tokens — no rate limit, no bridge. Testnet only; do not deploy on mainnet.
module mock_usdc::mock_usdc;

use sui::coin::{Self, Coin, TreasuryCap};

/// One-time witness for the currency.
public struct MOCK_USDC has drop {}

#[allow(deprecated_usage)]
fun init(witness: MOCK_USDC, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,
        b"USDC",
        b"StreamLine Test USDC",
        b"Mintable test USDC for the StreamLine demo on Sui testnet.",
        option::none(),
        ctx,
    );
    // Freeze metadata; share the treasury so the faucet is permissionless.
    transfer::public_freeze_object(metadata);
    transfer::public_share_object(treasury);
}

/// Mint `amount` base units (1_000_000 = 1 USDC) to the caller.
#[allow(lint(self_transfer))]
public fun faucet(
    treasury: &mut TreasuryCap<MOCK_USDC>,
    amount: u64,
    ctx: &mut TxContext,
) {
    transfer::public_transfer(coin::mint(treasury, amount, ctx), ctx.sender());
}

/// Composable mint that returns the coin (for PTBs).
public fun mint(
    treasury: &mut TreasuryCap<MOCK_USDC>,
    amount: u64,
    ctx: &mut TxContext,
): Coin<MOCK_USDC> {
    coin::mint(treasury, amount, ctx)
}
