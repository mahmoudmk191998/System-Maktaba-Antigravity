import { describe, expect, it } from 'vitest';
import { hexToHslTriplet } from '@/hooks/useTheme';

describe('Theme color token normalization', () => {
  it('converts the configured HEX primary color to Tailwind HSL token format', () => {
    expect(hexToHslTriplet('#ea580c')).toBe('22 90% 48%');
    expect(hexToHslTriplet('#1e3a5f')).toBe('213 52% 25%');
  });

  it('supports short HEX and rejects invalid CSS color input', () => {
    expect(hexToHslTriplet('#fff')).toBe('0 0% 100%');
    expect(hexToHslTriplet('not-a-color')).toBeNull();
  });
});
