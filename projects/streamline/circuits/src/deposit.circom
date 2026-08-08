pragma circom 2.0.0;

include "poseidon.circom";

// DEPOSIT binding: prove the note commitment cm opens to the PUBLIC deposited
// `value` with a private owner pk and randomness rho. Value enters the shielded
// pool in the clear (the on/off-ramp is the anonymity-set boundary), but the
// note that receives it must provably equal that amount — otherwise a depositor
// could lock 1 and mint a note worth 1000.
//
// Public:  value (the coin amount), cm (the note commitment)
// Private: pk = Poseidon(sk,0), rho
template Deposit() {
    signal input value; // public
    signal input pk;    // private
    signal input rho;   // private
    signal output cm;   // public

    component h = Poseidon(3);
    h.inputs[0] <== value;
    h.inputs[1] <== pk;
    h.inputs[2] <== rho;
    cm <== h.out;
}

// Public signal order: [cm (output), value (public input)].
component main {public [value]} = Deposit();
