pragma circom 2.0.0;

include "lib/commitment.circom"; // RangeCheck
include "poseidon.circom";

// WITHDRAW from the shielded pool: spend one note, reveal a PUBLIC withdrawal
// amount, and put the remainder in a fresh change note. Like `shielded.circom`
// but one "output" is a cleartext amount (the pay-out) instead of a commitment.
// Reveals only the withdrawn amount (the anonymity-set boundary), never which
// note was spent or the change.
//
// Public: root, nf, amount (withdrawn), cm_change
// Private: value_in, sk, rho_in, the Merkle path, and the change note openings.

// (Templates inlined — must NOT edit shielded.circom's copies or its deployed
// VK changes.)
template NoteCommitW() {
    signal input value; signal input pk; signal input rho; signal output out;
    component h = Poseidon(3);
    h.inputs[0] <== value; h.inputs[1] <== pk; h.inputs[2] <== rho;
    out <== h.out;
}
template MerkleLevelW() {
    signal input cur; signal input sibling; signal input bit; signal output out;
    bit * (bit - 1) === 0;
    signal left; signal right;
    left <== cur + bit * (sibling - cur);
    right <== sibling + bit * (cur - sibling);
    component h = Poseidon(2);
    h.inputs[0] <== left; h.inputs[1] <== right;
    out <== h.out;
}
template MerkleProofW(depth) {
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal output root;
    component levels[depth];
    signal cur[depth + 1];
    cur[0] <== leaf;
    for (var i = 0; i < depth; i++) {
        levels[i] = MerkleLevelW();
        levels[i].cur <== cur[i];
        levels[i].sibling <== pathElements[i];
        levels[i].bit <== pathIndices[i];
        cur[i + 1] <== levels[i].out;
    }
    root <== cur[depth];
}

template Withdraw(depth, nBits) {
    signal input value_in;
    signal input sk;
    signal input rho_in;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    // change note
    signal input change_value;
    signal input pk_change;
    signal input rho_change;

    signal output root;
    signal output nf;
    signal output amount;    // revealed pay-out
    signal output cm_change;

    // owner + input note + membership
    component pkc = Poseidon(2);
    pkc.inputs[0] <== sk; pkc.inputs[1] <== 0;
    signal pk_in; pk_in <== pkc.out;
    component cin = NoteCommitW();
    cin.value <== value_in; cin.pk <== pk_in; cin.rho <== rho_in;
    component mp = MerkleProofW(depth);
    mp.leaf <== cin.out;
    for (var i = 0; i < depth; i++) { mp.pathElements[i] <== pathElements[i]; mp.pathIndices[i] <== pathIndices[i]; }
    root <== mp.root;

    // nullifier
    component nfc = Poseidon(2);
    nfc.inputs[0] <== sk; nfc.inputs[1] <== rho_in;
    nf <== nfc.out;

    // amount = value_in - change_value, with range checks (no underflow/overflow)
    amount <== value_in - change_value;
    component rgIn = RangeCheck(nBits); rgIn.in <== value_in;
    component rgCh = RangeCheck(nBits); rgCh.in <== change_value;
    component rgAmt = RangeCheck(nBits); rgAmt.in <== amount; // ⇒ change_value ≤ value_in

    // change note commitment
    component cc = NoteCommitW();
    cc.value <== change_value; cc.pk <== pk_change; cc.rho <== rho_change;
    cm_change <== cc.out;
}

component main = Withdraw(20, 64);
