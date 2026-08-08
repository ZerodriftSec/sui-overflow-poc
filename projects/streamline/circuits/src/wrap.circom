pragma circom 2.0.0;

include "lib/commitment.circom";

// WRAP: enter the confidential balance from a public coin.
//
// The amount being wrapped is public (you're converting a visible Coin<T>),
// but it is bound to a commitment whose blinding factor is secret — so all
// *future* confidential operations on this balance reveal nothing.
//
// Public:  amount, commitment
// Private: blinding
// Proves:  commitment == Poseidon(amount, blinding)  AND  amount ∈ [0, 2^64)
template Wrap(nBits) {
    signal input amount;       // public
    signal input blinding;     // private
    signal output commitment;  // public

    component range = RangeCheck(nBits);
    range.in <== amount;

    component c = Commitment();
    c.value <== amount;
    c.blinding <== blinding;
    commitment <== c.out;
}

component main { public [amount] } = Wrap(64);
