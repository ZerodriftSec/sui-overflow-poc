module stablecoin::pusd;

use sui::coin::{TreasuryCap, Coin, create_currency};
use sui::tx_context::TxContext;
use sui::transfer;
use sui::event::emit;
use std::option::none;

public struct PUSD has drop {}

public struct CoinMinted has copy, drop { minter: address, to: address, amount: u64 }
public struct CoinBurned has copy, drop { burner: address, from: address, amount: u64 }

const EZeroAmount: u64 = 0;

#[allow(deprecated_usage)]
fun init(witness: PUSD, ctx: &mut TxContext) {
    let (treasury_cap, metadata) = create_currency(witness, 6, b"PUSD", b"PUSD", b"", none(), ctx);
    transfer::public_freeze_object(metadata);
    transfer::public_share_object(treasury_cap);
}

public fun mint(treasury_cap: &mut TreasuryCap<PUSD>, to: address, amount: u64, ctx: &mut TxContext) {
    assert!(amount != 0, EZeroAmount);
    let minter = ctx.sender();
    let coin = treasury_cap.mint(amount, ctx);
    transfer::public_transfer(coin, to);
    emit(CoinMinted { minter, to, amount });
}

public fun burn(treasury_cap: &mut TreasuryCap<PUSD>, coin: Coin<PUSD>, ctx: &mut TxContext) {
    let amount = coin.value();
    assert!(amount != 0, EZeroAmount);
    let from = ctx.sender();
    let burner = from;
    treasury_cap.burn(coin);
    emit(CoinBurned { burner, from, amount });
}