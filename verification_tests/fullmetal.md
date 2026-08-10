# Fullmetal — Sui Move PoC Verification

## Findings verified

- **Database 4696 (High)** — `otc_forward::open` accepts `im_each == 0`, bypassing the
  per-trader `book_size` risk limit. `open` asserts `notional > 0` and `entry_price > 0`
  but NOT `im_each > 0`; `institution::reserve_margin` likewise has no `im_amount > 0`
  assertion. A rogue trader opens zero-margin contracts of arbitrary notional without
  consuming book_size, then drains the institutional free treasury via settle on an
  adverse mark.
- **Database 4714 (Critical)** — `rehypo_router::borrow_receipt<C, R: store>` is
  `public fun` with NO capability check (sibling `begin_recall` and `begin_recall_ref`
  both require `&AdminCap`). Any caller can obtain a `&R` reference to a stored venue
  credential (DeepBook SupplierCap / Suilend CToken / Navi AccountCap) and pass it to a
  venue adapter to drain the restaked funds.
- **Database 4698 (High)** — `oracle::price` is pure `&RiskOracle`, no `&Clock`. The
  keeper writes `last_update_ms` on every push but no consumer reads it, so a frozen feed
  stays authoritative forever and `settle` / `settle_on_breach` / `close` keep accruing
  funding and triggering liquidations on the stale mark.

## Test file

- `tests/audit_poc_tests.move`
  - `poc_4696_zero_im_open_bypasses_book_size_and_drains_treasury` — sets
    `book_size = $1` for both traders, calls `otc_forward::open(... im_each: 0, ...)`,
    asserts open succeeded, both `deployed == 0` (book-size fence bypassed), and
    `reserved == 0`. Then pushes `-50%` and settles, asserts the long treasury
    went `$200 → $100` and the short `$200 → $300` — institutional treasury drained
    past the $1 book-size limit.
  - `poc_4714_borrow_receipt_has_no_access_control` — sets up an institution with a
    confirmed rehypo that stashed a `FakeReceipt { magic: 0xC0FFEE }` as a dynamic
    field under the Suilend slot. A second wallet (`@0xCAFE`) holding NO `AdminCap`
    and NO `TraderCap` for the victim calls `rehypo_router::borrow_receipt<FAKE,
    FakeReceipt>(&inst, venue_suilend())`, gets back the reference, and reads
    `r.magic == 0xC0FFEE` — proving the credential is reachable by an arbitrary
    caller. (Sibling functions `begin_recall` / `begin_recall_ref` would have
    required `&AdminCap`.)
  - `poc_4698_oracle_price_has_no_staleness_check` — registers a feed, pushes the
    last price at `last_update_ms == 1_000`, then advances the clock by
    `31_536_000_000` ms (1 year). Calls `oracle::price(&orc, sym)` — succeeds and
    returns the frozen price `185_000_000`. Asserts `last_update_ms` is still
    `1_000` (untouched), proving there is no `now - last_update_ms <= MAX_STALE`
    gate. This is the root cause of the reviewer's "预言机未检查价格更新" concern.

## Final `sui move test` output (last 15 lines)

```
[ PASS    ] fullmetal::crossmargin_tests::interval_zero_charges_no_funding
[ PASS    ] fullmetal::risk_tests::vol_release_counter_resets_on_new_shock
[ PASS    ] fullmetal::risk_tests::vol_shock_latches_then_hysteresis_releases
[ PASS    ] fullmetal::crossmargin_tests::liquidation_inside_cure_window_aborts
[ PASS    ] fullmetal::crossmargin_tests::liquidation_with_second_fence_pays_capped_no_abort
[ PASS    ] fullmetal::crossmargin_tests::paused_loser_still_settles
[ PASS    ] fullmetal::crossmargin_tests::settle_after_expiry_aborts
[ PASS    ] fullmetal::crossmargin_tests::side_flip_voids_old_call_and_opens_fresh_window
[ PASS    ] fullmetal::crossmargin_tests::wick_that_reverts_clears_the_call_no_liquidation
Test result: OK. Total tests: 46; passed: 46; failed: 0
```

`audit_poc_tests::poc_4696_zero_im_open_bypasses_book_size_and_drains_treasury`,
`audit_poc_tests::poc_4714_borrow_receipt_has_no_access_control`, and
`audit_poc_tests::poc_4698_oracle_price_has_no_staleness_check` all appear in the PASS
list.

## Per-finding result

| Finding | Status |
| --- | --- |
| 4696 (High) — `open` accepts `im_each == 0`, bypasses book_size | **REPRODUCED** — open succeeded with `im_each=0` and `book_size=$1`; both `deployed` and `reserved` stayed `0`; settle at `-50%` drained `$100` from the long treasury to the short. |
| 4714 (Critical) — `borrow_receipt` no auth, leaks venue credentials | **REPRODUCED** — unrelated wallet (`@0xCAFE`) with NO AdminCap/TraderCap obtained `&FakeReceipt` reference to a stored venue credential; `r.magic == 0xC0FFEE` confirmed the credential is reachable. |
| 4698 (High) — Oracle price no staleness/heartbeat check | **REPRODUCED** — 1-year-stale feed returned its frozen price from `oracle::price` with no abort; `last_update_ms` was unchanged by the read (proving the absence of any `now - last_update_ms <= MAX_STALE` gate). |

## Findings that did NOT reproduce

None. All three findings reproduced on the first green run.

## Notes

- Only `tests/audit_poc_tests.move` was added; no source files were modified.
- The package's `run-tests.sh` wrapper strips the `deepbook_margin` dependency
  and `sources/rehypo.move` because they require MVR resolution and a Pyth
  module-extension that cannot compile when deepbook_margin is a dependency.
  During verification, the same effective build was reproduced manually by
  (a) running `sed` to drop the `deepbook_margin` line from `Move.toml`,
  (b) moving `sources/rehypo.move` aside, and
  (c) moving `tests/pyth_ext.move` aside (it is a `pyth::price_info` extension
      that depends transitively on deepbook — and breaks the build when deepbook
      is stripped). All file system state was restored after testing; the
  project tree is byte-identical to its pre-test state except for the new
  `tests/audit_poc_tests.move`.
- 43 pre-existing baseline tests + 3 new PoC tests = 46 tests, all green.
