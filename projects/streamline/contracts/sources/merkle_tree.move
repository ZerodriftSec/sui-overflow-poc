/// Incremental Merkle tree over BN254 Poseidon (Tornado `MerkleTreeWithHistory`
/// shape), for the shielded pool (Phase 2). Leaves are note commitments; the tree
/// keeps a rolling history of recent roots so a spend proof may reference any
/// recent root (avoids racing concurrent inserts).
///
/// `sui::poseidon::poseidon_bn254` is byte-identical to circomlib Poseidon (tested),
/// so the roots computed here match the roots the `shielded.circom` Merkle proof
/// verifies. ZERO_LEAF = 0; zeros[i] = Poseidon(zeros[i-1], zeros[i-1]).
module streamline::merkle_tree;

use sui::poseidon;

const DEPTH: u64 = 20;
const ROOT_HISTORY: u64 = 30;
const ZERO_LEAF: u256 = 0;

const ETreeFull: u64 = 0;

public struct MerkleTree has store {
    /// Latest filled subtree root at each level (for incremental insertion).
    filled_subtrees: vector<u256>,
    /// Precomputed empty-subtree roots per level.
    zeros: vector<u256>,
    /// Circular buffer of recent roots.
    roots: vector<u256>,
    current_root_index: u64,
    next_index: u64,
}

fun hash_pair(l: u256, r: u256): u256 {
    poseidon::poseidon_bn254(&vector[l, r])
}

public(package) fun new(): MerkleTree {
    let mut zeros = vector[];
    let mut filled_subtrees = vector[];
    let mut cur = ZERO_LEAF;
    zeros.push_back(cur);
    let mut i = 0;
    while (i < DEPTH) {
        filled_subtrees.push_back(cur);
        cur = hash_pair(cur, cur);
        zeros.push_back(cur);
        i = i + 1;
    };
    // cur is now the root of a fully-empty tree.
    let mut roots = vector[];
    let mut j = 0;
    while (j < ROOT_HISTORY) {
        roots.push_back(if (j == 0) cur else 0u256);
        j = j + 1;
    };
    MerkleTree {
        filled_subtrees,
        zeros,
        roots,
        current_root_index: 0,
        next_index: 0,
    }
}

/// Insert `leaf`, return its 0-based index. Recomputes the root and appends it to
/// the history. Aborts if the tree is full.
public(package) fun insert(t: &mut MerkleTree, leaf: u256): u64 {
    let index = t.next_index;
    assert!(index < (1u64 << (DEPTH as u8)), ETreeFull);

    let mut cur_index = index;
    let mut cur_hash = leaf;
    let mut i = 0;
    while (i < DEPTH) {
        let (left, right) = if (cur_index % 2 == 0) {
            // left child: our node fills this level's subtree; sibling is empty.
            *t.filled_subtrees.borrow_mut(i) = cur_hash;
            (cur_hash, *t.zeros.borrow(i))
        } else {
            // right child: pair with the stored left subtree.
            (*t.filled_subtrees.borrow(i), cur_hash)
        };
        cur_hash = hash_pair(left, right);
        cur_index = cur_index / 2;
        i = i + 1;
    };

    let next_root_index = (t.current_root_index + 1) % ROOT_HISTORY;
    t.current_root_index = next_root_index;
    *t.roots.borrow_mut(next_root_index) = cur_hash;
    t.next_index = index + 1;
    index
}

public(package) fun current_root(t: &MerkleTree): u256 {
    *t.roots.borrow(t.current_root_index)
}

/// True if `root` is any non-empty root in the recent history.
public(package) fun is_known_root(t: &MerkleTree, root: u256): bool {
    if (root == 0) return false;
    let mut i = 0;
    while (i < ROOT_HISTORY) {
        if (*t.roots.borrow(i) == root) return true;
        i = i + 1;
    };
    false
}

public(package) fun next_index(t: &MerkleTree): u64 { t.next_index }

// === Test-only ===
#[test_only]
public fun new_for_testing(): MerkleTree { new() }
#[test_only]
public fun depth(): u64 { DEPTH }
