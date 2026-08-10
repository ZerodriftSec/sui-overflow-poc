pragma circom 2.0.0;

// Phase-1 pipeline validator: prove knowledge of factors a,b of a public c.
// Matches Sui's canonical Groth16 example so any on-chain failure is a
// byte-format issue, not a circuit issue.
template Multiplier() {
    signal input a;        // private
    signal input b;        // private
    signal output c;       // public
    c <== a * b;
}

component main = Multiplier();
