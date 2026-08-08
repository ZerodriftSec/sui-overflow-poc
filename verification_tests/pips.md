# PIPS — Verification Tests

Package: `deepbook_predict` (vendored Predict fork under `contracts/predict/`)
Sui CLI: `/Users/chris/.local/bin/sui` (1.76.0)

## Finding DB-5019 (High) — LP shares priced at stale `total_mtm` → stale-price value extraction between LPs

- **Status:** REPRODUCED (pass)
- **Test file:** `projects/pips/contracts/predict/tests/audit_poc_tests.move`
- **Tests:**
  - `vault_value_uses_cached_total_mtm` — proves the plumbing: with a stale
    cached `total_mtm`, `vault_value()` returns `balance − stale_mtm`
    ($900), not `balance − real_mtm` ($400). This is exactly what
    `supply`/`withdraw` read.
  - `supply_mints_shares_off_stale_vault_value` — end-to-end: seeds a Predict
    vault, injects a stale `total_mtm = $100` while the real liability is
    `$600`, supplies `$100` as a new LP, and asserts:
    1. minted shares equal the buggy formula
       `mul_div_round_down(deposit, supply, balance − stale_mtm) = 111_111_111`
       (NOT the correct `250_000_000`), matching the finding's "~11 shares"
       numeric claim.
    2. After a simulated `refresh_oracle_risk` write to the real liability,
       the new LP's pro-rata claim drops to ~`$50` (lost ~`$50`), and the
       existing LPs' claim strictly exceeds the fair no-bug claim
       (`$450 > $400`). The ~`$50` delta is the value extracted from the
       new LP by the existing LPs.

### Final `sui move test` output (last 15 lines)

```
[ PASS    ] deepbook_predict::rate_limiter_tests::update_config_shrink_capacity_caps_available
[ PASS    ] deepbook_predict::rate_limiter_tests::update_config_zero_rate_aborts
[ PASS    ] deepbook_predict::rate_limiter_tests::withdraw_deposit_withdraw_cycle
[ PASS    ] deepbook_predict::rate_limiter_tests::withdraw_deposit_withdraw_exceeds
[ PASS    ] deepbook_predict::audit_poc_tests::supply_mints_shares_off_stale_vault_value
[ PASS    ] deepbook_predict::audit_poc_tests::vault_value_uses_cached_total_mtm
Test result: OK. Total tests: 36; passed: 36; failed: 0
```

### Per-finding summary

| Finding | Severity | Reproduced | Notes |
|---------|----------|------------|-------|
| DB-5019 | High | YES | `supply` prices new LP shares against the cached `vault_value` (`balance − total_mtm`). `total_mtm` is only refreshed by `refresh_oracle_risk` (called from `mint`/`redeem`/`mint_range`/`redeem_range`), never from `supply`/`withdraw`. When real liability has risen while the cache lags low, a new LP is over-charged: they receive too few shares and the delta accrues to existing LPs. PoC confirms both the share-count formula and the post-refresh value extraction (~`$50` on a `$100` deposit in the finding's example). |

### Findings that did NOT reproduce

None. The single finding (DB-5019) reproduced cleanly.
