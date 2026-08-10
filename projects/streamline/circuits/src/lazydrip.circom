pragma circom 2.0.0;

include "lib/commitment.circom";
include "comparators.circom";
include "poseidon.circom";

// LAZY CONFIDENTIAL STREAM — settle without per-drip transactions.
//
// A confidential stream vests linearly: earned(t) = min(cap, rate * elapsed),
// where elapsed = now - start (seconds). Instead of the keeper (or a party)
// posting a tx per drip — which leaks the cadence and can't be automated for a
// hidden stream — the freelancer settles the *whole vested-so-far* in ONE proof,
// whenever they choose. No drip stream of transactions ⇒ no timing signal.
//
// This moves a hidden `delta` from the stream's remaining balance to the
// freelancer's earned balance, and proves the new earned total does not exceed
// what has vested by `now`. (rate, start, cap) are pinned by a public params
// commitment set once at stream creation, so the schedule can't be forged.
//
// Public (outputs): cRemOld, cRemNew, cEarnedOld, cEarnedNew, cParams
// Public (input):   nowSec  (the on-chain clock, seconds)
// Private:          all balances, delta, and the schedule (rate, start, cap).

// Params commitment: Poseidon(rate, start, cap, blinding). Pins the vesting
// schedule on-chain while keeping it hidden.
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

template LazyDrip(nBits) {
    // --- remaining (undripped stream balance) ---
    signal input vRemOld;
    signal input rRemOld;
    signal input rRemNew;
    // --- earned (accrued to the freelancer) ---
    signal input vEarnedOld;
    signal input rEarnedOld;
    signal input rEarnedNew;
    // --- hidden amount settled this call ---
    signal input delta;
    // --- vesting schedule (pinned by cParams) ---
    signal input rate;    // base units per second
    signal input start;   // stream start, unix seconds
    signal input cap;     // total streamable (== initial remaining)
    signal input rParams; // schedule blinding
    // --- public: chain clock (seconds) ---
    signal input nowSec;

    // --- public commitments ---
    signal output cRemOld;
    signal output cRemNew;
    signal output cEarnedOld;
    signal output cEarnedNew;
    signal output cParams;

    // Conservation: delta leaves remaining, enters earned.
    signal vRemNew;
    vRemNew <== vRemOld - delta;
    signal vEarnedNew;
    vEarnedNew <== vEarnedOld + delta;

    // Range checks — the safety net (each ranged value ∈ [0, 2^nBits)).
    component rgRemOld = RangeCheck(nBits);   rgRemOld.in   <== vRemOld;
    component rgDelta = RangeCheck(nBits);     rgDelta.in    <== delta;
    component rgRemNew = RangeCheck(nBits);    rgRemNew.in   <== vRemNew;    // ⇒ vRemOld ≥ delta (no underflow)
    component rgEarnOld = RangeCheck(nBits);   rgEarnOld.in  <== vEarnedOld;
    component rgEarnNew = RangeCheck(nBits);   rgEarnNew.in  <== vEarnedNew; // ⇒ no overflow
    component rgRate = RangeCheck(nBits);      rgRate.in     <== rate;
    component rgCap = RangeCheck(nBits);       rgCap.in      <== cap;

    // elapsed = nowSec - start, range-checked ⇒ nowSec ≥ start (no time underflow).
    signal elapsed;
    elapsed <== nowSec - start;
    component rgElapsed = RangeCheck(nBits);   rgElapsed.in  <== elapsed;

    // vestedRaw = rate * elapsed (range-checked so the comparator below is sound).
    signal vestedRaw;
    vestedRaw <== rate * elapsed;
    component rgVestedRaw = RangeCheck(nBits); rgVestedRaw.in <== vestedRaw;

    // vested = min(cap, vestedRaw).
    component capLtRaw = LessThan(nBits);
    capLtRaw.in[0] <== cap;
    capLtRaw.in[1] <== vestedRaw;
    signal vested;
    // capLtRaw.out ∈ {0,1}; mux without leaving quadratic degree.
    vested <== vestedRaw + capLtRaw.out * (cap - vestedRaw);

    // Core rule: the new earned total may not exceed what has vested.
    component earnedLeVested = LessEqThan(nBits);
    earnedLeVested.in[0] <== vEarnedNew;
    earnedLeVested.in[1] <== vested;
    earnedLeVested.out === 1;

    // Commitment bindings.
    component cro = Commitment(); cro.value <== vRemOld;    cro.blinding <== rRemOld;    cRemOld    <== cro.out;
    component crn = Commitment(); crn.value <== vRemNew;    crn.blinding <== rRemNew;    cRemNew    <== crn.out;
    component ceo = Commitment(); ceo.value <== vEarnedOld; ceo.blinding <== rEarnedOld; cEarnedOld <== ceo.out;
    component cen = Commitment(); cen.value <== vEarnedNew; cen.blinding <== rEarnedNew; cEarnedNew <== cen.out;

    component cp = ParamsCommitment();
    cp.rate <== rate; cp.start <== start; cp.cap <== cap; cp.blinding <== rParams;
    cParams <== cp.out;
}

// nowSec is public so the on-chain verifier binds it to the real clock; the
// commitments are public outputs. Everything else stays hidden.
component main {public [nowSec]} = LazyDrip(64);
