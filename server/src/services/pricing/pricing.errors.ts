import { AppError } from '../../utils/errors.js';

export class ProductUnavailableError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'PRODUCT_UNAVAILABLE', details);
  }
}

export class InvalidQuantityError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'INVALID_QUANTITY', details);
  }
}

export class PromotionInvalidError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'PROMOTION_INVALID', details);
  }
}

export class PromotionExpiredError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'PROMOTION_EXPIRED', details);
  }
}

export class MinimumOrderError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'MINIMUM_ORDER_NOT_MET', details);
  }
}

export class DeliveryUnavailableError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'DELIVERY_UNAVAILABLE', details);
  }
}

export class PricingCalculationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'PRICING_CALCULATION_ERROR', details);
  }
}
