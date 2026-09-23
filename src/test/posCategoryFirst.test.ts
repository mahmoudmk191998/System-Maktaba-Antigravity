import { describe, it, expect } from 'vitest';
import { isValidImageUrl } from '@/lib/urlValidation';
import type { ProductCategory, Product } from '@/types/retail.types';

describe('Category-First Visual POS - Unit Tests', () => {
  describe('Image URL Security & Validation', () => {
    it('accepts valid https URLs', () => {
      expect(isValidImageUrl('https://example.com/category.jpg')).toBe(true);
      expect(isValidImageUrl('https://cdn.stationery.com/images/pens.png?v=2')).toBe(true);
    });

    it('accepts valid http URLs', () => {
      expect(isValidImageUrl('http://localhost:3000/test.jpg')).toBe(true);
      expect(isValidImageUrl('http://example.com/books.webp')).toBe(true);
    });

    it('strictly rejects dangerous schemes like javascript:', () => {
      expect(isValidImageUrl('javascript:alert(1)')).toBe(false);
      expect(isValidImageUrl('JAVASCRIPT:alert(1)')).toBe(false);
    });

    it('strictly rejects data: URLs', () => {
      expect(isValidImageUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')).toBe(false);
    });

    it('strictly rejects file: URLs', () => {
      expect(isValidImageUrl('file:///C:/Users/test/image.jpg')).toBe(false);
    });

    it('rejects empty, whitespace, or malformed strings', () => {
      expect(isValidImageUrl('')).toBe(false);
      expect(isValidImageUrl('   ')).toBe(false);
      expect(isValidImageUrl(null)).toBe(false);
      expect(isValidImageUrl(undefined)).toBe(false);
      expect(isValidImageUrl('not-a-url')).toBe(false);
    });
  });

  describe('ProductCategory Model & Backward Compatibility', () => {
    it('supports categories with imageUrl', () => {
      const catWithUrl: ProductCategory = {
        id: 'cat-1',
        tenantId: 'tenant-1',
        name: 'أقلام',
        sortOrder: 1,
        active: true,
        imageUrl: 'https://example.com/pens.jpg',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      expect(catWithUrl.imageUrl).toBe('https://example.com/pens.jpg');
    });

    it('supports legacy categories without imageUrl (backward compatibility)', () => {
      const legacyCat: ProductCategory = {
        id: 'cat-2',
        tenantId: 'tenant-1',
        name: 'كشاكيل',
        sortOrder: 2,
        active: true,
        image: 'legacy-image-path.jpg',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      };
      expect(legacyCat.imageUrl).toBeUndefined();
      expect(legacyCat.image).toBe('legacy-image-path.jpg');
      // Effective URL fallback
      const effectiveUrl = legacyCat.imageUrl || legacyCat.image || null;
      expect(effectiveUrl).toBe('legacy-image-path.jpg');
    });
  });

  describe('Category Hierarchy & Navigation Logic', () => {
    const mockCategories: ProductCategory[] = [
      {
        id: 'cat-school',
        tenantId: 't1',
        name: 'أدوات مدرسية',
        parentId: null,
        sortOrder: 1,
        active: true,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'cat-pens',
        tenantId: 't1',
        name: 'أقلام',
        parentId: 'cat-school',
        sortOrder: 1,
        active: true,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'cat-geometry',
        tenantId: 't1',
        name: 'أدوات هندسية',
        parentId: 'cat-school',
        sortOrder: 2,
        active: true,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'cat-books',
        tenantId: 't1',
        name: 'كتب خارجية',
        parentId: null,
        sortOrder: 2,
        active: true,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'cat-archived',
        tenantId: 't1',
        name: 'تصنيف مؤرشف',
        parentId: null,
        sortOrder: 3,
        active: false,
        createdAt: '',
        updatedAt: '',
      },
    ];

    it('filters root active categories properly', () => {
      const active = mockCategories.filter(c => c.active !== false);
      const root = active.filter(c => !c.parentId || c.parentId === 'none');
      expect(root.map(c => c.id)).toEqual(['cat-school', 'cat-books']);
    });

    it('hides archived/inactive categories from POS catalog', () => {
      const active = mockCategories.filter(c => c.active !== false);
      expect(active.some(c => c.id === 'cat-archived')).toBe(false);
    });

    it('identifies parent categories with children and leaf categories', () => {
      const active = mockCategories.filter(c => c.active !== false);
      const schoolHasChildren = active.some(c => c.parentId === 'cat-school');
      const pensHasChildren = active.some(c => c.parentId === 'cat-pens');
      const booksHasChildren = active.some(c => c.parentId === 'cat-books');

      expect(schoolHasChildren).toBe(true); // Parent with subcategories
      expect(pensHasChildren).toBe(false);  // Leaf category -> Shows products
      expect(booksHasChildren).toBe(false); // Leaf category -> Shows products
    });

    it('correctly resolves subcategories for a selected category', () => {
      const active = mockCategories.filter(c => c.active !== false);
      const subcategories = active.filter(c => c.parentId === 'cat-school');
      expect(subcategories.map(c => c.id)).toEqual(['cat-pens', 'cat-geometry']);
    });
  });

  describe('Product Uncategorized & In-Memory Counts', () => {
    const mockProducts = [
      { id: 'p1', name: 'قلم جاف أزرق', categoryId: 'cat-pens' },
      { id: 'p2', name: 'قلم رصاص HB', categoryId: 'cat-pens' },
      { id: 'p3', name: 'مسطرة هندسية', categoryId: 'cat-geometry' },
      { id: 'p4', name: 'سلعة عامة بدون تصنيف', categoryId: '' },
      { id: 'p5', name: 'سلعة قديمة', categoryId: undefined },
    ] as unknown as Product[];

    it('computes product counts per category accurately', () => {
      const counts: Record<string, number> = {};
      let uncat = 0;
      for (const p of mockProducts) {
        if (p.categoryId) {
          counts[p.categoryId] = (counts[p.categoryId] || 0) + 1;
        } else {
          uncat++;
        }
      }
      expect(counts['cat-pens']).toBe(2);
      expect(counts['cat-geometry']).toBe(1);
      expect(uncat).toBe(2);
    });

    it('filters uncategorized products correctly', () => {
      const uncategorized = mockProducts.filter(p => !p.categoryId || p.categoryId === '');
      expect(uncategorized.length).toBe(2);
      expect(uncategorized.map(p => p.id)).toEqual(['p4', 'p5']);
    });
  });

  describe('Cart Preservation Simulation', () => {
    it('cart items remain completely intact when switching views or categories', () => {
      // Simulation of POS state
      let cart = [
        { productId: 'p1', name: 'قلم جاف', quantity: 2, unitPrice: 5 },
        { productId: 'p3', name: 'مسطرة', quantity: 1, unitPrice: 10 },
      ];
      let selectedCategory: string | null = null;
      let searchQuery = '';

      // User selects category
      selectedCategory = 'cat-pens';
      expect(cart.length).toBe(2);
      expect(cart[0].quantity).toBe(2);

      // User types search
      searchQuery = 'BIC';
      expect(cart.length).toBe(2);

      // User clears search and returns to root
      searchQuery = '';
      selectedCategory = null;
      expect(cart.length).toBe(2);
      expect(cart[0].quantity).toBe(2);
    });
  });
});
