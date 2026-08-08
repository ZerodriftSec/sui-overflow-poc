module content_vault::file;

use content_vault::access::{Self, AccessRegistry};
use content_vault::directory::{Self, Directory};
use content_vault::events;
use content_vault::utils;
use sui::table::{Self, Table};

const EWrongProject: u64 = 2;
const EWrongParent: u64 = 3;
const EVersionMissing: u64 = 4;

/// Pointer to one immutable Walrus content+metadata snapshot.
public struct VersionInfo has store, copy, drop {
    version: u64,
    content_blob_id: vector<u8>,
    content_hash: vector<u8>,
    content_size: u64,
    metadata_blob_id: vector<u8>,
    walrus_end_epoch: u64,
    created_at_ms: u64,
    created_by: address,
}

/// Shared file object. Version appends only touch this object, not the parent Directory.
public struct File has key {
    id: UID,
    directory_id: ID,
    project_id: ID,
    name_hash: vector<u8>,
    mime_type: vector<u8>,
    current_version: u64,
    version_count: u64,
    versions: Table<u64, VersionInfo>,
    seal_id_prefix: vector<u8>,
    created_at_ms: u64,
    created_by: address,
}

public fun id(file: &File): ID {
    object::id(file)
}

public fun project_id(file: &File): ID {
    file.project_id
}

public fun directory_id(file: &File): ID {
    file.directory_id
}

public fun name_hash(file: &File): vector<u8> {
    file.name_hash
}

public fun mime_type(file: &File): vector<u8> {
    file.mime_type
}

public fun current_version(file: &File): u64 {
    file.current_version
}

public fun version_count(file: &File): u64 {
    file.version_count
}

public fun seal_id_prefix(file: &File): vector<u8> {
    file.seal_id_prefix
}

public fun borrow_version(file: &File, version: u64): &VersionInfo {
    assert!(table::contains(&file.versions, version), EVersionMissing);
    table::borrow(&file.versions, version)
}

public fun version_content_blob_id(info: &VersionInfo): vector<u8> {
    info.content_blob_id
}

public fun version_metadata_blob_id(info: &VersionInfo): vector<u8> {
    info.metadata_blob_id
}

public fun version_content_size(info: &VersionInfo): u64 {
    info.content_size
}

public fun version_walrus_end_epoch(info: &VersionInfo): u64 {
    info.walrus_end_epoch
}

/// Create a file under `directory` with an initial version.
public fun create_file(
    directory: &mut Directory,
    registry: &AccessRegistry,
    name_hash: vector<u8>,
    mime_type: vector<u8>,
    content_blob_id: vector<u8>,
    content_hash: vector<u8>,
    content_size: u64,
    metadata_blob_id: vector<u8>,
    walrus_end_epoch: u64,
    clock: &sui::clock::Clock,
    ctx: &mut TxContext,
): ID {
    access::assert_perm(registry, ctx.sender(), access::write());
    assert!(access::project_id(registry) == directory::project_id(directory), EWrongProject);

    let created_at_ms = sui::clock::timestamp_ms(clock);
    let project_id = directory::project_id(directory);
    let directory_id = directory::id(directory);

    let mut file = File {
        id: object::new(ctx),
        directory_id,
        project_id,
        name_hash,
        mime_type,
        current_version: 0,
        version_count: 0,
        versions: table::new(ctx),
        seal_id_prefix: utils::seal_id_prefix(project_id),
        created_at_ms,
        created_by: ctx.sender(),
    };
    let file_id = object::id(&file);

    directory::add_entry(directory, name_hash, false, file_id);
    events::emit_file_created(
        project_id,
        file_id,
        directory_id,
        name_hash,
        ctx.sender(),
    );

    add_version_internal(
        &mut file,
        content_blob_id,
        content_hash,
        content_size,
        metadata_blob_id,
        walrus_end_epoch,
        created_at_ms,
        ctx.sender(),
    );

    transfer::share_object(file);
    file_id
}

entry fun create_file_entry(
    directory: &mut Directory,
    registry: &AccessRegistry,
    name_hash: vector<u8>,
    mime_type: vector<u8>,
    content_blob_id: vector<u8>,
    content_hash: vector<u8>,
    content_size: u64,
    metadata_blob_id: vector<u8>,
    walrus_end_epoch: u64,
    clock: &sui::clock::Clock,
    ctx: &mut TxContext,
) {
    create_file(
        directory,
        registry,
        name_hash,
        mime_type,
        content_blob_id,
        content_hash,
        content_size,
        metadata_blob_id,
        walrus_end_epoch,
        clock,
        ctx,
    );
}

fun add_version_internal(
    file: &mut File,
    content_blob_id: vector<u8>,
    content_hash: vector<u8>,
    content_size: u64,
    metadata_blob_id: vector<u8>,
    walrus_end_epoch: u64,
    created_at_ms: u64,
    created_by: address,
) {
    let v = file.version_count + 1;
    table::add(&mut file.versions, v, VersionInfo {
        version: v,
        content_blob_id,
        content_hash,
        content_size,
        metadata_blob_id,
        walrus_end_epoch,
        created_at_ms,
        created_by,
    });
    file.version_count = v;
    file.current_version = v;
    events::emit_version_added(
        file.project_id,
        object::id(file),
        v,
        content_blob_id,
        metadata_blob_id,
        created_by,
    );
}

/// Append a new version. Does not touch the parent Directory.
public fun add_version(
    file: &mut File,
    registry: &AccessRegistry,
    content_blob_id: vector<u8>,
    content_hash: vector<u8>,
    content_size: u64,
    metadata_blob_id: vector<u8>,
    walrus_end_epoch: u64,
    clock: &sui::clock::Clock,
    ctx: &TxContext,
) {
    access::assert_perm(registry, ctx.sender(), access::write());
    assert!(access::project_id(registry) == file.project_id, EWrongProject);

    add_version_internal(
        file,
        content_blob_id,
        content_hash,
        content_size,
        metadata_blob_id,
        walrus_end_epoch,
        sui::clock::timestamp_ms(clock),
        ctx.sender(),
    );
}

entry fun add_version_entry(
    file: &mut File,
    registry: &AccessRegistry,
    content_blob_id: vector<u8>,
    content_hash: vector<u8>,
    content_size: u64,
    metadata_blob_id: vector<u8>,
    walrus_end_epoch: u64,
    clock: &sui::clock::Clock,
    ctx: &TxContext,
) {
    add_version(
        file,
        registry,
        content_blob_id,
        content_hash,
        content_size,
        metadata_blob_id,
        walrus_end_epoch,
        clock,
        ctx,
    );
}

/// Move a file between directories in one call (O(1) table ops + pointer update).
public fun move_file(
    file: &mut File,
    from_dir: &mut Directory,
    to_dir: &mut Directory,
    registry: &AccessRegistry,
    name_hash: vector<u8>,
    ctx: &TxContext,
) {
    access::assert_perm(registry, ctx.sender(), access::write());
    assert!(file.directory_id == directory::id(from_dir), EWrongParent);
    assert!(file.project_id == directory::project_id(from_dir), EWrongProject);
    assert!(file.name_hash == name_hash, EWrongParent);

    directory::move_file_entry(
        from_dir,
        to_dir,
        registry,
        name_hash,
        object::id(file),
        ctx,
    );
    file.directory_id = directory::id(to_dir);
}

entry fun move_file_entry(
    file: &mut File,
    from_dir: &mut Directory,
    to_dir: &mut Directory,
    registry: &AccessRegistry,
    name_hash: vector<u8>,
    ctx: &TxContext,
) {
    move_file(file, from_dir, to_dir, registry, name_hash, ctx);
}

/// Remove a file entry from its directory. The File shared object remains (versions preserved).
public fun remove_file(
    file: &File,
    directory: &mut Directory,
    registry: &AccessRegistry,
    name_hash: vector<u8>,
    ctx: &TxContext,
) {
    access::assert_perm(registry, ctx.sender(), access::write());
    assert!(file.directory_id == directory::id(directory), EWrongParent);
    assert!(file.project_id == directory::project_id(directory), EWrongProject);
    assert!(file.name_hash == name_hash, EWrongParent);

    let entry = directory::remove_entry(directory, name_hash);
    assert!(!directory::entry_is_directory(&entry), EWrongParent);
    assert!(directory::entry_object_id(&entry) == object::id(file), EWrongParent);
    events::emit_entry_removed(
        file.project_id,
        directory::id(directory),
        name_hash,
        false,
    );
}

entry fun remove_file_entry(
    file: &File,
    directory: &mut Directory,
    registry: &AccessRegistry,
    name_hash: vector<u8>,
    ctx: &TxContext,
) {
    remove_file(file, directory, registry, name_hash, ctx);
}
