# Menu & Catalog API

The Menu API allows external clients to fetch real-time categories, active products, and branch-specific item availability.

## Endpoints

- `GET /api/v1/menu`: Complete menu structure organized by categories with embedded available items.
- `GET /api/v1/categories`: List active menu categories.
- `GET /api/v1/products`: List all products, optionally filtered by `?category_id=...`.
- `GET /api/v1/products/:id`: Retrieve single product with active addons.

## SDK Example

```typescript
const menu = await client.getMenu();
console.log('Categories:', menu.categories.map(c => c.name));
console.log('Products:', menu.products.map(p => `${p.name} - ${p.price} EGP`));
```
