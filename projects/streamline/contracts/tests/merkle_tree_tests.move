#[test_only]
module streamline::merkle_tree_tests;

use streamline::merkle_tree as mt;

// From circuits/shielded test: note cm and the Merkle root of a depth-20 tree
// with cm at leaf 0 (circomlib Poseidon). The on-chain tree (sui::poseidon) must
// reproduce this root — proving circuit ↔ contract Poseidon compatibility.
const CM: u256 = 15631003549215301019470602651310934894295032153856254889966326769454881420973;
const ROOT: u256 = 19392926230302248684238529380745693383013750206194861007862957776529124887687;

#[test]
fun onchain_root_matches_circuit() {
    let mut t = mt::new_for_testing();
    let idx = mt::insert(&mut t, CM);
    assert!(idx == 0, 0);
    assert!(mt::current_root(&t) == ROOT, 1);
    assert!(mt::is_known_root(&t, ROOT), 2);
    assert!(!mt::is_known_root(&t, 12345u256), 3);
    sui::test_utils::destroy(t);
}
