module content_vault::project;

use content_vault::access::{Self, AccessRegistry, ProjectAdminCap};
use content_vault::directory::{Self, Directory};
use content_vault::events;
use std::string::String;

/// Shared project object: ownership root + pointers to ACL and root directory.
public struct Project has key {
    id: UID,
    /// Optional human title (non-sensitive); rich metadata stays off-chain.
    title: String,
    owner: address,
    access_registry_id: ID,
    root_directory_id: ID,
    created_at_ms: u64,
}

public fun id(project: &Project): ID {
    object::id(project)
}

public fun title(project: &Project): String {
    project.title
}

public fun owner(project: &Project): address {
    project.owner
}

public fun access_registry_id(project: &Project): ID {
    project.access_registry_id
}

public fun root_directory_id(project: &Project): ID {
    project.root_directory_id
}

public fun created_at_ms(project: &Project): u64 {
    project.created_at_ms
}

/// Create a project with root directory, access registry, and admin cap.
/// Grants the creator full READ|WRITE|ADMIN permissions.
///
/// Objects are returned unsared for PTB composability (e.g. create default
/// directories under `root`, then `finalize_project`).
public fun create_project(
    title: String,
    clock: &sui::clock::Clock,
    ctx: &mut TxContext,
): (ProjectAdminCap, AccessRegistry, Directory, Project) {
    let created_at_ms = sui::clock::timestamp_ms(clock);
    let project_uid = object::new(ctx);
    let project_id = object::uid_to_inner(&project_uid);

    let mut registry = access::create_registry(project_id, ctx);
    let registry_id = access::registry_id(&registry);
    access::bootstrap_grant(&mut registry, ctx.sender(), access::full());

    let root = directory::create_root(project_id, created_at_ms, ctx);
    let root_id = directory::id(&root);

    let admin_cap = access::create_admin_cap(project_id, ctx);

    let project = Project {
        id: project_uid,
        title,
        owner: ctx.sender(),
        access_registry_id: registry_id,
        root_directory_id: root_id,
        created_at_ms,
    };
    events::emit_project_created(project_id, root_id, registry_id, ctx.sender());

    (admin_cap, registry, root, project)
}

/// Share registry/root/project and transfer the admin cap to the sender.
/// Call after any PTB chaining that needs the unsared objects from `create_project`.
public fun finalize_project(
    admin_cap: ProjectAdminCap,
    registry: AccessRegistry,
    root: Directory,
    project: Project,
    ctx: &TxContext,
) {
    share_project_objects(registry, root, project);
    transfer::public_transfer(admin_cap, ctx.sender());
}

/// Share the project bundle without transferring the admin cap.
public fun share_project_objects(
    registry: AccessRegistry,
    root: Directory,
    project: Project,
) {
    access::share_registry(registry);
    directory::share(root);
    transfer::share_object(project);
}

/// Entry wrapper: creates project and transfers admin cap to sender.
entry fun create_project_entry(
    title: String,
    clock: &sui::clock::Clock,
    ctx: &mut TxContext,
) {
    let (admin_cap, registry, root, project) = create_project(title, clock, ctx);
    finalize_project(admin_cap, registry, root, project, ctx);
}

/// Update the on-chain title (admin only).
public fun set_title(
    project: &mut Project,
    admin: &ProjectAdminCap,
    title: String,
) {
    access::assert_admin_cap(admin, object::id(project));
    project.title = title;
}

entry fun set_title_entry(
    project: &mut Project,
    admin: &ProjectAdminCap,
    title: String,
) {
    set_title(project, admin, title);
}

/// Convenience: assert a directory belongs to this project.
public fun assert_directory_in_project(project: &Project, directory: &Directory) {
    assert!(directory::project_id(directory) == object::id(project), 0);
    assert!(
        directory::id(directory) == project.root_directory_id
            || directory::parent(directory).is_some(),
        0,
    );
}
