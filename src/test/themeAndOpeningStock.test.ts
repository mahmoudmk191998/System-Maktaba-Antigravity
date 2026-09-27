import { describe, expect, it } from 'vitest';
import { hexToHslToken } from '@/hooks/useTheme';
import { computeStockStatus } from '@/services/products/products.repository';

describe('Theme persistence and product opening stock safeguards', () => {
  it('converts persisted hex primary colors into valid HSL tokens', () => {
    expect(hexToHslToken('#ea580c')).toBe('21 90% 48%');
    expect(hexToHslToken('#1e3a5f')).toBe('210 52% 25%');
    expect(hexToHslToken('not-a-color')).toBeNull();
  });

  it('derives correct product stock state from opening quantity', () => {
    expect(computeStockStatus(0, 5)).toEqual({
      isLowStock: true,
      stockStatus: 'out',
    });
    expect(computeStockStatus(3, 5)).toEqual({
      isLowStock: true,
      stockStatus: 'low',
    });
    expect(computeStockStatus(25, 5)).toEqual({
      isLowStock: false,
      stockStatus: 'normal',
    });
  });
});
