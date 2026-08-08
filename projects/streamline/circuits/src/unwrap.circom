pragma circom 2.0.0;

include "lib/commitment.circom";

// UNWRAP: leave the confidential balance back to a public coin.
//
// Reveals `value` (the amount cashed out) and proves it matches a commitment
// the owner controls. On-chain the contract checks the commitment against
// stored state, verifies this proof, then releases `value` from the pool.
//
// Public:  value, commitment
// Private: blinding
template Unwrap(nBits) {
    signal input value;        // public (revealed at cash-out)
    signal input blinding;     // private
    signal output commitment;  // public

    component range = RangeCheck(nBits);
    range.in <== value;

    component c = Commitment();
    c.value <== value;
    c.blinding <== blinding;
    commitment <== c.out;
}

component main { public [value] } = Unwrap(64);
