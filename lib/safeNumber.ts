/**
 * Number guards for invoice amounts.
 *
 * Every amount in the form starts life as a string typed into an `<input>`,
 * and users can paste anything — `1e999`, a lone `-`, a 400-digit number.
 * `Number()` turns those into `Infinity` or `NaN`, which then propagate into
 * subtotal/tax/total, `toFixed()`, `Intl.NumberFormat`, and finally the PDF.
 * The failure modes ranged from "Total: NaN" to React throwing while
 * formatting the document.
 *
 * These helpers give one place to decide what a usable amount is. They clamp
 * rather than throw: a form should keep rendering while the user fixes the
 * value, and the zod schema is what rejects it on submit.
 */

/** Largest single amount (rate, charge, tax) accepted in the form. */
export const MAX_AMOUNT = 1_000_000_000; // 1e9

/** Largest quantity accepted in a line item. */
export const MAX_QUANTITY = 1_000_000; // 1e6

/**
 * Largest line total: the product of the two caps above. Still comfortably
 * below `Number.MAX_SAFE_INTEGER` (~9.007e15), so every intermediate value in
 * the subtotal arithmetic is exact.
 */
export const MAX_LINE_TOTAL = MAX_AMOUNT * MAX_QUANTITY; // 1e15

/** Coerces anything to a finite number, or returns `fallback`. */
export function toFiniteNumber(value: unknown, fallback = 0): number {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : fallback;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed === "") return fallback;

        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    return fallback;
}

/** Clamps a value into `[min, max]`, mapping non-finite input to `min`. */
export function clampNumber(
    value: unknown,
    min: number,
    max: number
): number {
    const n = toFiniteNumber(value, min);
    return Math.min(max, Math.max(min, n));
}

/**
 * Quantity × unit price, clamped to the supported range.
 *
 * A line whose product exceeds the cap is clamped rather than allowed to reach
 * `Infinity`; the form validation still reports the individual fields, so the
 * user gets a usable error instead of a crashed render.
 */
export function safeLineTotal(quantity: unknown, unitPrice: unknown): number {
    const q = clampNumber(quantity, 0, MAX_QUANTITY);
    const p = clampNumber(unitPrice, 0, MAX_AMOUNT);

    if (q <= 0 || p <= 0) return 0;

    return Math.min(q * p, MAX_LINE_TOTAL);
}

/**
 * Percentage charges are only meaningful between 0 and 100. Anything outside
 * that is a typo (or a pasted exponent) and would otherwise invert the total.
 */
export function clampPercentage(value: unknown): number {
    return clampNumber(value, 0, 100);
}
