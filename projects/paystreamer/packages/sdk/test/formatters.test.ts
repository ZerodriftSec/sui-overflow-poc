import { describe, it, expect } from 'vitest';
import { formatMistToPusd, formatFrequencyMsToDays, calculateRecommendedBuffer } from '../src/core/formatters';

describe('SDK Core Formatters', () => {
  describe('formatMistToPusd', () => {
    it('should convert bigint MIST to number PUSD', () => {
      expect(formatMistToPusd(10000000000n)).toBe(10);
      expect(formatMistToPusd(0n)).toBe(0);
      expect(formatMistToPusd(500000000n)).toBe(0.5);
    });

    it('should handle string input', () => {
      expect(formatMistToPusd("10000000000")).toBe(10);
    });

    it('should handle number input', () => {
      expect(formatMistToPusd(10000000000)).toBe(10);
    });
  });

  describe('formatFrequencyMsToDays', () => {
    it('should convert ms to days', () => {
      const thirtyDaysMs = 30n * 24n * 60n * 60n * 1000n;
      expect(formatFrequencyMsToDays(thirtyDaysMs)).toBe(30);

      const oneDayMs = 24n * 60n * 60n * 1000n;
      expect(formatFrequencyMsToDays(oneDayMs)).toBe(1);
    });
  });

  describe('calculateRecommendedBuffer', () => {
    it('should calculate recommended buffer based on frequency', () => {
      const tierAmount = 10000000000n; // 10 PUSD
      const thirtyDaysMs = 30n * 24n * 60n * 60n * 1000n;

      // Recommended buffer for 30 day cycle is 3 cycles (90 days / 30 days = 3)
      expect(calculateRecommendedBuffer(tierAmount, thirtyDaysMs)).toBe(30000000000n);

      // Recommended buffer for 10 day cycle is 9 cycles (90 days / 10 days = 9)
      const tenDaysMs = 10n * 24n * 60n * 60n * 1000n;
      expect(calculateRecommendedBuffer(tierAmount, tenDaysMs)).toBe(90000000000n);

      // Recommended buffer for 60 day cycle is clamped to min 3 cycles
      const sixtyDaysMs = 60n * 24n * 60n * 60n * 1000n;
      expect(calculateRecommendedBuffer(tierAmount, sixtyDaysMs)).toBe(30000000000n);

      // Recommended buffer for 5 day cycle is clamped to max 10 cycles
      const fiveDaysMs = 5n * 24n * 60n * 60n * 1000n;
      expect(calculateRecommendedBuffer(tierAmount, fiveDaysMs)).toBe(100000000000n);

      // Handles 0 frequency ms by falling back to 3 cycles
      expect(calculateRecommendedBuffer(tierAmount, 0n)).toBe(30000000000n);
    });
  });
});
