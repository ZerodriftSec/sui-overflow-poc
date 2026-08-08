pragma circom 2.0.0;

include "lib/commitment.circom";
include "comparators.circom";
include "poseidon.circom";

// PRIVATE SETTLE — shielded spend + lazy vesting (amount + who + when).
//
// Spends one funding note in the shielded pool into (worker payout + change),
// while proving the cumulative paid amount does not exceed what has vested:
//   paid_after = cap - v2  ≤  min(cap, rate · (nowSec − start))
// Schedule (rate, start, cap) is pinned by public cParams = Poseidon(...).
//
// Public outputs: root, nf, cm1, cm2, cParams
// Public input:   nowSec
// No parties, no amounts, no drip cadence on-chain.

template NoteCommit() {
    signal input value;
    signal input pk;
    signal input rho;
    signal output out;
    component h = Poseidon(3);
    h.inputs[0] <== value;
    h.inputs[1] <== pk;
    h.inputs[2] <== rho;
    out <== h.out;
}

template MerkleLevel() {
    signal input cur;
    signal input sibling;
    signal input bit;
    signal output out;
    bit * (bit - 1) === 0;
    signal left;
    signal right;
    left <== cur + bit * (sibling - cur);
    right <== sibling + bit * (cur - sibling);
    component h = Poseidon(2);
    h.inputs[0] <== left;
    h.inputs[1] <== right;
    out <== h.out;
}

template MerkleProof(depth) {
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal output root;
    component levels[depth];
    signal cur[depth + 1];
    cur[0] <== leaf;
    for (var i = 0; i < depth; i++) {
        levels[i] = MerkleLevel();
        levels[i].cur <== cur[i];
        levels[i].sibling <== pathElements[i];
        levels[i].bit <== pathIndices[i];
        cur[i + 1] <== levels[i].out;
    }
    root <== cur[depth];
}

template ParamsCommitment() {
    signal input rate;
    signal input start;
    signal input cap;
    signal input blinding;
    signal output out;
    component h = Poseidon(4);
    h.inputs[0] <== rate;
    h.inputs[1] <== start;
    h.inputs[2] <== cap;
    h.inputs[3] <== blinding;
    out <== h.out;
}

template PrivateSettle(depth, nBits) {
    // input note
    signal input value_in;
    signal input sk;
    signal input rho_in;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    // outputs: cm1 = worker payout (v1), cm2 = change / remaining (v2)
    signal input v1;
    signal input pk1;
    signal input rho1;
    signal input v2;
    signal input pk2;
    signal input rho2;
    // vesting schedule (pinned by cParams)
    signal input rate;
    signal input start;
    signal input cap;
    signal input rParams;
    signal input nowSec;

    signal output root;
    signal output nf;
    signal output cm1;
    signal output cm2;
    signal output cParams;

    // owner pk = Poseidon(sk, 0)
    component pkc = Poseidon(2);
    pkc.inputs[0] <== sk;
    pkc.inputs[1] <== 0;
    signal pk_in;
    pk_in <== pkc.out;

    component cin = NoteCommit();
    cin.value <== value_in;
    cin.pk <== pk_in;
    cin.rho <== rho_in;
    component mp = MerkleProof(depth);
    mp.leaf <== cin.out;
    for (var i = 0; i < depth; i++) {
        mp.pathElements[i] <== pathElements[i];
        mp.pathIndices[i] <== pathIndices[i];
    }
    root <== mp.root;

    component nfc = Poseidon(2);
    nfc.inputs[0] <== sk;
    nfc.inputs[1] <== rho_in;
    nf <== nfc.out;

    // conservation
    value_in === v1 + v2;
    component rgIn = RangeCheck(nBits); rgIn.in <== value_in;
    component rg1 = RangeCheck(nBits);  rg1.in  <== v1;
    component rg2 = RangeCheck(nBits);  rg2.in  <== v2;
    component rgCap = RangeCheck(nBits); rgCap.in <== cap;
    component rgRate = RangeCheck(nBits); rgRate.in <== rate;

    // remaining cannot exceed cap (notes are funded at cap and only shrink)
    signal capMinusIn;
    capMinusIn <== cap - value_in;
    component rgCapIn = RangeCheck(nBits); rgCapIn.in <== capMinusIn;

    // elapsed / vested
    signal elapsed;
    elapsed <== nowSec - start;
    component rgElapsed = RangeCheck(nBits); rgElapsed.in <== elapsed;
    signal vestedRaw;
    vestedRaw <== rate * elapsed;
    component rgVestedRaw = RangeCheck(nBits); rgVestedRaw.in <== vestedRaw;

    component capLtRaw = LessThan(nBits);
    capLtRaw.in[0] <== cap;
    capLtRaw.in[1] <== vestedRaw;
    signal vested;
    vested <== vestedRaw + capLtRaw.out * (cap - vestedRaw);

    // cumulative paid after this settle = cap - v2 ≤ vested
    signal paidAfter;
    paidAfter <== cap - v2;
    component rgPaid = RangeCheck(nBits); rgPaid.in <== paidAfter;
    component paidLeVested = LessEqThan(nBits);
    paidLeVested.in[0] <== paidAfter;
    paidLeVested.in[1] <== vested;
    paidLeVested.out === 1;

    component c1 = NoteCommit();
    c1.value <== v1; c1.pk <== pk1; c1.rho <== rho1; cm1 <== c1.out;
    component c2 = NoteCommit();
    c2.value <== v2; c2.pk <== pk2; c2.rho <== rho2; cm2 <== c2.out;

    component cp = ParamsCommitment();
    cp.rate <== rate; cp.start <== start; cp.cap <== cap; cp.blinding <== rParams;
    cParams <== cp.out;
}

component main {public [nowSec]} = PrivateSettle(20, 64);
