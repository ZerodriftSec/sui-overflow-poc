module content_vault::directory;

use content_vault::access::{Self, AccessRegistry};
use content_vault::events;
use sui::table::{Self, Table};

const EWrongProject: u64 = 2;
const EEntryExists: u64 = 3;
const EEntryMissing: u64 = 4;
const ENotEmpty: u64 = 5;
const EWrongParent: u64 = 6;
const ENotFile: u64 = 7;
const ENotDirectory: u64 = 8;

/// Directory entry pointing at a shared File or Directory object.
public struct DirEntry has store, copy, drop {
    is_directory: bool,
    object_id: ID,
}

/// Shared directory object. Children are referenced by hashed name keys.
public struct Directory has key {
    id: UID,
    /// Hashed label; empty for root.
    name_hash: vector<u8>,
    parent: Option<ID>,
    project_id: ID,
    entries: Table<vector<u8>, DirEntry>,
    entry_count: u64,
    created_at_ms: u64,
}

public(package) fun create_root(
    project_id: ID,
    created_at_ms: u64,
    ctx: &mut TxContext,
): Directory {
    Directory {
        id: object::new(ctx),
        name_hash: vector[],
        parent: option::none(),
        project_id,
        entries: table::new(ctx),
        entry_count: 0,
        created_at_ms,
    }
}

public(package) fun share(directory: Directory) {
    transfer::share_object(directory);
}

public fun id(directory: &Directory): ID {
    object::id(directory)
}

public fun project_id(directory: &Directory): ID {
    directory.project_id
}

public fun parent(directory: &Directory): Option<ID> {
    directory.parent
}

public fun name_hash(directory: &Directory): vector<u8> {
    directory.name_hash
}

public fun entry_count(directory: &Directory): u64 {
    directory.entry_count
}

public fun contains(directory: &Directory, name_hash: vector<u8>): bool {
    table::contains(&directory.entries, name_hash)
}

public fun borrow_entry(directory: &Directory, name_hash: vector<u8>): &DirEntry {
    assert!(table::contains(&directory.entries, name_hash), EEntryMissing);
    table::borrow(&directory.entries, name_hash)
}

public fun entry_object_id(entry: &DirEntry): ID {
    entry.object_id
}

public fun entry_is_directory(entry: &DirEntry): bool {
    entry.is_directory
}

public(package) fun add_entry(
    directory: &mut Directory,
    name_hash: vector<u8>,
    is_directory: bool,
    object_id: ID,
) {
    assert!(!table::contains(&directory.entries, name_hash), EEntryExists);
    table::add(
        &mut directory.entries,
        name_hash,
        DirEntry { is_directory, object_id },
    );
    directory.entry_count = directory.entry_count + 1;
}

public(package) fun remove_entry(directory: &mut Directory, name_hash: vector<u8>): DirEntry {
    assert!(table::contains(&directory.entries, name_hash), EEntryMissing);
    let entry = table::remove(&mut directory.entries, name_hash);
    directory.entry_count = directory.entry_count - 1;
    entry
}

/// Create a subdirectory under `parent` and return it unsared for PTB chaining
/// (e.g. create nested dirs / files, then `share_directory`).
public fun create_directory(
    parent: &mut Directory,
    registry: &AccessRegistry,
    name_hash: vector<u8>,
    clock: &sui::clock::Clock,
    ctx: &mut TxContext,
): Directory {
    access::assert_perm(registry, ctx.sender(), access::write());
    assert!(registry.project_id() == parent.project_id, EWrongProject);
    assert!(!table::contains(&parent.entries, name_hash), EEntryExists);

    let created_at_ms = sui::clock::timestamp_ms(clock);
    let directory = Directory {
        id: object::new(ctx),
        name_hash,
        parent: option::some(object::id(parent)),
        project_id: parent.project_id,
        entries: table::new(ctx),
        entry_count: 0,
        created_at_ms,
    };
    let directory_id = object::id(&directory);
    add_entry(parent, name_hash, true, directory_id);
    events::emit_directory_created(
        parent.project_id,
        directory_id,
        object::id(parent),
        name_hash,
        ctx.sender(),
    );
    directory
}

public fun share_directory(directory: Directory) {
    transfer::share_object(directory);
}

entry fun create_directory_entry(
    parent: &mut Directory,
    registry: &AccessRegistry,
    name_hash: vector<u8>,
    clock: &sui::clock::Clock,
    ctx: &mut TxContext,
) {
    let directory = create_directory(parent, registry, name_hash, clock, ctx);
    share_directory(directory);
}

/// Remove an empty subdirectory entry from its parent.
public fun remove_directory(
    parent: &mut Directory,
    child: &Directory,
    registry: &AccessRegistry,
    name_hash: vector<u8>,
    ctx: &TxContext,
) {
    access::assert_perm(registry, ctx.sender(), access::write());
    assert!(registry.project_id() == parent.project_id, EWrongProject);
    assert!(child.project_id == parent.project_id, EWrongProject);
    assert!(child.parent == option::some(object::id(parent)), EWrongParent);
    assert!(child.entry_count == 0, ENotEmpty);

    let entry = remove_entry(parent, name_hash);
    assert!(entry.is_directory, ENotDirectory);
    assert!(entry.object_id == object::id(child), EWrongParent);
    events::emit_entry_removed(parent.project_id, object::id(parent), name_hash, true);
}

entry fun remove_directory_entry(
    parent: &mut Directory,
    child: &Directory,
    registry: &AccessRegistry,
    name_hash: vector<u8>,
    ctx: &TxContext,
) {
    remove_directory(parent, child, registry, name_hash, ctx);
}

/// Move a file entry between directories. Caller must also update the File's directory_id
/// via `file::set_directory_id` in the same PTB (or use `file::move_file`).
public fun move_file_entry(
    from_dir: &mut Directory,
    to_dir: &mut Directory,
    registry: &AccessRegistry,
    name_hash: vector<u8>,
    file_id: ID,
    ctx: &TxContext,
) {
    access::assert_perm(registry, ctx.sender(), access::write());
    assert!(from_dir.project_id == to_dir.project_id, EWrongProject);
    assert!(registry.project_id() == from_dir.project_id, EWrongProject);
    assert!(!table::contains(&to_dir.entries, name_hash), EEntryExists);

    let entry = remove_entry(from_dir, name_hash);
    assert!(!entry.is_directory, ENotFile);
    assert!(entry.object_id == file_id, EWrongParent);
    add_entry(to_dir, name_hash, false, file_id);
    events::emit_file_moved(
        from_dir.project_id,
        file_id,
        object::id(from_dir),
        object::id(to_dir),
        name_hash,
    );
}
