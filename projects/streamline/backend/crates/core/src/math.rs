//! Streaming math — the keeper and indexer both need to compute accrued
//! amounts and the gasless drip interval. Mirrors the frontend `stream-math`.
//!
//! Rates are sub-base-unit per millisecond for normal stream sizes (e.g.
//! $500/mo ≈ 0.19 base units/ms), so we never truncate to an integer rate.
//! Everything is computed proportionally as `total * elapsed / duration` in
//! u128 to stay exact and overflow-free.

use crate::types::MIN_DRIP_BASE;

/// Milliseconds between gasless drips: time to accrue the 0.01 USDC floor.
/// `ceil(MIN_DRIP_BASE * duration_ms / total_base)`.
pub fn drip_interval_ms(total_base: u64, duration_ms: u64) -> u64 {
    if total_base == 0 || duration_ms == 0 {
        return u64::MAX;
    }
    let num = MIN_DRIP_BASE as u128 * duration_ms as u128;
    num.div_ceil(total_base as u128) as u64
}

/// Amount accrued (base units) between `last_drip_ms` and `now_ms`.
pub fn accrued(total_base: u64, duration_ms: u64, last_drip_ms: u64, now_ms: u64) -> u64 {
    if duration_ms == 0 {
        return 0;
    }
    let elapsed = now_ms.saturating_sub(last_drip_ms) as u128;
    let acc = total_base as u128 * elapsed / duration_ms as u128;
    acc.min(total_base as u128) as u64
}

/// Whether the accrued amount has crossed the gasless floor and a drip is due.
pub fn drip_due(total_base: u64, duration_ms: u64, last_drip_ms: u64, now_ms: u64) -> bool {
    accrued(total_base, duration_ms, last_drip_ms, now_ms) >= MIN_DRIP_BASE
}

/// The 1 bps keeper tip on a settled amount.
pub fn keeper_tip(amount: u64) -> u64 {
    amount / 10_000
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::USDC_BASE;

    const MONTH_MS: u64 = 30 * 86_400_000;

    #[test]
    fn interval_matches_spec() {
        // $500 / month at the 1.00 USDC floor → ~86 min interval.
        let total = 500 * USDC_BASE;
        let interval = drip_interval_ms(total, MONTH_MS);
        assert!((5_100_000..=5_250_000).contains(&interval), "got {interval}ms");
    }

    #[test]
    fn interval_scales_with_rate() {
        // $5000/month → ~8.6 min (10x the rate → 1/10th the interval).
        let interval = drip_interval_ms(5000 * USDC_BASE, MONTH_MS);
        assert!((510_000..=525_000).contains(&interval), "got {interval}ms");
    }

    #[test]
    fn drip_fires_after_floor() {
        let total = 1000 * USDC_BASE;
        let interval = drip_interval_ms(total, MONTH_MS);
        assert!(!drip_due(total, MONTH_MS, 0, interval - 1));
        assert!(drip_due(total, MONTH_MS, 0, interval + 1));
    }

    #[test]
    fn accrued_never_exceeds_total() {
        let total = 800 * USDC_BASE;
        let dur = 14 * 86_400_000;
        assert_eq!(accrued(total, dur, 0, dur * 2), total);
    }
}
