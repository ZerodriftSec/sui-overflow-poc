module content_vault::events;

use sui::event;

public struct ProjectCreated has copy, drop {
    project_id: ID,
    root_directory_id: ID,
    access_registry_id: ID,
    created_by: address,
}

public struct AccessGranted has copy, drop {
    project_id: ID,
    who: address,
    perm: u8,
}

public struct AccessRevoked has copy, drop {
    project_id: ID,
    who: address,
}

public struct DirectoryCreated has copy, drop {
    project_id: ID,
    directory_id: ID,
    parent_id: ID,
    name_hash: vector<u8>,
    created_by: address,
}

public struct FileCreated has copy, drop {
    project_id: ID,
    file_id: ID,
    directory_id: ID,
    name_hash: vector<u8>,
    created_by: address,
}

public struct VersionAdded has copy, drop {
    project_id: ID,
    file_id: ID,
    version: u64,
    content_blob_id: vector<u8>,
    metadata_blob_id: vector<u8>,
    created_by: address,
}

public struct FileMoved has copy, drop {
    project_id: ID,
    file_id: ID,
    from_directory_id: ID,
    to_directory_id: ID,
    name_hash: vector<u8>,
}

public struct EntryRemoved has copy, drop {
    project_id: ID,
    directory_id: ID,
    name_hash: vector<u8>,
    is_directory: bool,
}

public fun emit_project_created(
    project_id: ID,
    root_directory_id: ID,
    access_registry_id: ID,
    created_by: address,
) {
    event::emit(ProjectCreated {
        project_id,
        root_directory_id,
        access_registry_id,
        created_by,
    });
}

public fun emit_access_granted(project_id: ID, who: address, perm: u8) {
    event::emit(AccessGranted { project_id, who, perm });
}

public fun emit_access_revoked(project_id: ID, who: address) {
    event::emit(AccessRevoked { project_id, who });
}

public fun emit_directory_created(
    project_id: ID,
    directory_id: ID,
    parent_id: ID,
    name_hash: vector<u8>,
    created_by: address,
) {
    event::emit(DirectoryCreated {
        project_id,
        directory_id,
        parent_id,
        name_hash,
        created_by,
    });
}

public fun emit_file_created(
    project_id: ID,
    file_id: ID,
    directory_id: ID,
    name_hash: vector<u8>,
    created_by: address,
) {
    event::emit(FileCreated {
        project_id,
        file_id,
        directory_id,
        name_hash,
        created_by,
    });
}

public fun emit_version_added(
    project_id: ID,
    file_id: ID,
    version: u64,
    content_blob_id: vector<u8>,
    metadata_blob_id: vector<u8>,
    created_by: address,
) {
    event::emit(VersionAdded {
        project_id,
        file_id,
        version,
        content_blob_id,
        metadata_blob_id,
        created_by,
    });
}

public fun emit_file_moved(
    project_id: ID,
    file_id: ID,
    from_directory_id: ID,
    to_directory_id: ID,
    name_hash: vector<u8>,
) {
    event::emit(FileMoved {
        project_id,
        file_id,
        from_directory_id,
        to_directory_id,
        name_hash,
    });
}

public fun emit_entry_removed(
    project_id: ID,
    directory_id: ID,
    name_hash: vector<u8>,
    is_directory: bool,
) {
    event::emit(EntryRemoved {
        project_id,
        directory_id,
        name_hash,
        is_directory,
    });
}
