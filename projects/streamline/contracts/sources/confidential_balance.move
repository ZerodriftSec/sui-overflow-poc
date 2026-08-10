/// Confidential balances for StreamLine — amounts hidden, correctness enforced
/// by Groth16 (BN254) verified on-chain via `sui::groth16` (the testnet/mainnet
/// native). A `ConfidentialPool<T>` holds a public reserve of real coins; who
/// owns how much is a table of **commitments** (Poseidon(value, blinding), one
/// 32-byte field element each). Every balance change carries a zk proof:
///   - wrap:     deposit a public Coin, bind it to a commitment of its value
///   - transfer: move a hidden delta; proof enforces conservation + no underflow
///   - unwrap:   reveal a value and prove it opens your commitment, then withdraw
///
/// The verifying keys are the production circuits in `circuits/` (build via
/// circuits/scripts/build.sh; bytes from circuits/converter).
module streamline::confidential_balance;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::groth16::{Self, bn254};
use sui::table::{Self, Table};

// === Errors ===
const EProofInvalid: u64 = 0;
const EAccountExists: u64 = 1;
const ENoAccount: u64 = 2;
const EInsufficientReserve: u64 = 3;
const EBadCommitment: u64 = 4;

/// A BN254 scalar / Poseidon commitment is 32 bytes (little-endian).
const SCALAR_LEN: u64 = 32;

// === Verifying keys (per circuit; depend only on the circuit, not the witness) ===
const WRAP_VK: vector<u8> =
    x"1d8e4233c3c66ab59c2b3c265a2886837b80219952150d8f2e8bf26fb6dce2aac4c97bbe7457d570a27e0306ebde64269e0a9fd5a9bb0cb070a2824c0b65e710daeb07e8f409c3bd2a195bca7638955741c4590f5d98465d1a6481a2896f6006edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e1998447bbbeddc2ab57f1ec3df3725f5229dcf84b0c4b8a69269616841fd0d101402cf73bc38a6bf326831b3397837d8b50a9c1ca50997439ae23c92d5cdbc1c150300000000000000fa79096d22e37a607c8fb58319dbce0c2e34225163ea33dc71f6bf6e1ff26c99f91a01e098b7476894981a900d771285e8fc6b85106098a216d7204226ec0eb06260e372e904ed13d7793c40283242d8c382466e348c10c6f4992bfdb51674aa";
const TRANSFER_VK: vector<u8> =
    x"1d8e4233c3c66ab59c2b3c265a2886837b80219952150d8f2e8bf26fb6dce2aac4c97bbe7457d570a27e0306ebde64269e0a9fd5a9bb0cb070a2824c0b65e710daeb07e8f409c3bd2a195bca7638955741c4590f5d98465d1a6481a2896f6006edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e195767429f909fa9d9627afbb1166c6459625be9b20b0f4e7b5b81afcbfb187624313090e9b38c811b713adaf4da87a519f6c3628b0cbddbbb80567ecfa5faf6280500000000000000c0a9bbb59dd39ee783f7aa64cf28573442b5e08e4372e718046464dcd698501ca6342fbcd957ecf0b9f5995b423194a24f6e0fff2dad01e9dd83cc12db9e0e96e0479f3eff27e39639b45f5bffa23f37126e117423219779346515fd53980787fd4d3b9facc8d3162513617a23beeeb9c4e428dfe2e7f1422d5139b60e1f1e83ecebb66c32f3a4121e3355ea1e8b9ab8014300f6627c2b610563b16fdfd707b0";
const UNWRAP_VK: vector<u8> =
    x"1d8e4233c3c66ab59c2b3c265a2886837b80219952150d8f2e8bf26fb6dce2aac4c97bbe7457d570a27e0306ebde64269e0a9fd5a9bb0cb070a2824c0b65e710daeb07e8f409c3bd2a195bca7638955741c4590f5d98465d1a6481a2896f6006edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e19381df03f0666a2752f41a9a55ec66c83273e202b44a2765451bb1827b9ecf10011444f8bd0847dc925827e020a73bb66dda252add7ae227000d56ae78704f8020300000000000000fa79096d22e37a607c8fb58319dbce0c2e34225163ea33dc71f6bf6e1ff26c99f91a01e098b7476894981a900d771285e8fc6b85106098a216d7204226ec0eb06260e372e904ed13d7793c40283242d8c382466e348c10c6f4992bfdb51674aa";
const LAZYDRIP_VK: vector<u8> =
    x"1d8e4233c3c66ab59c2b3c265a2886837b80219952150d8f2e8bf26fb6dce2aac4c97bbe7457d570a27e0306ebde64269e0a9fd5a9bb0cb070a2824c0b65e710daeb07e8f409c3bd2a195bca7638955741c4590f5d98465d1a6481a2896f6006edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e198f664f71e35f7799abcd25152c4624330524d04adc9f5fbe911228888c927e0448e479cba4948cd5515423bb5d102c8ddef8210d1a1d40dfed219d1dc6e1bb0d070000000000000039ee024b175d8cd4e23b04b35fc51316f51933846e7a0f4872e0f12c9de803124ef054d45ce19357736058ff65aa06cd8a8d048846526b19d6185596159beb924390887ac23377feddedb6fd060952613f51b02a9e1d4a553de8bcc0b34634223ac9df00afaca7f48741b7ed04fed6b7dceb2aae6ea5b90359242f4c0b31750f958aad09d3c3b221635c8b7a3f653dd3c4ab41be4db3d2edcb0b11dd7f2f3727d4d3b9144e67c1df565b8af272e56ad9a68ca3fcad37d2a7f8fc434d64f9f82b6e2ccd207ed34ebef4326da52ea7488cdda789172e01d04ae31d938ad1169c2c";
const SHIELDED_VK: vector<u8> =
    x"1d8e4233c3c66ab59c2b3c265a2886837b80219952150d8f2e8bf26fb6dce2aac4c97bbe7457d570a27e0306ebde64269e0a9fd5a9bb0cb070a2824c0b65e710daeb07e8f409c3bd2a195bca7638955741c4590f5d98465d1a6481a2896f6006edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e1900c544f5b298246a28d2468e476ae1d32aa07b756cb8a1674bb34f59bb81de20a6f70f9eb9888a8b4c62854ba6aa134143de9df1fef9707e5eb14e22792035960500000000000000d08fc11730aa4db78afb230b883361fe7b0bacf46c4cfcd88c327ce2c616d72d4700670fde3a1c61b990175b5ba6b0ee8d296fccdf73f91d63dbbe9d68a3160d0a39682f629cb96ec181d253db753666f8ae634d8d4fc53dd51e90b64b88eb1c4ff1118c81a39898a075a5bd175104236302aabb388d1336a8b1fa1322e4232273cef398dad01094ef1756407eca4f85493649947300a9fb18972cef67ddac99";
const DEPOSIT_VK: vector<u8> =
    x"1d8e4233c3c66ab59c2b3c265a2886837b80219952150d8f2e8bf26fb6dce2aac4c97bbe7457d570a27e0306ebde64269e0a9fd5a9bb0cb070a2824c0b65e710daeb07e8f409c3bd2a195bca7638955741c4590f5d98465d1a6481a2896f6006edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e1963a702cd10ce6fbda7719b1fb13ff1c022eecebd01bb9128ab3ef5881944ea2b83e30c3136d9ac2a3db8dcbbfc2af49f528b8cc128c77a0fef02c6383d39ac0d03000000000000009371faaef65ef8934aee0b7a8c99d2a7e56aec02a3c3f5b8cbb7e12b2709af29d9736948fdbc8f6542e71ea765ed092043691e3e494eec785cf7b9dd9e848005ab3ddbe90df4024b2db14dc2f79001e777d1bfde4a3db51478f9de9fd4164c08";
const WITHDRAW_VK: vector<u8> =
    x"1d8e4233c3c66ab59c2b3c265a2886837b80219952150d8f2e8bf26fb6dce2aac4c97bbe7457d570a27e0306ebde64269e0a9fd5a9bb0cb070a2824c0b65e710daeb07e8f409c3bd2a195bca7638955741c4590f5d98465d1a6481a2896f6006edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e196e725297dab02975c2874d5dcbcb307087d800f42ea6d8eb75a0eb1f6543301ad621d9174032eff9c2eb9c697e352bf97f7fa662abb2df7b232dfae9a4f4360a0500000000000000071b4d23db5e7f30c962a7d36e4ace44902fe7da60cac9be2a9f29ba9aee38910df43c05a1d8cffa9ac5f3c37b9dbbd459818ba73baeb3eda9bf1159c8d49ca938ef6a0fedb467b3deece02a033c2832d84fdacc41c278916e519ca1d662af252af39e914d7c8269658738a3fcc6726a9acf82f01ae0a82c553d3a2610edc2981c4f04c65d835a70299c9bf7710d05d83328244d0daac5d646772a56987334a8";
/// private_settle.circom — shielded spend + lazy vesting bound.
const PRIVATE_SETTLE_VK: vector<u8> =
    x"e2f26dbea299f5223b646cb1fb33eadb059d9407559d7441dfd902e3a79a4d2dabb73dc17fbc13021e2471e0c08bd67d8401f52b73d6d07483794cad4778180e0c06f33bbc4c79a9cadef253a68084d382f17788f885c9afd176f7cb2f036789edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e1962965dd8f6990e64f8de5589e7a129d48d94a8838c90c01453f80dff18a4700a4df0f16d8ae12dd7a82a441982a673363204281cdaf2a8d7604834724cdfbf8f07000000000000004319e9de08642139194898dd2301c6829809e8ebaa5f0e43b76543faa5f0b4283ef657eeabf6f000c63a48771ad426e11edd1eafd3045ec65b3e77a3bd9b29030fe7dee78ab603241bfe11131f05102673b7fc7fe46dfcf462f08ed0fb6094109bf44c662886172280143003b1871c471e4b128dbd05b9211df69eb4da278a082945b1f6e9268af9eb4fb906202fc5b7f4ceeb270dad73c1102d6c676049862fb893d55013e034e2d6b4cbba96ce71f6cfd2d1e6893a68483c35ab53e4c5eba16509749da66b46d26961733636fa3b3bd6266d0679c4d2cd37b443e3fccee000";

// === Objects ===

/// Shared pool: a public reserve backing all confidential balances, plus the
/// commitment table (owner address → 32-byte balance commitment).
public struct ConfidentialPool<phantom T> has key {
    id: UID,
    reserve: Balance<T>,
    balances: Table<address, vector<u8>>,
}

// === Pool lifecycle ===

public fun create_pool<T>(ctx: &mut TxContext) {
    transfer::share_object(ConfidentialPool<T> {
        id: object::new(ctx),
        reserve: balance::zero<T>(),
        balances: table::new(ctx),
    });
}

// === Helpers ===

/// Verify a Groth16 proof or abort. `inputs` is the public signals as 32-byte
/// LE scalars in the circuit's signal order.
fun verify(vk: vector<u8>, inputs: vector<u8>, proof: vector<u8>) {
    let curve = bn254();
    let pvk = groth16::prepare_verifying_key(&curve, &vk);
    let public_inputs = groth16::public_proof_inputs_from_bytes(inputs);
    let proof_points = groth16::proof_points_from_bytes(proof);
    assert!(groth16::verify_groth16_proof(&curve, &pvk, &public_inputs, &proof_points), EProofInvalid);
}

/// u64 → 32-byte little-endian field scalar (matches snarkjs/arkworks).
fun u64_to_scalar(x: u64): vector<u8> {
    let mut out = vector<u8>[];
    let mut v = x;
    let mut i = 0;
    while (i < 8) {
        out.push_back(((v & 0xff) as u8));
        v = v >> 8;
        i = i + 1;
    };
    while (i < SCALAR_LEN) {
        out.push_back(0);
        i = i + 1;
    };
    out
}

fun assert_scalar(c: &vector<u8>) {
    assert!(c.length() == SCALAR_LEN, EBadCommitment);
}

// === Package-internal proof verifiers (reused by streamline::stream) ===

/// wrap.circom — proves `commitment` opens to the public `amount`.
public(package) fun verify_wrap(commitment: vector<u8>, amount: u64, proof: vector<u8>) {
    let mut inputs = commitment;
    inputs.append(u64_to_scalar(amount));
    verify(WRAP_VK, inputs, proof);
}

/// transfer.circom — proves a hidden delta moved `old_from→new_from` and
/// `old_to→new_to` with conservation + no underflow.
public(package) fun verify_transfer(
    old_from: vector<u8>,
    new_from: vector<u8>,
    old_to: vector<u8>,
    new_to: vector<u8>,
    proof: vector<u8>,
) {
    let mut inputs = old_from;
    inputs.append(new_from);
    inputs.append(old_to);
    inputs.append(new_to);
    verify(TRANSFER_VK, inputs, proof);
}

/// unwrap.circom — proves `commitment` opens to the public `value`.
public(package) fun verify_unwrap(commitment: vector<u8>, value: u64, proof: vector<u8>) {
    let mut inputs = commitment;
    inputs.append(u64_to_scalar(value));
    verify(UNWRAP_VK, inputs, proof);
}

/// lazydrip.circom — proves a hidden delta moved remaining→earned with the new
/// earned total bounded by min(cap, rate·(now_sec − start)), where the schedule
/// is pinned by `params_commitment`. Public signal order must match the circuit:
/// [cRemOld, cRemNew, cEarnedOld, cEarnedNew, cParams, nowSec].
public(package) fun verify_lazydrip(
    old_remaining: vector<u8>,
    new_remaining: vector<u8>,
    old_earned: vector<u8>,
    new_earned: vector<u8>,
    params_commitment: vector<u8>,
    now_sec: u64,
    proof: vector<u8>,
) {
    let mut inputs = old_remaining;
    inputs.append(new_remaining);
    inputs.append(old_earned);
    inputs.append(new_earned);
    inputs.append(params_commitment);
    inputs.append(u64_to_scalar(now_sec));
    verify(LAZYDRIP_VK, inputs, proof);
}

/// shielded.circom — a UTXO spend: proves the input note was in the tree at
/// `root`, its `nf` is correctly derived, and two output notes conserve value.
/// Public signal order: [root, nf, cm1, cm2] (each a 32-byte LE field element).
public(package) fun verify_shielded(
    root: u256,
    nf: u256,
    cm1: u256,
    cm2: u256,
    proof: vector<u8>,
) {
    let mut inputs = sui::bcs::to_bytes(&root);
    inputs.append(sui::bcs::to_bytes(&nf));
    inputs.append(sui::bcs::to_bytes(&cm1));
    inputs.append(sui::bcs::to_bytes(&cm2));
    verify(SHIELDED_VK, inputs, proof);
}

/// deposit.circom — proves note `cm` opens to the PUBLIC deposited `value`.
public(package) fun verify_deposit(cm: u256, value: u64, proof: vector<u8>) {
    let mut inputs = sui::bcs::to_bytes(&cm);
    inputs.append(u64_to_scalar(value));
    verify(DEPOSIT_VK, inputs, proof);
}

/// withdraw.circom — spend a note, reveal a public `amount`, keep change note.
/// Public signal order: [root, nf, amount, cm_change].
public(package) fun verify_withdraw(
    root: u256,
    nf: u256,
    amount: u64,
    cm_change: u256,
    proof: vector<u8>,
) {
    let mut inputs = sui::bcs::to_bytes(&root);
    inputs.append(sui::bcs::to_bytes(&nf));
    inputs.append(u64_to_scalar(amount));
    inputs.append(sui::bcs::to_bytes(&cm_change));
    verify(WITHDRAW_VK, inputs, proof);
}

/// private_settle.circom — shielded spend + vesting bound.
/// Public signal order: [root, nf, cm1, cm2, cParams, nowSec].
public(package) fun verify_private_settle(
    root: u256,
    nf: u256,
    cm1: u256,
    cm2: u256,
    params_commitment: u256,
    now_sec: u64,
    proof: vector<u8>,
) {
    let mut inputs = sui::bcs::to_bytes(&root);
    inputs.append(sui::bcs::to_bytes(&nf));
    inputs.append(sui::bcs::to_bytes(&cm1));
    inputs.append(sui::bcs::to_bytes(&cm2));
    inputs.append(sui::bcs::to_bytes(&params_commitment));
    inputs.append(u64_to_scalar(now_sec));
    verify(PRIVATE_SETTLE_VK, inputs, proof);
}

/// 32-byte scalar length, for callers building commitments.
public(package) fun scalar_len(): u64 { SCALAR_LEN }

// === Operations ===

/// Register an account with an initial commitment (e.g. a recipient's empty
/// balance, Poseidon(0, blinding)). No funds move; withdrawal still requires a
/// valid unwrap proof, so registering an arbitrary commitment is harmless.
public fun register<T>(pool: &mut ConfidentialPool<T>, commitment: vector<u8>, ctx: &TxContext) {
    assert_scalar(&commitment);
    let owner = ctx.sender();
    assert!(!pool.balances.contains(owner), EAccountExists);
    pool.balances.add(owner, commitment);
}

/// Enter the confidential balance: deposit a public coin and bind it to a
/// commitment proven (wrap.circom) to open to the coin's value.
/// Public signals: [commitment, amount].
public fun wrap<T>(
    pool: &mut ConfidentialPool<T>,
    coin: Coin<T>,
    commitment: vector<u8>,
    proof: vector<u8>,
    ctx: &TxContext,
) {
    assert_scalar(&commitment);
    let owner = ctx.sender();
    assert!(!pool.balances.contains(owner), EAccountExists);

    verify_wrap(commitment, coin.value(), proof);

    pool.reserve.join(coin.into_balance());
    pool.balances.add(owner, commitment);
}

/// Confidential transfer / drip: move a hidden delta from `from` to `to`. The
/// proof (transfer.circom) enforces conservation + no underflow against the
/// accounts' current commitments. Permissionless — anyone holding a valid
/// pre-proven step (e.g. the keeper) may submit it.
/// Public signals: [cSenderOld, cSenderNew, cRecipientOld, cRecipientNew].
public fun confidential_transfer<T>(
    pool: &mut ConfidentialPool<T>,
    from: address,
    to: address,
    new_from_commitment: vector<u8>,
    new_to_commitment: vector<u8>,
    proof: vector<u8>,
) {
    assert_scalar(&new_from_commitment);
    assert_scalar(&new_to_commitment);
    assert!(pool.balances.contains(from), ENoAccount);
    assert!(pool.balances.contains(to), ENoAccount);

    let old_from = *pool.balances.borrow(from);
    let old_to = *pool.balances.borrow(to);

    verify_transfer(old_from, new_from_commitment, old_to, new_to_commitment, proof);

    *pool.balances.borrow_mut(from) = new_from_commitment;
    *pool.balances.borrow_mut(to) = new_to_commitment;
}

/// Leave the confidential balance: reveal `value`, prove it opens your
/// commitment (unwrap.circom), then withdraw it from the reserve. Fully
/// withdraws and closes the account.
/// Public signals: [commitment, value].
public fun unwrap<T>(
    pool: &mut ConfidentialPool<T>,
    value: u64,
    proof: vector<u8>,
    ctx: &mut TxContext,
): Coin<T> {
    let owner = ctx.sender();
    assert!(pool.balances.contains(owner), ENoAccount);
    let commitment = *pool.balances.borrow(owner);

    verify_unwrap(commitment, value, proof);

    assert!(pool.reserve.value() >= value, EInsufficientReserve);
    pool.balances.remove(owner);
    coin::from_balance(pool.reserve.split(value), ctx)
}

// === Views ===

public fun reserve<T>(pool: &ConfidentialPool<T>): u64 { pool.reserve.value() }

public fun commitment_of<T>(pool: &ConfidentialPool<T>, owner: address): vector<u8> {
    *pool.balances.borrow(owner)
}

public fun has_account<T>(pool: &ConfidentialPool<T>, owner: address): bool {
    pool.balances.contains(owner)
}
