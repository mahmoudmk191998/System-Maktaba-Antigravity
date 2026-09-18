/**
 * Retail Units & Unit Conversion Service
 * Manages units of measurement and precise mathematical conversions between base and sub-units.
 */

import type { Unit } from '@/types/retail.types';

export const STANDARD_DEFAULT_UNITS: Omit<Unit, 'id' | 'tenantId'>[] = [
  { name: 'قطعة', nameAr: 'قطعة', nameEn: 'Piece', code: 'PCS', baseUnitId: null, conversionFactor: 1, isBaseUnit: true, active: true },
  { name: 'علبة', nameAr: 'علبة', nameEn: 'Box', code: 'BOX', baseUnitId: null, conversionFactor: 1, isBaseUnit: false, active: true },
  { name: 'دستة', nameAr: 'دستة', nameEn: 'Dozen', code: 'DZN', baseUnitId: null, conversionFactor: 12, isBaseUnit: false, active: true },
  { name: 'كرتونة', nameAr: 'كرتونة', nameEn: 'Carton', code: 'CTN', baseUnitId: null, conversionFactor: 1, isBaseUnit: false, active: true },
  { name: 'باكيت / رزمة', nameAr: 'باكيت', nameEn: 'Pack', code: 'PCK', baseUnitId: null, conversionFactor: 1, isBaseUnit: false, active: true },
  { name: 'ماعون ورق', nameAr: 'ماعون', nameEn: 'Ream', code: 'REAM', baseUnitId: null, conversionFactor: 500, isBaseUnit: false, active: true },
  { name: 'طقم', nameAr: 'طقم', nameEn: 'Set', code: 'SET', baseUnitId: null, conversionFactor: 1, isBaseUnit: true, active: true },
  { name: 'كتاب', nameAr: 'كتاب', nameEn: 'Book', code: 'BK', baseUnitId: null, conversionFactor: 1, isBaseUnit: true, active: true },
  { name: 'كشكول', nameAr: 'كشكول', nameEn: 'Notebook', code: 'NB', baseUnitId: null, conversionFactor: 1, isBaseUnit: true, active: true },
  { name: 'رول', nameAr: 'رول', nameEn: 'Roll', code: 'ROLL', baseUnitId: null, conversionFactor: 1, isBaseUnit: true, active: true },
  { name: 'فرخ ورق', nameAr: 'فرخ', nameEn: 'Sheet', code: 'SHT', baseUnitId: null, conversionFactor: 1, isBaseUnit: true, active: true },
];

/**
 * Converts a quantity from a given unit into the base unit quantity.
 * e.g. 5 Boxes (conversionFactor = 50) -> 250 base units (pieces)
 */
export function convertToBaseQuantity(quantity: number, unit?: Unit | null): number {
  if (!unit || unit.isBaseUnit || !unit.conversionFactor || unit.conversionFactor <= 0) {
    return quantity;
  }
  return quantity * unit.conversionFactor;
}

/**
 * Converts a base quantity back into target unit display quantity.
 * e.g. 250 pieces into Boxes (factor = 50) -> 5 boxes
 */
export function convertFromBaseQuantity(baseQuantity: number, targetUnit?: Unit | null): number {
  if (!targetUnit || targetUnit.isBaseUnit || !targetUnit.conversionFactor || targetUnit.conversionFactor <= 0) {
    return baseQuantity;
  }
  return baseQuantity / targetUnit.conversionFactor;
}

/**
 * Calculates effective unit cost for a converted unit based on base unit cost.
 * e.g. If base cost = 2 EGP/piece, a Box of 50 has unitCost = 100 EGP.
 */
export function calculateConvertedUnitCost(baseUnitCost: number, unit?: Unit | null): number {
  if (!unit || unit.isBaseUnit || !unit.conversionFactor || unit.conversionFactor <= 0) {
    return baseUnitCost;
  }
  return baseUnitCost * unit.conversionFactor;
}
