/**
 * Rounding and money utilities to prevent JavaScript floating point inaccuracies.
 * All monetary amounts are handled strictly up to 2 decimal places (cents/piastres).
 */

export function roundMoney(amount: number): number {
  if (isNaN(amount) || !isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function addMoney(...amounts: number[]): number {
  const sum = amounts.reduce((acc, curr) => acc + (isNaN(curr) ? 0 : curr), 0);
  return roundMoney(sum);
}

export function subtractMoney(minuend: number, subtrahend: number): number {
  return roundMoney((minuend || 0) - (subtrahend || 0));
}

export function multiplyMoney(amount: number, multiplier: number): number {
  return roundMoney((amount || 0) * (multiplier || 0));
}

export function percentageMoney(amount: number, percentage: number): number {
  if (!amount || !percentage || percentage <= 0) return 0;
  return roundMoney((amount * percentage) / 100);
}

export function clampNonNegative(amount: number): number {
  const rounded = roundMoney(amount);
  return rounded < 0 ? 0 : rounded;
}
