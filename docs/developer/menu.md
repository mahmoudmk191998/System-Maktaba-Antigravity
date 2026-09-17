# Catalog & Menu APIs

Fetch categories, products, and addons for rendering digital menus.

## Endpoints

### 1. Get Full Hierarchical Menu
```http
GET /api/v1/menu
Authorization: Bearer <API_KEY>
```

### 2. Get Categories
```http
GET /api/v1/categories
Authorization: Bearer <API_KEY>
```

### 3. Get Products by Category
```http
GET /api/v1/products?category_id=cat_burgers
Authorization: Bearer <API_KEY>
```
