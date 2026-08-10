pragma circom 2.0.0;

include "lib/commitment.circom"; // RangeCheck (+ poseidon/bitify)
include "poseidon.circom";

// SHIELDED SPEND (Phase 2 — graph hiding). A UTXO/note-commitment + nullifier
// design (Zcash/Tornado-shaped) that hides WHO pays WHOM, not just the amount.
//
// A note is cm = Poseidon(value, pk, rho), pk = Poseidon(sk, 0). Spending one
// note to create two (recipient + change) reveals only:
//   - the Merkle `root` it was a member of (any historical pool root),
//   - the `nullifier` nf = Poseidon(sk, rho)  (unique per note; only the owner
//     can derive it) — the pool marks it spent to stop double-spends,
//   - the two output commitments cm1, cm2.
// It never reveals which leaf was spent, the amounts, or the owners ⇒ the
// payment graph is hidden. Value is conserved (value_in = v1 + v2).
//
// sui::poseidon::poseidon_bn254 is byte-identical to circomlib Poseidon, so the
// on-chain incremental Merkle tree computes the same roots this circuit proves.

// Note commitment cm = Poseidon(value, pk, rho).
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

// One Merkle level: hash(cur, sibling) ordered by `bit` (0 ⇒ cur is left child).
template MerkleLevel() {
    signal input cur;
    signal input sibling;
    signal input bit;
    signal output out;
    bit * (bit - 1) === 0; // bit ∈ {0,1}
    signal left;
    signal right;
    left <== cur + bit * (sibling - cur);   // bit=0 ⇒ cur, bit=1 ⇒ sibling
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

template Shielded(depth, nBits) {
    // input note (being spent)
    signal input value_in;
    signal input sk;
    signal input rho_in;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    // output notes: 1 = recipient, 2 = change
    signal input v1;
    signal input pk1;
    signal input rho1;
    signal input v2;
    signal input pk2;
    signal input rho2;

    // public
    signal output root;
    signal output nf;
    signal output cm1;
    signal output cm2;

    // owner pk = Poseidon(sk, 0)
    component pkc = Poseidon(2);
    pkc.inputs[0] <== sk;
    pkc.inputs[1] <== 0;
    signal pk_in;
    pk_in <== pkc.out;

    // input note commitment + Merkle membership
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

    // nullifier = Poseidon(sk, rho_in)
    component nfc = Poseidon(2);
    nfc.inputs[0] <== sk;
    nfc.inputs[1] <== rho_in;
    nf <== nfc.out;

    // conservation + range (no under/overflow)
    value_in === v1 + v2;
    component rgIn = RangeCheck(nBits); rgIn.in <== value_in;
    component rg1 = RangeCheck(nBits);  rg1.in  <== v1;
    component rg2 = RangeCheck(nBits);  rg2.in  <== v2;

    // output note commitments
    component c1 = NoteCommit(); c1.value <== v1; c1.pk <== pk1; c1.rho <== rho1; cm1 <== c1.out;
    component c2 = NoteCommit(); c2.value <== v2; c2.pk <== pk2; c2.rho <== rho2; cm2 <== c2.out;
}

// depth 20 (~1M notes); all four signals are public outputs.
component main = Shielded(20, 64);
