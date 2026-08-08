/// Verifies a real lazydrip.circom Groth16 proof on-chain via sui::groth16.
/// Bytes from circuits/converter over the snarkjs artifacts (valid: claim 300 of
/// 500 vested at nowSec=50). A green test confirms the VK byte-format is Sui-
/// compatible before embedding LAZYDRIP_VK in the streamline package.
#[test_only]
module groth16_poc::lazydrip_tests;

use sui::groth16::{Self, bn254};

const VK: vector<u8> = x"1d8e4233c3c66ab59c2b3c265a2886837b80219952150d8f2e8bf26fb6dce2aac4c97bbe7457d570a27e0306ebde64269e0a9fd5a9bb0cb070a2824c0b65e710daeb07e8f409c3bd2a195bca7638955741c4590f5d98465d1a6481a2896f6006edf692d95cbdde46ddda5ef7d422436779445c5e66006a42761e1f12efde0018c212f3aeb785e49712e7a9353349aaf1255dfb31b7bf60723a480d9293938e198f664f71e35f7799abcd25152c4624330524d04adc9f5fbe911228888c927e0448e479cba4948cd5515423bb5d102c8ddef8210d1a1d40dfed219d1dc6e1bb0d070000000000000039ee024b175d8cd4e23b04b35fc51316f51933846e7a0f4872e0f12c9de803124ef054d45ce19357736058ff65aa06cd8a8d048846526b19d6185596159beb924390887ac23377feddedb6fd060952613f51b02a9e1d4a553de8bcc0b34634223ac9df00afaca7f48741b7ed04fed6b7dceb2aae6ea5b90359242f4c0b31750f958aad09d3c3b221635c8b7a3f653dd3c4ab41be4db3d2edcb0b11dd7f2f3727d4d3b9144e67c1df565b8af272e56ad9a68ca3fcad37d2a7f8fc434d64f9f82b6e2ccd207ed34ebef4326da52ea7488cdda789172e01d04ae31d938ad1169c2c";
const PROOF: vector<u8> = x"a7edee9e1823a42322ad88caf5717553ce11fe8fbf87b5ab862c040c8fee2e272f6599f42782a8b0382fc9700e97197353a0a56d66c0caf83b7a834834ae162b4208696c5970690ccd5a7ad2217bb21f310c98e04c2d196cf4ddc89d0697c08fdcacf1496692ac6bd61dcf9ae716a5c966137004ef370d6d22ccf9546c9c051a";
const INPUTS: vector<u8> = x"7aeb2f1b5c533c7b1c4fcbf0b8078faf5a5f973c212da655ba3f4f9d13a0bd1dbbe0c89b73cf5a796a177fd6eae83ffe34c0dcf86196d8850682913f1f4c87153af7c794a6504856a961f0683c2e4b82ce0f3284edcbd4cc3f8b33eec3584401d4993872c321524b470687ec15eaa5dd73dcabd6e08b397411d1824ca117a9105a0191fad8446e9c3503c34ff87f770feccee409e78d1f9400e2b31d22021b0e3200000000000000000000000000000000000000000000000000000000000000";
const TAMPERED: vector<u8> = x"7aeb2f1b5c533c7b1c4fcbf0b8078faf5a5f973c212da655ba3f4f9d13a0bd1dbbe0c89b73cf5a796a177fd6eae83ffe34c0dcf86196d8850682913f1f4c87153af7c794a6504856a961f0683c2e4b82ce0f3284edcbd4cc3f8b33eec3584401d4993872c321524b470687ec15eaa5dd73dcabd6e08b397411d1824ca117a9105a0191fad8446e9c3503c34ff87f770feccee409e78d1f9400e2b31d22021b0e3300000000000000000000000000000000000000000000000000000000000000";

#[test]
fun verifies_lazydrip_proof() {
    let curve = bn254();
    let pvk = groth16::prepare_verifying_key(&curve, &VK);
    let public_inputs = groth16::public_proof_inputs_from_bytes(INPUTS);
    let proof_points = groth16::proof_points_from_bytes(PROOF);
    assert!(groth16::verify_groth16_proof(&curve, &pvk, &public_inputs, &proof_points), 0);
}

#[test]
fun rejects_tampered_now() {
    let curve = bn254();
    let pvk = groth16::prepare_verifying_key(&curve, &VK);
    let public_inputs = groth16::public_proof_inputs_from_bytes(TAMPERED);
    let proof_points = groth16::proof_points_from_bytes(PROOF);
    assert!(!groth16::verify_groth16_proof(&curve, &pvk, &public_inputs, &proof_points), 1);
}
