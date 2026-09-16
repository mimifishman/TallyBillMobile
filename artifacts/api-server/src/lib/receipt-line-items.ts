/**
 * Turns the model's raw line items into the shape the app stores.
 *
 * The printed amount on a receipt line is the amount charged for that whole
 * line — it already includes the quantity. Multiplying it by the quantity again
 * is what made multi-quantity lines come out doubled (quantity 2) or tripled
 * (quantity 3). So the line total is taken as printed and never re-multiplied;
 * unitPrice is derived from it instead.
 */

export interface RawLineItem {
  description?: string | null;
  quantity?: number | null;
  unitPrice?: number | null;
  total?: number | null;
}

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

function positiveNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function normalizeLineItems(items: RawLineItem[] | undefined | null): LineItem[] {
  return (items ?? []).reduce<LineItem[]>((acc, item) => {
    const description = typeof item.description === "string" ? item.description.trim() : "";
    if (!description) return acc;

    const quantity = positiveNumber(item.quantity) ?? 1;

    // The line total as printed wins. When the model reports only one amount it
    // is that printed line amount, whichever field it landed in — so use it as
    // the line total rather than as a per-unit price to multiply up.
    const total = positiveNumber(item.total) ?? positiveNumber(item.unitPrice);
    if (total === null) return acc;

    acc.push({
      description,
      quantity,
      unitPrice: round2(total / quantity),
      total: round2(total),
    });
    return acc;
  }, []);
}
