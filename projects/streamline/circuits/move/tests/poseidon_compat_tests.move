#[test_only]
module groth16_poc::poseidon_compat_tests;
use sui::poseidon;
#[test]
fun sui_matches_circomlib() {
    let inputs = vector[1u256, 2u256];
    let h = poseidon::poseidon_bn254(&inputs);
    // circomlib Poseidon([1,2])
    assert!(h == 7853200120776062878684798364095072458815029376092732009249414926327459813530u256, 0);
}
