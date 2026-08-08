module content_vault::utils;

use sui::hash;

/// Returns true if `prefix` is a byte-prefix of `word`.
public fun is_prefix(prefix: vector<u8>, word: vector<u8>): bool {
    if (prefix.length() > word.length()) {
        return false
    };
    let mut i = 0;
    while (i < prefix.length()) {
        if (&prefix[i] != &word[i]) {
            return false
        };
        i = i + 1;
    };
    true
}

/// Domain-separated name hash: blake2b256(project_id_bytes || name_bytes).
public fun name_hash(project_id: ID, name: vector<u8>): vector<u8> {
    let mut data = object::id_to_bytes(&project_id);
    data.append(name);
    hash::blake2b256(&data)
}

/// Seal identity prefix binding an encryption to a project.
/// Full identity is typically: project_id_bytes || file_id_bytes || nonce.
public fun seal_id_prefix(project_id: ID): vector<u8> {
    object::id_to_bytes(&project_id)
}

/// Build a seal identity: project_id || file_id || nonce.
public fun build_seal_id(project_id: ID, file_id: ID, nonce: vector<u8>): vector<u8> {
    let mut id = object::id_to_bytes(&project_id);
    id.append(object::id_to_bytes(&file_id));
    id.append(nonce);
    id
}

/// Extract project_id bytes (first 32) from a seal identity.
public fun project_id_bytes_from_seal_id(id: &vector<u8>): vector<u8> {
    assert!(id.length() >= 32, 0);
    let mut out = vector[];
    let mut i = 0;
    while (i < 32) {
        out.push_back(id[i]);
        i = i + 1;
    };
    out
}
