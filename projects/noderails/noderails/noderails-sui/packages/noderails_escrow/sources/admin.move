/// Admin controls — pause, full stop, role updates.
module noderails_escrow::admin;

use noderails_escrow::config::{Self, EscrowConfig};

public fun set_fee_recipient(
    config: &mut EscrowConfig,
    fee_recipient: address,
    ctx: &TxContext,
) {
    config::set_fee_recipient(config, fee_recipient, ctx);
}

public fun set_transaction_authorities(
    config: &mut EscrowConfig,
    keys: vector<address>,
    ctx: &TxContext,
) {
    config::set_transaction_authorities(config, keys, ctx);
}

public fun set_authorized_noderails_keys(
    config: &mut EscrowConfig,
    keys: vector<vector<u8>>,
    ctx: &TxContext,
) {
    config::set_authorized_noderails_keys(config, keys, ctx);
}

public fun pause(config: &mut EscrowConfig, ctx: &TxContext) {
    config::pause(config, ctx);
}

public fun unpause(config: &mut EscrowConfig, ctx: &TxContext) {
    config::unpause(config, ctx);
}

public fun full_stop(config: &mut EscrowConfig, ctx: &TxContext) {
    config::full_stop(config, ctx);
}

public fun lift_full_stop(config: &mut EscrowConfig, ctx: &TxContext) {
    config::lift_full_stop(config, ctx);
}
