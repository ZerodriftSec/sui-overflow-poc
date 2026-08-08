/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/


/**
 * A small, embeddable rate-limiting primitive for Sui.
 * 
 * `RateLimiter` is a plain `store + drop` value that integrators embed as a field
 * inside their own objects. There is no registry, no policy object, and no
 * separate ID that integrators must track and assert against: the limiter's scope
 * is whatever object it lives inside.
 * 
 * Three strategies are provided in one enum, all sharing the same API:
 * 
 * - `Bucket` - continuously refilling token bucket with a configurable refill
 *   schedule,
 * - `FixedWindow` - up to `capacity` units per fixed-length window anchored at a
 *   chosen start,
 * - `Cooldown` - up to `capacity` units before requiring a `cooldown_ms` wait.
 * 
 * Typical lifecycle:
 * 
 * 1.  the integrator creates a limiter with one of the `new_*` constructors and
 *     stores it in their own struct,
 * 2.  hot paths call `consume_or_abort` or `try_consume`,
 * 3.  read paths call `available` for inspection,
 * 4.  when configuration or runtime state must change, the integrator constructs a
 *     fresh `RateLimiter` with the desired field values (reading current state via
 *     `available`, `capacity`, `window_start_ms`, `cooldown_end_ms`, etc.) and
 *     overwrites the field.
 * 
 * # Operator responsibilities
 * 
 * Configs only need positivity; the implementation handles internal overflow
 * safety without further upper bounds. One operator-side caveat: for `Cooldown`,
 * the deadline is computed as `now + cooldown_ms`. The Sui `Clock` is monotonic
 * and bounded well below `u64::MAX`, but `cooldown_ms` near `u64::MAX` would
 * overflow this addition. Operators must pick `cooldown_ms` such that
 * `now + cooldown_ms` cannot overflow at any plausible chain timestamp during the
 * limiter's lifetime - any policy-meaningful value (seconds to days to years in
 * ms) satisfies this trivially. The arming site guards this explicitly: an
 * overflowing deadline aborts with `ECooldownDeadlineOverflow`.
 * 
 * Any function taking `&mut RateLimiter` mutates live state. Gate the entry
 * functions that expose them with whatever authorization model is appropriate for
 * the call site (`Cap`, `openzeppelin_access`, governance, multisig, ...). The
 * module is agnostic.
 * 
 * # Reconfiguration
 * 
 * This module deliberately does not provide in-place reconfigure functions. To
 * change a limiter's configuration or runtime state, read the current state via
 * the getters, compute the desired new field values, construct a fresh
 * `RateLimiter`, and overwrite the field. Every reconfigure policy - preserve
 * anchor, project then re-anchor, full reset, proportional carry, freeze in-flight
 * gate, etc. - is expressible in caller code. The library validates structural
 * invariants on construction; the choice of semantics is entirely the
 * integrator's.
 * 
 * One semantic pitfall the library does not guard against: a `Bucket`'s (or
 * `FixedWindow`'s) anchor may be carried over from the old limiter only when the
 * rate is unchanged - that is, `refill_amount` and `refill_interval_ms` (or
 * `window_ms`) stay the same. Accrual applies the _current_ rate over the entire
 * span since the anchor, so preserving an old anchor while changing the rate
 * re-prices time that elapsed under the previous rate, minting tokens instantly.
 * Any change to the rate must re-anchor to `clock.timestamp_ms()` so the new rate
 * only applies going forward.
 * 
 * # Observability
 * 
 * This module deliberately emits no events. The limiter has no stable identity of
 * its own - it shares the on-chain identity of the integrator-owned object hosting
 * it. Emitting events for rate-limit hits, cooldown arming, and reconfiguration is
 * therefore the integrator's responsibility, at their own entry functions where
 * the hosting object's ID and call context are available.
 * 
 * # Upgrade compatibility
 * 
 * `RateLimiter` is a `public enum` embedded inside integrator-owned objects.
 * Adding a new variant or new fields to an existing variant in a future package
 * upgrade is not a binary-compatible change: any object that already stored a
 * prior shape would fail to deserialize. Future evolution must either preserve the
 * current variant set and field layouts, or ship as a parallel `RateLimiterV2`
 * type with a migration path for integrators.
 */

import { MoveEnum, MoveStruct } from '../../../utils/index.js';
import { bcs } from '@mysten/sui/bcs';
const $moduleName = 'openzeppelin_utils::rate_limiter';
/**
 * One embeddable limiter, three strategies. The variant is chosen at construction
 * and can only be swapped by building a fresh `RateLimiter` and overwriting the
 * field.
 *
 * All variants store an `available` counter that starts at `initial_available` and
 * is decremented by successful `try_consume` calls. Refill (Bucket), window
 * rollover (FixedWindow), and cooldown release (Cooldown) all reset `available`
 * back toward `capacity`. A failed `try_consume` (returning `false`) leaves
 * persisted state untouched across all variants; pending time transitions are
 * still observable through `available()`, which always projects on read.
 */
export const RateLimiter = new MoveEnum({ name: `${$moduleName}::RateLimiter`, fields: {
        /**
          * Continuously refilling bucket. `available` accrues `refill_amount` every
          * `refill_interval_ms`, capped at `capacity`. Each `try_consume` draws `available`
          * down.
          */
        Bucket: new MoveStruct({ name: `RateLimiter.Bucket`, fields: {
                capacity: bcs.u64(),
                refill_amount: bcs.u64(),
                refill_interval_ms: bcs.u64(),
                last_refill_ms: bcs.u64(),
                available: bcs.u64()
            } }),
        /**
         * Up to `capacity` units per window of length `window_ms`, anchored at
         * `window_start_ms` (defaults to creation time, but may be backdated to preserve
         * window phase across a reconstruction). `available` resets to `capacity` when
         * current time crosses into a later window boundary.
         */
        FixedWindow: new MoveStruct({ name: `RateLimiter.FixedWindow`, fields: {
                capacity: bcs.u64(),
                window_ms: bcs.u64(),
                window_start_ms: bcs.u64(),
                available: bcs.u64()
            } }),
        /**
         * Up to `capacity` units may be consumed before the limiter gates on
         * `cooldown_ms`. Each successful `try_consume(amount, _)` decrements `available`
         * by `amount` and rejects when `amount` exceeds the projected headroom (the stored
         * `available`, or `capacity` once the gate has elapsed). Once `available` reaches
         * `0`, `cooldown_end_ms` is set to `now + cooldown_ms` - the absolute deadline at
         * which the gate releases. No further consume succeeds until
         * `now >= cooldown_end_ms`, at which point `available` resets to `capacity` and
         * the next batch is granted. `cooldown_end_ms` is taken into account only once the
         * limiter has been drained and the gate is armed.
         */
        Cooldown: new MoveStruct({ name: `RateLimiter.Cooldown`, fields: {
                capacity: bcs.u64(),
                cooldown_ms: bcs.u64(),
                cooldown_end_ms: bcs.u64(),
                available: bcs.u64()
            } })
    } });