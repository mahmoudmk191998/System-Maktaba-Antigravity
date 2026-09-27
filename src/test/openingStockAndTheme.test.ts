import { describe, expect, it } from 'vitest';
import {
  hexToHslTriplet,
  sanitizeRemoteTenantSettings,
} from '@/lib/themePreferences';
import {
  validateProductOpeningStock,
} from '@/services/products/products.repository';

describe('Opening stock + theme stability regression', () => {
  it('keeps local light/dark preference out of tenant rehydration', () => {
    const sanitized = sanitizeRemoteTenantSettings({
      darkMode: true,
      currency: 'EGP',
      primaryColor: '#ea580c',
    });

    expect(sanitized.darkMode).toBeUndefined();
    expect(sanitized.currency).toBe('EGP');
    expect(sanitized.primaryColor).toBe('#ea580c');
  });

  it('converts HEX brand colors to valid HSL triplets for semantic CSS tokens', () => {
    expect(hexToHslTriplet('#ea580c')).toBe('21 90% 48%');
    expect(hexToHslTriplet('#ffffff')).toBe('0 0% 100%');
    expect(hexToHslTriplet('not-a-color')).toBeNull();
  });

  it('accepts a base opening quantity for a normal tracked product', () => {
    const result = validateProductOpeningStock(
      {
        hasVariants: false,
        variants: [],
        trackInventory: true,
      } as any,
      [
        {
          locationId: 'branch-main',
          quantity: 100,
          unitCost: 7.5,
          variantId: null,
        },
      ]
    );

    expect(result.valid).toBe(true);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].quantity).toBe(100);
  });

  it('requires variant-level opening quantities when the product has variants', () => {
    const product = {
      hasVariants: true,
      trackInventory: true,
      variants: [
        { id: 'blue', name: 'أزرق' },
        { id: 'red', name: 'أحمر' },
      ],
    } as any;

    const bad = validateProductOpeningStock(product, [
      {
        locationId: 'branch-main',
        quantity: 20,
        unitCost: 3,
        variantId: null,
      },
    ]);
    expect(bad.valid).toBe(false);

    const good = validateProductOpeningStock(product, [
      {
        locationId: 'branch-main',
        quantity: 20,
        unitCost: 3,
        variantId: 'blue',
      },
      {
        locationId: 'branch-main',
        quantity: 15,
        unitCost: 3,
        variantId: 'red',
      },
    ]);
    expect(good.valid).toBe(true);
    expect(good.entries).toHaveLength(2);
  });

  it('rejects duplicate or fractional opening stock entries', () => {
    const product = {
      hasVariants: false,
      variants: [],
      trackInventory: true,
    } as any;

    expect(
      validateProductOpeningStock(product, [
        {
          locationId: 'branch-main',
          quantity: 1.5,
          unitCost: 5,
        },
      ]).valid
    ).toBe(false);

    expect(
      validateProductOpeningStock(product, [
        {
          locationId: 'branch-main',
          quantity: 10,
          unitCost: 5,
        },
        {
          locationId: 'branch-main',
          quantity: 5,
          unitCost: 5,
        },
      ]).valid
    ).toBe(false);
  });
});
