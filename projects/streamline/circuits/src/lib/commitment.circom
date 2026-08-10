pragma circom 2.0.0;

include "poseidon.circom";
include "bitify.circom";

// Hiding + binding commitment to a value: C = Poseidon(value, blinding).
// `blinding` is a random field element kept secret by the owner.
template Commitment() {
    signal input value;
    signal input blinding;
    signal output out;

    component h = Poseidon(2);
    h.inputs[0] <== value;
    h.inputs[1] <== blinding;
    out <== h.out;
}

// Constrain `in` to the range [0, 2^nBits). For amounts we use 64-bit base
// units (matches the u64 balances in stream.move). Num2Bits aborts if `in`
// does not fit in nBits, which is what prevents under/overflow when we range
// a subtraction result.
template RangeCheck(nBits) {
    signal input in;
    component n2b = Num2Bits(nBits);
    n2b.in <== in;
}
