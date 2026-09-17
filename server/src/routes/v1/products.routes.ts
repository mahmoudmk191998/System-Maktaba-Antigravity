import { Router } from 'express';
import {
  getProductAvailability,
  getProductById,
  getProducts,
} from '../../controllers/products.controller.js';
import { authenticateApiKey } from '../../middleware/auth.middleware.js';
import { requireBranchAccess } from '../../middleware/branch.middleware.js';
import { requirePermission } from '../../middleware/permission.middleware.js';
import { validateRequest } from '../../middleware/validator.middleware.js';
import {
  productAvailabilityQuerySchema,
  productIdParamSchema,
  productsQuerySchema,
} from '../../validators/product.validator.js';

export const productsRouter = Router();

// GET /products
productsRouter.get(
  '/products',
  authenticateApiKey,
  requirePermission('menu:read'),
  validateRequest({ query: productsQuerySchema }),
  getProducts
);

// GET /products/:id/availability
productsRouter.get(
  '/products/:id/availability',
  authenticateApiKey,
  requirePermission('menu:read'),
  requireBranchAccess('branch_id'),
  validateRequest({ params: productIdParamSchema, query: productAvailabilityQuerySchema }),
  getProductAvailability
);

// GET /products/:id
productsRouter.get(
  '/products/:id',
  authenticateApiKey,
  requirePermission('menu:read'),
  validateRequest({ params: productIdParamSchema }),
  getProductById
);
