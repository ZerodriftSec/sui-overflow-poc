/// Phase-1 viability proof: verify a real snarkjs Groth16 proof on-chain via
/// `sui::groth16` (BN254) — the SAME native that runs on Sui testnet & mainnet.
///
/// The circuit proves knowledge of secret factors a,b of the public output
/// c = 33 (multiplier.circom). Bytes were produced by circuits/converter from
/// the snarkjs artifacts. A green test here means the entire confidential-
/// amounts approach is verifiable on testnet without the devnet-only Bulletproof
/// native.
#[test_only]
module groth16_poc::groth16_poc_tests;

use sui::groth16::{Self, bn254};

#[test]
fun verifies_multiplier_proof() {
    // Full verifying key (arkworks-compressed): prepare on-chain.
    let vk =
        x"b0cf266b271a7a412a6a156e3bd2eaac2cbf7467b6198ba851b2117a647c58b09f13d3b771d27378aaac6a35a6a20f37f689775767d8f776206de92e4e52a12eefd2db5d04c98033b8387f3698197d9ea1bc112b2b2dc82eeb125ffc3ec410a6edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e19beb04d45904a226d9aec26a7d15b99ab528336018b8c3331a8b7b7dbd009b31c4b5db88a9b5b073c980f4cb4d998e91fa5fcb34b06908e081fb26f5e801b7603020000000000000034edb24e82491d0cbe595db2620e0499b24e569b32752e7938f5c919dfdaf691d707d703af9a47ae396d25a2e1765b7fe3c791a11143fad1131b4c6636909c94";
    let proof =
        x"193a8b4520f39496f7d9920b808faa2eea8813894debaa198469f586d0291fa1cdd46e12af5bba6ebaba04e8d3488605b943219902f0898d2915951a0469060a79cf69a9d65a0def8fd4eef870c4104947be037682e3b65cfc8d147687debb14dba55d620b24e4c4d0f657821e2f491f1d9f65fa82ac6ba82cb3a6b354b785ac";
    // Public input c = 33, as a 32-byte little-endian scalar.
    let inputs =
        x"2100000000000000000000000000000000000000000000000000000000000000";

    let curve = bn254();
    let pvk = groth16::prepare_verifying_key(&curve, &vk);
    let public_inputs = groth16::public_proof_inputs_from_bytes(inputs);
    let proof_points = groth16::proof_points_from_bytes(proof);

    assert!(
        groth16::verify_groth16_proof(&curve, &pvk, &public_inputs, &proof_points),
        0,
    );
}

#[test]
fun rejects_tampered_public_input() {
    let vk =
        x"b0cf266b271a7a412a6a156e3bd2eaac2cbf7467b6198ba851b2117a647c58b09f13d3b771d27378aaac6a35a6a20f37f689775767d8f776206de92e4e52a12eefd2db5d04c98033b8387f3698197d9ea1bc112b2b2dc82eeb125ffc3ec410a6edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e19beb04d45904a226d9aec26a7d15b99ab528336018b8c3331a8b7b7dbd009b31c4b5db88a9b5b073c980f4cb4d998e91fa5fcb34b06908e081fb26f5e801b7603020000000000000034edb24e82491d0cbe595db2620e0499b24e569b32752e7938f5c919dfdaf691d707d703af9a47ae396d25a2e1765b7fe3c791a11143fad1131b4c6636909c94";
    let proof =
        x"193a8b4520f39496f7d9920b808faa2eea8813894debaa198469f586d0291fa1cdd46e12af5bba6ebaba04e8d3488605b943219902f0898d2915951a0469060a79cf69a9d65a0def8fd4eef870c4104947be037682e3b65cfc8d147687debb14dba55d620b24e4c4d0f657821e2f491f1d9f65fa82ac6ba82cb3a6b354b785ac";
    // Wrong claim: c = 34. The proof must NOT verify.
    let inputs =
        x"2200000000000000000000000000000000000000000000000000000000000000";

    let curve = bn254();
    let pvk = groth16::prepare_verifying_key(&curve, &vk);
    let public_inputs = groth16::public_proof_inputs_from_bytes(inputs);
    let proof_points = groth16::proof_points_from_bytes(proof);

    assert!(
        !groth16::verify_groth16_proof(&curve, &pvk, &public_inputs, &proof_points),
        1,
    );
}
