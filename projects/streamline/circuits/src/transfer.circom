pragma circom 2.0.0;

include "lib/commitment.circom";

// TRANSFER / DRIP: move a hidden `delta` from sender to recipient.
//
// This is the core confidential-settlement step. On-chain the contract stores
// the four commitments; the verifier checks `senderOld`/`recipientOld` against
// stored state, verifies this proof, then writes `senderNew`/`recipientNew`.
// The amount `delta` and all balances stay hidden.
//
// Public (outputs): cSenderOld, cSenderNew, cRecipientOld, cRecipientNew
// Private: the balances, the delta, and every blinding factor.
//
// Soundness enforced:
//   - openings bind each commitment to its (value, blinding)
//   - vSenderNew    = vSenderOld - delta        (conservation, sender side)
//   - vRecipientNew = vRecipientOld + delta      (conservation, recipient side)
//   - vSenderOld, delta, vSenderNew, vRecipientOld, vRecipientNew ∈ [0, 2^64)
//       · ranging vSenderNew  ⇒  vSenderOld ≥ delta  (NO UNDERFLOW)
//       · ranging vRecipientNew ⇒ no overflow past 2^64
template Transfer(nBits) {
    // --- sender ---
    signal input vSenderOld;
    signal input rSenderOld;
    signal input rSenderNew;
    // --- recipient ---
    signal input vRecipientOld;
    signal input rRecipientOld;
    signal input rRecipientNew;
    // --- amount (hidden) ---
    signal input delta;

    // --- public commitments ---
    signal output cSenderOld;
    signal output cSenderNew;
    signal output cRecipientOld;
    signal output cRecipientNew;

    // Conservation.
    signal vSenderNew;
    vSenderNew <== vSenderOld - delta;
    signal vRecipientNew;
    vRecipientNew <== vRecipientOld + delta;

    // Range checks — these are the safety net.
    component rgSenderOld = RangeCheck(nBits);
    rgSenderOld.in <== vSenderOld;
    component rgDelta = RangeCheck(nBits);
    rgDelta.in <== delta;
    component rgSenderNew = RangeCheck(nBits); // ⇒ vSenderOld ≥ delta
    rgSenderNew.in <== vSenderNew;
    component rgRecipientOld = RangeCheck(nBits);
    rgRecipientOld.in <== vRecipientOld;
    component rgRecipientNew = RangeCheck(nBits); // ⇒ no overflow
    rgRecipientNew.in <== vRecipientNew;

    // Commitment bindings.
    component cso = Commitment();
    cso.value <== vSenderOld;
    cso.blinding <== rSenderOld;
    cSenderOld <== cso.out;

    component csn = Commitment();
    csn.value <== vSenderNew;
    csn.blinding <== rSenderNew;
    cSenderNew <== csn.out;

    component cro = Commitment();
    cro.value <== vRecipientOld;
    cro.blinding <== rRecipientOld;
    cRecipientOld <== cro.out;

    component crn = Commitment();
    crn.value <== vRecipientNew;
    crn.blinding <== rRecipientNew;
    cRecipientNew <== crn.out;
}

component main = Transfer(64);
