/**
 * Money and gold helpers.
 *
 * Cash is Toman, gold is grams. Both are Decimal in the database, and neither is
 * ever stored as a float: a fractional gram is a normal trade size, and binary
 * floating point cannot represent 0.1 exactly — drift of a few rial compounds
 * across thousands of entries until the books stop reconciling.
 *
 * These helpers return `number` for arithmetic convenience but only after a
 * `round`/`toFixed`, and results are written back through Prisma as Decimal
 * strings. Treat any `number` in this file as an already-quantised value.
 */

/** Cash is whole Toman — never store fractional rial. */
export function money(value: number): number {
  return Math.round(value);
}

/** Gold keeps 6 decimal places: a milligram of gold is a real unit. */
export function grams(value: number): number {
  return Number(value.toFixed(6));
}

/** Commission as a percentage, rounded to whole Toman. */
export function feeFor(amount: number, feePercent: number): number {
  return money((amount * feePercent) / 100);
}

/** Weighted-average cost basis across a new purchase. */
export function weightedAvgCost(
  heldGrams: number,
  heldAvgCost: number,
  addGrams: number,
  addPrice: number,
): number {
  const total = heldGrams + addGrams;
  if (total <= 0) return addPrice;
  return (heldAvgCost * heldGrams + addPrice * addGrams) / total;
}

/** Float comparison needs an epsilon — `0.1 + 0.2 !== 0.3` in binary. */
export const EPSILON = 1e-9;

/** Parse a Prisma Decimal into a number, treating null as 0. */
export function dec(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
