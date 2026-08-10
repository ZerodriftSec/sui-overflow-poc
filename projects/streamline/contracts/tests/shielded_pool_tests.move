#[test_only]
module streamline::shielded_pool_tests;

use streamline::shielded_pool as sp;
use sui::sui::SUI;
use sui::test_scenario as ts;

// Real shielded.circom spend proof (circuits/build/shielded). Input note `CM`
// spent → outputs CM1 (700) + CM2 (300 change), at Merkle ROOT with nullifier NF.
const CM: u256 = 15631003549215301019470602651310934894295032153856254889966326769454881420973;
const ROOT: u256 = 19392926230302248684238529380745693383013750206194861007862957776529124887687;
const NF: u256 = 11344094074881186137859743404234365978119253787583526441303892667757095072923;
const CM1: u256 = 14954914788526847144927287337968275886010723779252159299403375482666718272196;
const CM2: u256 = 11505431647609683431487222621883257220057623866471806056009481172783079050935;
const PROOF: vector<u8> = x"bf6e498da658600e8b7176676d1e4a620b6cee1dc0eaf704493351664e9e69a158126072ff39ecf01862a6439984048cc1aefb69281b2395acb6e9060a171412c44694bd8da07a406c1619fbd5c809084009e8121bdc414093f5e32545547e130e8eff00fb187d5628160011e4f7ead2eb421ba3f2f4a80c5277f9728fcab593";

#[test]
fun spend_verifies_and_guards_double_spend() {
    let mut scen = ts::begin(@0x1);
    sp::create_pool<SUI>(ts::ctx(&mut scen));
    ts::next_tx(&mut scen, @0x1);
    {
        let mut pool = ts::take_shared<sp::ShieldedPool<SUI>>(&scen);
        // Put the input note in the tree so ROOT is known.
        sp::deposit_note_for_testing(&mut pool, CM);
        assert!(sp::current_root(&pool) == ROOT, 0);

        // Confidential transfer — real proof verifies on-chain.
        sp::spend<SUI>(&mut pool, ROOT, NF, CM1, CM2, PROOF);
        assert!(sp::is_spent(&pool, NF), 1);

        ts::return_shared(pool);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = streamline::shielded_pool::ENullifierUsed)]
fun rejects_double_spend() {
    let mut scen = ts::begin(@0x1);
    sp::create_pool<SUI>(ts::ctx(&mut scen));
    ts::next_tx(&mut scen, @0x1);
    {
        let mut pool = ts::take_shared<sp::ShieldedPool<SUI>>(&scen);
        sp::deposit_note_for_testing(&mut pool, CM);
        sp::spend<SUI>(&mut pool, ROOT, NF, CM1, CM2, PROOF);
        // Same nullifier again ⇒ double-spend ⇒ abort.
        sp::spend<SUI>(&mut pool, ROOT, NF, CM1, CM2, PROOF);
        ts::return_shared(pool);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = streamline::shielded_pool::EUnknownRoot)]
fun rejects_unknown_root() {
    let mut scen = ts::begin(@0x1);
    sp::create_pool<SUI>(ts::ctx(&mut scen));
    ts::next_tx(&mut scen, @0x1);
    {
        let mut pool = ts::take_shared<sp::ShieldedPool<SUI>>(&scen);
        // Never deposited CM ⇒ ROOT is not a known root ⇒ abort.
        sp::spend<SUI>(&mut pool, ROOT, NF, CM1, CM2, PROOF);
        ts::return_shared(pool);
    };
    ts::end(scen);
}

// --- Phase 2 deposit / withdraw (real proofs) ---
const DEP_CM: u256 = 6149253254146721306107722250305594789511420025387089387585842753628582058027;
const DEP_PROOF: vector<u8> = x"7d2fd87953870048d35636b249d5a60a7f8cfa1aca8b4b3f33b7ce1aead678820023875e205cb8ccd9270d611452aea27631d1f122217d5a56064c0b86383d1f1b4506d39d9ff9298fa409315d2bdfc811cd37915b373b832d03a0075a7732111d1ab895c790dfacf1545f31d513d108632bdf2231ff00f4e68e71a71eb0c720";
const WD_CM_INPUT: u256 = 15631003549215301019470602651310934894295032153856254889966326769454881420973;
const WD_ROOT: u256 = 19392926230302248684238529380745693383013750206194861007862957776529124887687;
const WD_NF: u256 = 11344094074881186137859743404234365978119253787583526441303892667757095072923;
const WD_AMOUNT: u64 = 600;
const WD_CM_CHANGE: u256 = 3731997361646125137683626062338104831463539406342047089190079686375395905813;
const WD_PROOF: vector<u8> = x"f08c1cbe778007620b565b02dc287f07631f931f612488d847ef23b84642799aa6de64b089f8e5b88f7e4215c215a0c8959a57327d2d13e4faf4503b4c49ce2b889263f2047ab0d89e3fd93ae296223dcbb6065bad9611e2e5fe1c02c6ef7494052e7dd6b2ce8f3de7670a1b44319e009d2b1c2ebbad56fc5c893287c0ae9c80";

#[test]
fun deposit_binds_note_to_amount() {
    let mut scen = ts::begin(@0x1);
    sp::create_pool<SUI>(ts::ctx(&mut scen));
    ts::next_tx(&mut scen, @0x1);
    {
        let mut pool = ts::take_shared<sp::ShieldedPool<SUI>>(&scen);
        let coin = sui::coin::mint_for_testing<SUI>(1000, ts::ctx(&mut scen));
        sp::deposit<SUI>(&mut pool, coin, DEP_CM, DEP_PROOF);
        assert!(sp::reserve_value(&pool) == 1000, 0);
        ts::return_shared(pool);
    };
    ts::end(scen);
}

#[test]
#[expected_failure(abort_code = streamline::confidential_balance::EProofInvalid)]
fun deposit_rejects_wrong_amount() {
    let mut scen = ts::begin(@0x1);
    sp::create_pool<SUI>(ts::ctx(&mut scen));
    ts::next_tx(&mut scen, @0x1);
    {
        let mut pool = ts::take_shared<sp::ShieldedPool<SUI>>(&scen);
        // Coin is 999 but the note (DEP_PROOF) binds to 1000 ⇒ proof rejects.
        let coin = sui::coin::mint_for_testing<SUI>(999, ts::ctx(&mut scen));
        sp::deposit<SUI>(&mut pool, coin, DEP_CM, DEP_PROOF);
        ts::return_shared(pool);
    };
    ts::end(scen);
}

#[test]
fun withdraw_pays_out_and_marks_nullifier() {
    let mut scen = ts::begin(@0x1);
    sp::create_pool<SUI>(ts::ctx(&mut scen));
    ts::next_tx(&mut scen, @0x1);
    {
        let mut pool = ts::take_shared<sp::ShieldedPool<SUI>>(&scen);
        sp::deposit_note_for_testing(&mut pool, WD_CM_INPUT); // note in tree ⇒ WD_ROOT known
        sp::fund_for_testing(&mut pool, sui::balance::create_for_testing<SUI>(1000));
        let out = sp::withdraw<SUI>(&mut pool, WD_ROOT, WD_NF, WD_AMOUNT, WD_CM_CHANGE, WD_PROOF, ts::ctx(&mut scen));
        assert!(sui::coin::value(&out) == 600, 0);
        assert!(sp::reserve_value(&pool) == 400, 1);
        assert!(sp::is_spent(&pool, WD_NF), 2);
        sui::coin::burn_for_testing(out);
        ts::return_shared(pool);
    };
    ts::end(scen);
}

// --- Phase 3: dual yield (pool reserve earns via the vault) ---
#[test]
fun pooled_capital_earns_yield() {
    use streamline::yield_vault::{Self as yv, YieldVault};
    use sui::clock;
    let mut scen = ts::begin(@0x1);
    let mut clk = clock::create_for_testing(ts::ctx(&mut scen));
    yv::create_vault<SUI>(1_000, &clk, ts::ctx(&mut scen)); // 10% APR
    sp::create_pool<SUI>(ts::ctx(&mut scen));
    ts::next_tx(&mut scen, @0x1);
    {
        let mut vault = ts::take_shared<YieldVault<SUI>>(&scen);
        yv::fund<SUI>(&mut vault, sui::coin::mint_for_testing<SUI>(1_000_000, ts::ctx(&mut scen)));
        let mut pool = ts::take_shared<sp::ShieldedPool<SUI>>(&scen);
        sp::fund_for_testing(&mut pool, sui::balance::create_for_testing<SUI>(100_000));

        // Invest 100k of pooled capital into the vault.
        sp::invest<SUI>(&mut pool, &mut vault, 100_000, &clk, ts::ctx(&mut scen));
        assert!(sp::reserve_value(&pool) == 0, 0);
        assert!(sp::invested_value(&pool, &vault, clk.timestamp_ms()) == 100_000, 1);

        // One year at 10% ⇒ ~110k.
        clk.increment_for_testing(31_536_000_000);
        let iv = sp::invested_value(&pool, &vault, clk.timestamp_ms());
        assert!(iv >= 109_000 && iv <= 111_000, 2);

        // Divest brings principal + yield back to idle.
        sp::divest<SUI>(&mut pool, &mut vault, &clk, ts::ctx(&mut scen));
        assert!(sp::reserve_value(&pool) >= 109_000, 3);

        ts::return_shared(vault);
        ts::return_shared(pool);
    };
    clock::destroy_for_testing(clk);
    ts::end(scen);
}
