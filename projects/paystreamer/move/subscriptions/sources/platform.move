/// definitions, treasury timelock, per-platform rate limiters, and
/// `subscriber_count` bookkeeping.
///
/// caller can read it; mutating functions (`update_platform`, tier
/// the owner is the address captured at `register_platform` time and
/// **bootstrap `admin_address` style check** — mirroring
/// `subscriptions::registry` — with a doc comment noting the future
/// the bootstrap admin pattern.
///
/// The platform is identified by `Platform.owner: address` (set at
/// `register_platform` to `ctx.sender()`). Mutating functions assert
/// `ctx.sender() == platform.owner`. A future hardening pass will
///
/// 1. `volume_limiter` (`FixedWindow`, 30d, $1M) — bounds total
///    withdrawal volume per 30-day window.
/// 2. `frequency_limiter` (`Bucket`, 1000/hr, refill 100/hr) — bounds
///    total payment frequency per platform per hour.
/// 3. `account_billing_limiter` (`Bucket`, 10000/hr, refill 1000/hr) —
///    bounds distinct accounts billed per hour (DoS bound).
///
/// All three are OZ `RateLimiter` values; `payment.move` calls
/// `try_consume_*` and observes `try_consume`'s all-or-nothing
/// semantics (failure leaves persisted state untouched).
///
/// Two-step `propose_treasury_change(new_addr)` →
/// `accept_treasury_change(platform, clock)` (48h timelock) pattern,
/// treasury-hijack gap.
///
/// Maintained by `increment_subscriber_count` /
/// `decrement_subscriber_count` (both `public(package)`). The only
/// expected caller is `billing.move` on `create_subscription` /
/// `cancel_subscription`. Discovery is finally not broken.
///
/// ## Build-order note
///
/// module; no other module needs the type). `billing.move` consumes
/// `tier_amount` and `tier_frequency_ms` via the accessors exposed
/// value type (`store + copy + drop`) embedded in the platform's
/// `VecMap<u64, SubscriptionTier>` keyed by `tier_index` (sequential)
/// so the index is stable across deactivations.
#[allow(lint(share_owned))]
module subscriptions::platform {
    use sui::object;
    use sui::clock::Clock;
    use sui::vec_map::{Self, VecMap};
    use sui::event;
    use sui::transfer;
    use sui::tx_context::TxContext;
    use std::string::String;
    use openzeppelin_utils::rate_limiter::{Self, RateLimiter};
    use std::type_name::{Self, TypeName};

    // === Errors ===

    /// The caller is not the platform owner. `ctx.sender() != platform.owner`.
    /// All owner-gated functions abort with this code on mismatch.
    const EInvalidOwner: u64 = 0x08001;

    /// Tier validation failure (e.g. duplicate name in `create_tier`).
    const EInvalidTier: u64 = 0x08002;

    /// `create_tier` would exceed `MAX_TIERS` (20). Caps the on-chain
    /// footprint of a single platform.
    const ETooManyTiers: u64 = 0x08003;

    /// The `tier_index` is out of range. `tier_index >= vec_map::length(&tiers)`.
    const ETierNotFound: u64 = 0x08004;

    /// A zero address was supplied where a real address is required
    /// (e.g. treasury change target).
    const EZeroAddress: u64 = 0x08005;

    /// A zero `amount` was supplied where a positive value is required
    /// (tier billing amount).
    const EInvalidAmount: u64 = 0x08006;

    /// A zero `frequency_ms` was supplied for a tier.
    const EInvalidFrequency: u64 = 0x08007;

    /// `propose_treasury_change` was called while another change is
    /// already pending. The timelock is single-slot; cancel first.
    const ETreasuryChangeAlreadyPending: u64 = 0x08008;

    /// A treasury-change operation was attempted with no pending
    /// change on the platform.
    const ENoPendingTreasuryChange: u64 = 0x08009;

    /// `accept_treasury_change` was called before the timelock elapsed.
    /// 48h between `propose` and `accept`.
    const ETreasuryChangeNotYetDue: u64 = 0x0800A;

    // === SubscriptionTier ===

    /// A platform-defined billing tier. `copy + drop + store` so it can
    /// off-chain indexers without lifetime gymnastics. `name` is the
    /// human-readable label (e.g. `"Basic"`, `"Pro"`); uniqueness is
    /// enforced at `create_tier` time.
    public struct SubscriptionTier has copy, drop, store {
        name: String,
        amount: u64,
        frequency_ms: u64,
        denomination: TypeName,
        is_active: bool,
    }

    /// Construct a fresh active tier. Pure value constructor; no
    /// permission required. The owner of the platform calls
    /// `create_tier` to attach the new tier; that function is the one
    /// that mutates the platform.
    public fun new_tier(
        name: String,
        amount: u64,
        frequency_ms: u64,
        denomination: TypeName,
    ): SubscriptionTier {
        SubscriptionTier { name, amount, frequency_ms, denomination, is_active: true }
    }

    /// Tier display name.
    public fun tier_name(t: &SubscriptionTier): &String { &t.name }
    /// Per-billing-cycle amount, in the smallest unit of the tier's denomination.
    public fun tier_amount(t: &SubscriptionTier): u64 { t.amount }
    /// Per-billing-cycle interval, in milliseconds.
    public fun tier_frequency_ms(t: &SubscriptionTier): u64 { t.frequency_ms }
    /// Coin denomination (`TypeName` of the billing token).
    public fun tier_denomination(t: &SubscriptionTier): &TypeName { &t.denomination }
    /// True iff the tier is currently active (a deactivated tier
    /// remains in the map at its original index but is rejected by
    /// `payment.move`).
    public fun tier_is_active(t: &SubscriptionTier): bool { t.is_active }

    /// Flip the tier's `is_active` to `false`. `public(package)` —
    /// `platform.move` is the only module that should be calling this;
    /// external callers must go through `deactivate_tier_by_index`.
    public(package) fun deactivate_tier(t: &mut SubscriptionTier) { t.is_active = false; }

    // === PendingTreasuryChange ===

    /// A two-step treasury rotation in flight. `new_treasury` is the
    /// address that will replace `platform.treasury` once the timelock
    /// (`execute_after_ms = now + TREASURY_CHANGE_DELAY_MS`) elapses
    /// and `accept_treasury_change` is called.
    public struct PendingTreasuryChange has copy, drop, store {
        new_treasury: address,
        execute_after_ms: u64,
    }

    /// Build a fresh `PendingTreasuryChange`. Pure value constructor.
    public fun new_pending_treasury_change(
        new_treasury: address,
        execute_after_ms: u64,
    ): PendingTreasuryChange {
        PendingTreasuryChange { new_treasury, execute_after_ms }
    }

    /// The proposed new treasury address.
    public fun pending_treasury_new(p: &PendingTreasuryChange): address { p.new_treasury }
    /// The absolute timestamp (ms) at which `accept_treasury_change`
    /// becomes valid.
    public fun pending_treasury_execute_after_ms(p: &PendingTreasuryChange): u64 {
        p.execute_after_ms
    }

    // === Platform ===

    /// A platform that accepts subscription payments. Stored as a
    /// shared object so any caller can read it; mutating functions
    /// require the platform owner (`ctx.sender() == platform.owner`).
    ///
    /// `owner` is the bootstrap admin address. A future hardening
    /// pass will replace this with an embedded
        /// (one role per module, OZ invariant). The same role is
        ///
    /// `tiers` is keyed by `tier_index` (sequential insertion order)
    /// stores `tier_index`, not a tier id, and re-uses the slot on
    /// `deactivate_tier_by_index` without renumbering.
    public struct Platform has key, store {
        id: object::UID,
        /// Bootstrap admin (captured from `ctx.sender()` at registration).
        owner: address,
        /// Current treasury. All platform payments land here until a
        /// timelocked change is accepted.
        treasury: address,
        /// In-flight treasury change, if any. `None` when no change is pending.
        pending_treasury: std::option::Option<PendingTreasuryChange>,
        /// Display name.
        name: String,
        /// Display description.
        description: String,
        /// Category (e.g. `"AI"`, `"Media"`, `"Tools"`).
        category: String,
        /// Optional webhook URL for off-chain notifications.
        webhook_url: std::option::Option<String>,
        /// Verified-platform flag. Flipped by a future moderation
        is_verified: bool,
        /// `decrement_subscriber_count`. Off-chain indexers can use this
        /// directly for discovery / leaderboards.
        subscriber_count: u64,
        /// Creation timestamp (ms, Sui `Clock`).
        created_at: u64,
        /// Sequential tiers, keyed by `tier_index`. Insertion order is
        /// the index; deactivation keeps the slot populated (set
        /// `is_active = false`) so historical subscriptions keep
        /// pointing at the right `tier_index`.
        tiers: VecMap<u64, SubscriptionTier>,
        /// Volume limiter: `FixedWindow`, 30d, $1M default. Bounds the
        /// total withdrawal volume per 30-day window.
        volume_limiter: RateLimiter,
        /// Frequency limiter: `Bucket`, 1000/hr, refill 100/hr. Bounds
        /// the total number of payments per hour.
        frequency_limiter: RateLimiter,
        /// Account-billing limiter: `Bucket`, 10000/hr, refill 1000/hr.
        /// Bounds the distinct accounts billed per hour (DoS bound).
        account_billing_limiter: RateLimiter,
        /// Schema version. Currently `2`.
        version: u16,
    }

    /// 48-hour treasury-change timelock. Same shape as the OZ root-role
    const TREASURY_CHANGE_DELAY_MS: u64 = 48 * 60 * 60 * 1_000;

    /// Maximum number of tiers per platform. Caps on-chain footprint
    /// and prevents an owner from creating an unbounded list.
    const MAX_TIERS: u64 = 20;

    // === Events ===
    //
    // Every event carries a `v: u16 = 2` field for indexer discrimination
    // changes; adding a field is a minor version bump, removing a field
    // is a major version bump that requires a migration.

    /// Emitted on every successful `register_platform`.
    public struct PlatformRegistered has copy, drop {
        platform_id: ID,
        owner: address,
        name: String,
        v: u16,
    }

    /// Emitted on every successful `update_platform`.
    public struct PlatformUpdated has copy, drop {
        platform_id: ID,
        updated_by: address,
        v: u16,
    }

    /// Emitted on every successful `create_tier`.
    public struct TierCreated has copy, drop {
        platform_id: ID,
        tier_index: u64,
        tier_name: String,
        amount: u64,
        frequency_ms: u64,
        denomination: TypeName,
        v: u16,
    }

    /// Emitted on every successful `deactivate_tier_by_index`.
    public struct TierDeactivated has copy, drop {
        platform_id: ID,
        tier_index: u64,
        v: u16,
    }

    /// Emitted on every successful `propose_treasury_change`.
    public struct TreasuryChangeProposed has copy, drop {
        platform_id: ID,
        new_treasury: address,
        execute_after_ms: u64,
        v: u16,
    }

    /// Emitted on every successful `accept_treasury_change`.
    public struct TreasuryChangeAccepted has copy, drop {
        platform_id: ID,
        new_treasury: address,
        v: u16,
    }

    /// Emitted on every successful `cancel_treasury_change`.
    public struct TreasuryChangeCancelled has copy, drop {
        platform_id: ID,
        v: u16,
    }

    /// Emitted on every subscriber-count change (subscribe or cancel).
    /// `is_increment` is `true` for an increment, `false` for a
    /// decrement. `delta_magnitude` is the absolute delta (always `1`
    /// the post-update value. The signed delta is reconstructable as
    /// `if (is_increment) delta_magnitude else 0 - delta_magnitude`.
    public struct SubscriberCountChanged has copy, drop {
        platform_id: ID,
        new_count: u64,
        is_increment: bool,
        delta_magnitude: u64,
        v: u16,
    }

    // === register_platform ===

    /// Register a new platform. The caller becomes the platform owner
    /// and the initial treasury. The platform is shared so any caller
    /// can read it; mutating functions require the owner.
    ///
    /// The three rate limiters (`volume_limiter`, `frequency_limiter`,
    /// limiter state via `volume_limiter(p)` / `frequency_limiter(p)` /
    /// `account_billing_limiter(p)`.
    ///
    /// Returns the new `Platform`'s `ID` for caller convenience. The
    /// `Platform` itself is shared in this function (no separate
    /// transfer call needed).
    public fun register_platform(
        name: String,
        description: String,
        category: String,
        webhook_url: std::option::Option<String>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ID {
        let now = clock.timestamp_ms();
        let platform_uid = object::new(ctx);
        let platform_id = object::uid_to_inner(&platform_uid);

        let platform = Platform {
            id: platform_uid,
            owner: ctx.sender(),
            treasury: ctx.sender(),
            pending_treasury: std::option::none(),
            name,
            description,
            category,
            webhook_url,
            is_verified: false,
            subscriber_count: 0,
            created_at: now,
            tiers: vec_map::empty(),
            volume_limiter: rate_limiter::new_fixed_window(
                1_000_000_000_000,
                30 * 24 * 60 * 60 * 1_000,
                now,
                1_000_000_000_000,
                clock,
            ),
            frequency_limiter: rate_limiter::new_bucket(
                1000,
                100,
                60 * 60 * 1_000,
                now,
                1000,
                clock,
            ),
            account_billing_limiter: rate_limiter::new_bucket(
                10_000,
                1_000,
                60 * 60 * 1_000,
                now,
                10_000,
                clock,
            ),
            version: 2,
        };
        transfer::share_object(platform);
        event::emit(PlatformRegistered {
            platform_id,
            owner: ctx.sender(),
            name,
            v: 2,
        });
        platform_id
    }

    /// Register a new platform and create its first tier atomically.
    /// Both operations succeed or both abort — the tier is only appended
    /// if the platform registration succeeds.
    ///
    /// Returns `(platform_id, tier_index = 0)`. Emits both
    /// `PlatformRegistered` and `TierCreated`.
    ///
    /// The tier's `denomination` is derived from the generic type `T` via
    /// `type_name::with_original_ids<T>()`.
    public fun register_platform_with_tier<T>(
        name: String,
        description: String,
        category: String,
        webhook_url: std::option::Option<String>,
        tier_name: String,
        tier_amount: u64,
        tier_frequency_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): (ID, u64) {
        let now = clock.timestamp_ms();
        let platform_uid = object::new(ctx);
        let platform_id = object::uid_to_inner(&platform_uid);

        assert!(tier_amount > 0, EInvalidAmount);
        assert!(tier_frequency_ms > 0, EInvalidFrequency);

        let mut platform = Platform {
            id: platform_uid,
            owner: ctx.sender(),
            treasury: ctx.sender(),
            pending_treasury: std::option::none(),
            name,
            description,
            category,
            webhook_url,
            is_verified: false,
            subscriber_count: 0,
            created_at: now,
            tiers: vec_map::empty(),
            volume_limiter: rate_limiter::new_fixed_window(
                1_000_000_000_000,
                30 * 24 * 60 * 60 * 1_000,
                now,
                1_000_000_000_000,
                clock,
            ),
            frequency_limiter: rate_limiter::new_bucket(
                1000,
                100,
                60 * 60 * 1_000,
                now,
                1000,
                clock,
            ),
            account_billing_limiter: rate_limiter::new_bucket(
                10_000,
                1_000,
                60 * 60 * 1_000,
                now,
                10_000,
                clock,
            ),
            version: 2,
        };

        let tier_index = 0u64;
        let tier = new_tier(
            tier_name,
            tier_amount,
            tier_frequency_ms,
            type_name::with_original_ids<T>(),
        );
        vec_map::insert(&mut platform.tiers, tier_index, tier);

        event::emit(TierCreated {
            platform_id,
            tier_index,
            tier_name,
            amount: tier_amount,
            frequency_ms: tier_frequency_ms,
            denomination: type_name::with_original_ids<T>(),
            v: 2,
        });

        transfer::share_object(platform);
        event::emit(PlatformRegistered {
            platform_id,
            owner: ctx.sender(),
            name,
            v: 2,
        });

        (platform_id, tier_index)
    }

    // === update_platform (owner only) ===

    /// Update platform metadata. Each parameter is a three-state
    /// `Option<Option<T>>`:
    /// - outer `None` → leave the field unchanged;
    /// - outer `Some(None)` → clear the field (`webhook_url` only —
    ///   `name` and `description` are non-optional);
    /// - outer `Some(Some(v))` → set the field to `v`.
    ///
    /// Caller must be the platform owner. Emits `PlatformUpdated`.
    ///
    /// #### Aborts
    /// - `EInvalidOwner` if `ctx.sender() != platform.owner`.
    public fun update_platform(
        platform: &mut Platform,
        name: std::option::Option<String>,
        description: std::option::Option<String>,
        webhook_url: std::option::Option<std::option::Option<String>>,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == platform.owner, EInvalidOwner);
        if (name.is_some()) { platform.name = *name.borrow(); };
        if (description.is_some()) { platform.description = *description.borrow(); };
        if (webhook_url.is_some()) { platform.webhook_url = *webhook_url.borrow(); };
        event::emit(PlatformUpdated {
            platform_id: object::id(platform),
            updated_by: ctx.sender(),
            v: 2,
        });
    }

    // === Tier management (owner only) ===

    /// Create a new tier and append it to the platform's tier map at
    /// `tier_index = vec_map::length(&tiers)` (sequential). The
    /// `is_active` field defaults to `true`.
    ///
    /// Rejects duplicate names (compared structurally on the `String`).
    /// Rejects zero `amount` and zero `frequency_ms`. Enforces
    /// `vec_map::length(&tiers) < MAX_TIERS` (20).
    ///
    /// Caller must be the platform owner. Emits `TierCreated`.
    ///
    /// #### Aborts
    /// - `EInvalidOwner` if `ctx.sender() != platform.owner`.
    /// - `EInvalidAmount` if `amount == 0`.
    /// - `EInvalidFrequency` if `frequency_ms == 0`.
    /// - `ETooManyTiers` if the platform already has `MAX_TIERS` tiers.
    /// - `EInvalidTier` if a tier with the same `name` already exists.
    public fun create_tier(
        platform: &mut Platform,
        name: String,
        amount: u64,
        frequency_ms: u64,
        denomination: TypeName,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == platform.owner, EInvalidOwner);
        assert!(amount > 0, EInvalidAmount);
        assert!(frequency_ms > 0, EInvalidFrequency);
        assert!(vec_map::length(&platform.tiers) < MAX_TIERS, ETooManyTiers);
        let mut i: u64 = 0;
        let n = vec_map::length(&platform.tiers);
        while (i < n) {
            let (_, t) = vec_map::get_entry_by_idx(&platform.tiers, i);
            assert!(t.name != name, EInvalidTier);
            i = i + 1;
        };
        let tier_index = vec_map::length(&platform.tiers);
        let tier = new_tier(name, amount, frequency_ms, denomination);
        vec_map::insert(&mut platform.tiers, tier_index, tier);
        event::emit(TierCreated {
            platform_id: object::id(platform),
            tier_index,
            tier_name: name,
            amount,
            frequency_ms,
            denomination,
            v: 2,
        });
    }

    /// Deactivate a tier by index. The slot remains in the map (so
    /// pointing at the right place), but `is_active` flips to `false`
    /// and `payment.move` will reject it.
    ///
    /// Caller must be the platform owner. Emits `TierDeactivated`.
    ///
    /// #### Aborts
    /// - `EInvalidOwner` if `ctx.sender() != platform.owner`.
    /// - `ETierNotFound` if `tier_index >= vec_map::length(&tiers)`.
    public fun deactivate_tier_by_index(
        platform: &mut Platform,
        tier_index: u64,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == platform.owner, EInvalidOwner);
        assert!(tier_index < vec_map::length(&platform.tiers), ETierNotFound);
        let tier = vec_map::get_mut(&mut platform.tiers, &tier_index);
        tier.is_active = false;
        event::emit(TierDeactivated {
            platform_id: object::id(platform),
            tier_index,
            v: 2,
        });
    }

    /// Read-only lookup of a tier by index.
    /// Role: any caller (read-only view).
    ///
    /// #### Aborts
    /// - `ETierNotFound` if `tier_index >= vec_map::length(&tiers)`.
    public fun get_tier(platform: &Platform, tier_index: &u64): &SubscriptionTier {
        assert!(*tier_index < vec_map::length(&platform.tiers), ETierNotFound);
        vec_map::get(&platform.tiers, tier_index)
    }

    // === Treasury timelock ===

    /// Propose a new treasury address. Records the change in
    /// `pending_treasury` with `execute_after_ms = now + 48h`. Only
    /// one change can be pending at a time; cancel or accept first.
    ///
    /// Caller must be the platform owner. Emits `TreasuryChangeProposed`.
    ///
    /// #### Aborts
    /// - `EInvalidOwner` if `ctx.sender() != platform.owner`.
    /// - `EZeroAddress` if `new_treasury == @0x0`.
    /// - `ETreasuryChangeAlreadyPending` if a change is already pending.
    public fun propose_treasury_change(
        platform: &mut Platform,
        new_treasury: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == platform.owner, EInvalidOwner);
        assert!(new_treasury != @0x0, EZeroAddress);
        assert!(platform.pending_treasury.is_none(), ETreasuryChangeAlreadyPending);
        let now = clock.timestamp_ms();
        let execute_after_ms = now + TREASURY_CHANGE_DELAY_MS;
        platform.pending_treasury = std::option::some(PendingTreasuryChange {
            new_treasury,
            execute_after_ms,
        });
        event::emit(TreasuryChangeProposed {
            platform_id: object::id(platform),
            new_treasury,
            execute_after_ms,
            v: 2,
        });
    }

    /// Accept a pending treasury change. After 48h, anyone can call
    /// this — the function has no `ctx.sender()` check, mirroring the
    /// OZ timelock semantic where accepting is permissionless once
    /// the delay elapses. The platform's `treasury` is updated and
    /// `pending_treasury` is cleared.
    ///
    /// Emits `TreasuryChangeAccepted`.
    ///
    /// #### Aborts
    /// - `ENoPendingTreasuryChange` if there is no change pending.
    /// - `ETreasuryChangeNotYetDue` if `now < pending.execute_after_ms`.
    public fun accept_treasury_change(
        platform: &mut Platform,
        clock: &Clock,
        _ctx: &mut TxContext,
    ) {
        assert!(platform.pending_treasury.is_some(), ENoPendingTreasuryChange);
        let now = clock.timestamp_ms();
        let pending = *platform.pending_treasury.borrow();
        assert!(now >= pending.execute_after_ms, ETreasuryChangeNotYetDue);
        platform.treasury = pending.new_treasury;
        platform.pending_treasury = std::option::none();
        event::emit(TreasuryChangeAccepted {
            platform_id: object::id(platform),
            new_treasury: pending.new_treasury,
            v: 2,
        });
    }

    /// Cancel a pending treasury change. Clears `pending_treasury`
    /// without touching the live `treasury`. Caller must be the
    /// platform owner.
    ///
    /// Emits `TreasuryChangeCancelled`.
    ///
    /// #### Aborts
    /// - `EInvalidOwner` if `ctx.sender() != platform.owner`.
    /// - `ENoPendingTreasuryChange` if there is no change pending.
    public fun cancel_treasury_change(
        platform: &mut Platform,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == platform.owner, EInvalidOwner);
        assert!(platform.pending_treasury.is_some(), ENoPendingTreasuryChange);
        platform.pending_treasury = std::option::none();
        event::emit(TreasuryChangeCancelled {
            platform_id: object::id(platform),
            v: 2,
        });
    }

    // === subscriber_count bookkeeping (called by billing.move via public(package)) ===

    /// Bump `subscriber_count` by 1. `public(package)` so only
    /// `billing.move` (same package) can call this — a foreign module
    /// cannot inflate a platform's subscriber count.
    public(package) fun increment_subscriber_count(platform: &mut Platform) {
        platform.subscriber_count = platform.subscriber_count + 1;
        event::emit(SubscriberCountChanged {
            platform_id: object::id(platform),
            new_count: platform.subscriber_count,
            is_increment: true,
            delta_magnitude: 1,
            v: 2,
        });
    }

    /// Decrement `subscriber_count` by 1, floored at 0. `public(package)`.
    /// The floor guards against accidental underflow if a stale
    /// `cancel` arrives after a previous decrement raced.
    public(package) fun decrement_subscriber_count(platform: &mut Platform) {
        if (platform.subscriber_count > 0) {
            platform.subscriber_count = platform.subscriber_count - 1;
        };
        event::emit(SubscriberCountChanged {
            platform_id: object::id(platform),
            new_count: platform.subscriber_count,
            is_increment: false,
            delta_magnitude: 1,
            v: 2,
        });
    }

    // === Rate-limiter accessors (used by payment.move) ===

    /// Read-only handle to the volume limiter.
    /// Role: any caller (read-only view).
    public fun volume_limiter(platform: &Platform): &RateLimiter { &platform.volume_limiter }
    /// Read-only handle to the frequency limiter.
    /// Role: any caller (read-only view).
    public fun frequency_limiter(platform: &Platform): &RateLimiter { &platform.frequency_limiter }
    /// Read-only handle to the account-billing limiter.
    /// Role: any caller (read-only view).
    public fun account_billing_limiter(platform: &Platform): &RateLimiter {
        &platform.account_billing_limiter
    }

    /// Try to consume `amount` from the platform's volume limiter.
    /// `public(package)` — only `payment.move` should call this. All-or-nothing:
    /// on failure (`false`) persisted state is left untouched, so a
    /// downstream step that aborts will not have burned limiter headroom.
    public(package) fun try_consume_volume(
        platform: &mut Platform,
        amount: u64,
        clock: &Clock,
    ): bool {
        rate_limiter::try_consume(&mut platform.volume_limiter, amount, clock)
    }

    /// Try to consume 1 unit from the platform's frequency limiter.
    /// `public(package)`. See `try_consume_volume` for all-or-nothing semantics.
    public(package) fun try_consume_frequency(
        platform: &mut Platform,
        clock: &Clock,
    ): bool {
        rate_limiter::try_consume(&mut platform.frequency_limiter, 1, clock)
    }

    /// Try to consume 1 unit from the platform's account-billing limiter.
    /// `public(package)`. See `try_consume_volume` for all-or-nothing semantics.
    public(package) fun try_consume_account_billing(
        platform: &mut Platform,
        clock: &Clock,
    ): bool {
        rate_limiter::try_consume(&mut platform.account_billing_limiter, 1, clock)
    }

    // === Accessors (view) ===

    /// `object::id` of the platform.
    /// Role: any caller (read-only view).
    public fun id(p: &Platform): ID { object::id(p) }

    /// Bootstrap admin / platform owner.
    /// Role: any caller (read-only view).
    public fun owner(p: &Platform): address { p.owner }

    /// Current treasury. This is the address payments land at.
    /// Role: any caller (read-only view).
    public fun treasury(p: &Platform): address { p.treasury }

    /// Display name.
    /// Role: any caller (read-only view).
    public fun name(p: &Platform): &String { &p.name }

    /// Display description.
    /// Role: any caller (read-only view).
    public fun description(p: &Platform): &String { &p.description }

    /// Display category.
    /// Role: any caller (read-only view).
    public fun category(p: &Platform): &String { &p.category }

    /// Optional webhook URL.
    /// Role: any caller (read-only view).
    public fun webhook_url(p: &Platform): &std::option::Option<String> { &p.webhook_url }

    /// Verified-platform flag.
    /// Role: any caller (read-only view).
    public fun is_verified(p: &Platform): bool { p.is_verified }

    /// Role: any caller (read-only view).
    public fun subscriber_count(p: &Platform): u64 { p.subscriber_count }

    /// Creation timestamp (ms).
    /// Role: any caller (read-only view).
    public fun created_at(p: &Platform): u64 { p.created_at }

    /// Schema version (currently `2`).
    /// Role: any caller (read-only view).
    public fun version(p: &Platform): u16 { p.version }

    /// Number of tiers. Includes deactivated tiers (slots stay
    /// populated, see `deactivate_tier_by_index`).
    /// Role: any caller (read-only view).
    public fun tier_count(p: &Platform): u64 { vec_map::length(&p.tiers) }

    /// Read-only handle to the full tier map. Lets off-chain tooling
    /// iterate without re-fetching.
    /// Role: any caller (read-only view).
    public fun tiers(p: &Platform): &VecMap<u64, SubscriptionTier> { &p.tiers }

    /// In-flight treasury change, or `None` if no change is pending.
    /// Role: any caller (read-only view).
    public fun pending_treasury(p: &Platform): &std::option::Option<PendingTreasuryChange> {
        &p.pending_treasury
    }

    /// 48h treasury-change timelock (ms). Exposed for indexers and
    /// off-chain UIs that want to display "executing in N hours".
    public fun treasury_change_delay_ms(): u64 { TREASURY_CHANGE_DELAY_MS }

    /// Maximum tier count per platform.
    public fun max_tiers(): u64 { MAX_TIERS }

    // === Test-only ===

    /// Test-only constructor. Mirrors `register_platform` but returns
    /// the `Platform` by value without going through the shared-object
    /// limiter defaults so unit tests exercise the production path.
    #[test_only]
    public fun new_platform_for_testing(clock: &Clock, ctx: &mut TxContext): Platform {
        let now = clock.timestamp_ms();
        Platform {
            id: object::new(ctx),
            owner: ctx.sender(),
            treasury: ctx.sender(),
            pending_treasury: std::option::none(),
            name: std::string::utf8(b"TestPlatform"),
            description: std::string::utf8(b"test"),
            category: std::string::utf8(b"Test"),
            webhook_url: std::option::none(),
            is_verified: false,
            subscriber_count: 0,
            created_at: now,
            tiers: vec_map::empty(),
            volume_limiter: rate_limiter::new_fixed_window(
                1_000_000_000_000,
                30 * 24 * 60 * 60 * 1_000,
                now,
                1_000_000_000_000,
                clock,
            ),
            frequency_limiter: rate_limiter::new_bucket(
                1000,
                100,
                60 * 60 * 1_000,
                now,
                1000,
                clock,
            ),
            account_billing_limiter: rate_limiter::new_bucket(
                10_000,
                1_000,
                60 * 60 * 1_000,
                now,
                10_000,
                clock,
            ),
            version: 2,
        }
    }

    /// Test-only destructor. `Platform` has `key + store` but not
    /// `drop`, so unit tests need an explicit way to dispose of
    /// platforms they constructed. The tier `VecMap` is drained
    /// entry-by-entry (its values are `SubscriptionTier` with
    /// `copy + drop + store`). The three `RateLimiter` fields are
    /// OZ-owned and bound by the limiter's own `drop`, so destructuring
    /// with `_` is sufficient.
    #[test_only]
    public fun destroy_for_testing(p: Platform) {
        let Platform {
            id,
            owner: _,
            treasury: _,
            pending_treasury: _,
            name: _,
            description: _,
            category: _,
            webhook_url: _,
            is_verified: _,
            subscriber_count: _,
            created_at: _,
            mut tiers,
            volume_limiter: _,
            frequency_limiter: _,
            account_billing_limiter: _,
            version: _,
        } = p;
        object::delete(id);
        while (!vec_map::is_empty(&tiers)) {
            let (_k, _t) = vec_map::pop(&mut tiers);
        };
        vec_map::destroy_empty(tiers);
    }
}
