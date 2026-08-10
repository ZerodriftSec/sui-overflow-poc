#[test_only]
module content_vault::dirsys_tests;

use content_vault::access::{Self, AccessRegistry, ProjectAdminCap};
use content_vault::directory::{Self, Directory};
use content_vault::file::{Self, File};
use content_vault::project::{Self, Project};
use content_vault::seal_policy;
use content_vault::utils;
use std::string;
use sui::clock::Clock;
use sui::test_scenario::{Self as ts, Scenario};

const ADMIN: address = @0xA11CE;
const BOB: address = @0xB0B;
const CAROL: address = @0xCA201;

fun setup(scenario: &mut Scenario) {
    scenario.create_system_objects();
}

fun create_test_project(scenario: &mut Scenario, title: vector<u8>): ProjectAdminCap {
    let clock = scenario.take_shared<Clock>();
    let (cap, registry, root, project) =
        project::create_project(string::utf8(title), &clock, scenario.ctx());
    project::share_project_objects(registry, root, project);
    ts::return_shared(clock);
    cap
}

fun take_project_bundle(scenario: &Scenario): (Project, Directory, AccessRegistry) {
    let project = scenario.take_shared<Project>();
    let root_id = project.root_directory_id();
    let registry_id = project.access_registry_id();
    let root = ts::take_shared_by_id<Directory>(scenario, root_id);
    let registry = ts::take_shared_by_id<AccessRegistry>(scenario, registry_id);
    (project, root, registry)
}

fun return_project_bundle(project: Project, root: Directory, registry: AccessRegistry) {
    ts::return_shared(project);
    ts::return_shared(root);
    ts::return_shared(registry);
}

#[test]
fun test_create_project_can_seed_directories_before_finalize() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    {
        let clock = scenario.take_shared<Clock>();
        let (cap, registry, mut root, project) =
            project::create_project(string::utf8(b"Seeded"), &clock, scenario.ctx());

        let script = utils::name_hash(project.id(), b"script");
        let characters = utils::name_hash(project.id(), b"characters");
        let environments = utils::name_hash(project.id(), b"environments");
        let storyboard = utils::name_hash(project.id(), b"storyboard");
        let video_clip = utils::name_hash(project.id(), b"video clip");

        let d1 = directory::create_directory(&mut root, &registry, script, &clock, scenario.ctx());
        let d2 = directory::create_directory(&mut root, &registry, characters, &clock, scenario.ctx());
        let d3 = directory::create_directory(&mut root, &registry, environments, &clock, scenario.ctx());
        let d4 = directory::create_directory(&mut root, &registry, storyboard, &clock, scenario.ctx());
        let d5 = directory::create_directory(&mut root, &registry, video_clip, &clock, scenario.ctx());

        assert!(directory::entry_count(&root) == 5, 0);

        directory::share_directory(d1);
        directory::share_directory(d2);
        directory::share_directory(d3);
        directory::share_directory(d4);
        directory::share_directory(d5);
        project::finalize_project(cap, registry, root, project, scenario.ctx());
        ts::return_shared(clock);
    };

    scenario.next_tx(ADMIN);
    {
        let (project, root, registry) = take_project_bundle(&scenario);
        assert!(directory::entry_count(&root) == 5, 1);
        assert!(directory::contains(&root, utils::name_hash(project.id(), b"script")), 2);
        assert!(directory::contains(&root, utils::name_hash(project.id(), b"characters")), 3);
        assert!(directory::contains(&root, utils::name_hash(project.id(), b"environments")), 4);
        assert!(directory::contains(&root, utils::name_hash(project.id(), b"storyboard")), 5);
        assert!(directory::contains(&root, utils::name_hash(project.id(), b"video clip")), 6);
        return_project_bundle(project, root, registry);
    };

    scenario.end();
}

#[test]
fun test_create_project_bootstraps_acl_and_root() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    {
        let cap = create_test_project(&mut scenario, b"Demo");
        assert!(access::admin_project_id(&cap) != object::id_from_address(@0x0), 0);
        transfer::public_transfer(cap, ADMIN);
    };

    scenario.next_tx(ADMIN);
    {
        let (project, root, registry) = take_project_bundle(&scenario);
        assert!(project.owner() == ADMIN, 1);
        assert!(project.title() == string::utf8(b"Demo"), 2);
        assert!(directory::project_id(&root) == project.id(), 3);
        assert!(directory::entry_count(&root) == 0, 4);
        assert!(directory::parent(&root).is_none(), 5);
        assert!(access::has_perm(&registry, ADMIN, access::full()), 6);
        assert!(access::project_id(&registry) == project.id(), 7);
        return_project_bundle(project, root, registry);
    };

    scenario.end();
}

#[test]
fun test_grant_revoke_access() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    {
        let cap = create_test_project(&mut scenario, b"ACL");
        transfer::public_transfer(cap, ADMIN);
    };

    scenario.next_tx(ADMIN);
    {
        let (project, root, mut registry) = take_project_bundle(&scenario);
        let cap = scenario.take_from_sender<ProjectAdminCap>();
        access::grant(&mut registry, &cap, BOB, access::read_write());
        assert!(access::has_perm(&registry, BOB, access::read()), 0);
        assert!(access::has_perm(&registry, BOB, access::write()), 1);
        assert!(!access::has_perm(&registry, BOB, access::admin()), 2);
        access::revoke(&mut registry, &cap, BOB);
        assert!(!access::has_perm(&registry, BOB, access::read()), 3);
        scenario.return_to_sender(cap);
        return_project_bundle(project, root, registry);
    };

    scenario.end();
}

#[test]
fun test_create_subdirectory_and_file_with_versions() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    {
        let cap = create_test_project(&mut scenario, b"Files");
        transfer::public_transfer(cap, ADMIN);
    };

    let mut file_id;

    scenario.next_tx(ADMIN);
    {
        let (project, mut root, registry) = take_project_bundle(&scenario);
        let clock = scenario.take_shared<Clock>();
        let name = utils::name_hash(project.id(), b"script.txt");

        file_id = file::create_file(
            &mut root,
            &registry,
            name,
            b"text/plain",
            b"blob-v1",
            b"hash-v1",
            42,
            b"meta-v1",
            100,
            &clock,
            scenario.ctx(),
        );

        assert!(directory::contains(&root, name), 0);
        assert!(directory::entry_count(&root) == 1, 1);
        let entry = directory::borrow_entry(&root, name);
        assert!(!directory::entry_is_directory(entry), 2);
        assert!(directory::entry_object_id(entry) == file_id, 3);

        ts::return_shared(clock);
        return_project_bundle(project, root, registry);
    };

    scenario.next_tx(ADMIN);
    {
        let (project, root, registry) = take_project_bundle(&scenario);
        let mut file_obj = ts::take_shared_by_id<File>(&scenario, file_id);
        let clock = scenario.take_shared<Clock>();

        assert!(file::current_version(&file_obj) == 1, 0);
        assert!(file::version_count(&file_obj) == 1, 1);
        assert!(
            file::version_content_blob_id(file::borrow_version(&file_obj, 1)) == b"blob-v1",
            2,
        );

        file::add_version(
            &mut file_obj,
            &registry,
            b"blob-v2",
            b"hash-v2",
            99,
            b"meta-v2",
            200,
            &clock,
            scenario.ctx(),
        );

        assert!(file::current_version(&file_obj) == 2, 3);
        assert!(file::version_count(&file_obj) == 2, 4);
        assert!(
            file::version_content_blob_id(file::borrow_version(&file_obj, 1)) == b"blob-v1",
            5,
        );
        assert!(
            file::version_content_blob_id(file::borrow_version(&file_obj, 2)) == b"blob-v2",
            6,
        );

        ts::return_shared(clock);
        ts::return_shared(file_obj);
        return_project_bundle(project, root, registry);
    };

    scenario.end();
}

#[test]
fun test_move_file_between_directories() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    {
        let cap = create_test_project(&mut scenario, b"Move");
        transfer::public_transfer(cap, ADMIN);
    };

    let mut file_id;
    let mut sub_id;
    let mut name;

    scenario.next_tx(ADMIN);
    {
        let (project, mut root, registry) = take_project_bundle(&scenario);
        let clock = scenario.take_shared<Clock>();
        name = utils::name_hash(project.id(), b"asset.bin");
        let sub_name = utils::name_hash(project.id(), b"assets");

        let sub = directory::create_directory(
            &mut root,
            &registry,
            sub_name,
            &clock,
            scenario.ctx(),
        );
        sub_id = directory::id(&sub);
        directory::share_directory(sub);

        file_id = file::create_file(
            &mut root,
            &registry,
            name,
            b"application/octet-stream",
            b"c1",
            b"h1",
            10,
            b"m1",
            50,
            &clock,
            scenario.ctx(),
        );

        ts::return_shared(clock);
        return_project_bundle(project, root, registry);
    };

    scenario.next_tx(ADMIN);
    {
        let (project, mut root, registry) = take_project_bundle(&scenario);
        let mut sub = ts::take_shared_by_id<Directory>(&scenario, sub_id);
        let mut file_obj = ts::take_shared_by_id<File>(&scenario, file_id);

        file::move_file(&mut file_obj, &mut root, &mut sub, &registry, name, scenario.ctx());

        assert!(!directory::contains(&root, name), 0);
        assert!(directory::contains(&sub, name), 1);
        assert!(file::directory_id(&file_obj) == sub_id, 2);

        ts::return_shared(file_obj);
        ts::return_shared(sub);
        return_project_bundle(project, root, registry);
    };

    scenario.end();
}

#[test]
fun test_seal_approve_allows_readers() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    {
        let cap = create_test_project(&mut scenario, b"Seal");
        transfer::public_transfer(cap, ADMIN);
    };

    scenario.next_tx(ADMIN);
    {
        let (project, root, mut registry) = take_project_bundle(&scenario);
        let cap = scenario.take_from_sender<ProjectAdminCap>();
        access::grant(&mut registry, &cap, BOB, access::read());
        scenario.return_to_sender(cap);
        return_project_bundle(project, root, registry);
    };

    scenario.next_tx(BOB);
    {
        let (project, root, registry) = take_project_bundle(&scenario);
        let file_id = object::id_from_address(@0xF11E);
        let id = utils::build_seal_id(project.id(), file_id, b"nonce");
        seal_policy::assert_seal_approve(id, &registry, scenario.ctx());
        return_project_bundle(project, root, registry);
    };

    scenario.end();
}

#[test, expected_failure(abort_code = content_vault::access::ENoAccess)]
fun test_seal_approve_rejects_without_read() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    {
        let cap = create_test_project(&mut scenario, b"SealDeny");
        transfer::public_transfer(cap, ADMIN);
    };

    scenario.next_tx(CAROL);
    {
        let (project, root, registry) = take_project_bundle(&scenario);
        let file_id = object::id_from_address(@0xF11E);
        let id = utils::build_seal_id(project.id(), file_id, b"nonce");
        seal_policy::assert_seal_approve(id, &registry, scenario.ctx());
        return_project_bundle(project, root, registry);
    };

    scenario.end();
}

#[test, expected_failure(abort_code = content_vault::seal_policy::EBadIdentity)]
fun test_seal_approve_rejects_wrong_project_prefix() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    {
        let cap = create_test_project(&mut scenario, b"SealBadId");
        transfer::public_transfer(cap, ADMIN);
    };

    scenario.next_tx(ADMIN);
    {
        let (project, root, registry) = take_project_bundle(&scenario);
        let wrong_project = object::id_from_address(@0xDEAD);
        let file_id = object::id_from_address(@0xF11E);
        let id = utils::build_seal_id(wrong_project, file_id, b"nonce");
        seal_policy::assert_seal_approve(id, &registry, scenario.ctx());
        return_project_bundle(project, root, registry);
    };

    scenario.end();
}

#[test, expected_failure(abort_code = content_vault::access::ENoAccess)]
fun test_write_requires_permission() {
    let mut scenario = ts::begin(ADMIN);
    setup(&mut scenario);

    scenario.next_tx(ADMIN);
    {
        let cap = create_test_project(&mut scenario, b"WriteAcl");
        transfer::public_transfer(cap, ADMIN);
    };

    scenario.next_tx(BOB);
    {
        let (project, mut root, registry) = take_project_bundle(&scenario);
        let clock = scenario.take_shared<Clock>();
        let name = utils::name_hash(project.id(), b"secret.txt");
        file::create_file(
            &mut root,
            &registry,
            name,
            b"text/plain",
            b"c",
            b"h",
            1,
            b"m",
            1,
            &clock,
            scenario.ctx(),
        );
        ts::return_shared(clock);
        return_project_bundle(project, root, registry);
    };

    scenario.end();
}

#[test]
fun test_name_hash_is_project_scoped() {
    let a = object::id_from_address(@0x1);
    let b = object::id_from_address(@0x2);
    let ha = utils::name_hash(a, b"readme.md");
    let hb = utils::name_hash(b, b"readme.md");
    assert!(ha != hb, 0);
    assert!(ha == utils::name_hash(a, b"readme.md"), 1);
}

#[test]
fun test_utils_is_prefix() {
    assert!(utils::is_prefix(b"abc", b"abcdef"), 0);
    assert!(!utils::is_prefix(b"abcdef", b"abc"), 1);
    assert!(utils::is_prefix(b"", b"x"), 2);
    assert!(!utils::is_prefix(b"abx", b"abcdef"), 3);
}
