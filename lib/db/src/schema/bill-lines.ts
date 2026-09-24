import { pgTable, serial, integer, text, numeric, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { billsTable } from "./bills";

export const billLinesTable = pgTable("bill_lines", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull().references(() => billsTable.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  originalDescription: text("original_description"),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull().default("0"),
  /** The amount actually charged for this line, after any discount on it. */
  total: numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
  /** What the line cost before its discount. Null when it was not discounted. */
  originalTotal: numeric("original_total", { precision: 10, scale: 2 }),
  /**
   * Money off this line. Kept as an amount, not a rate: receipts round their
   * own discounts their own way, and a stored rate would recompute to a number
   * the printed receipt disagrees with.
   */
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  // NOTE: there was a `discount_label` column here, holding how the receipt
  // worded the discount. It was written and never read, and migration 0014
  // drops it. How a discount reads to a person is worked out from originalTotal
  // and total where it is shown, so a stored wording could only go stale when a
  // price is edited or be lost by a write that forgot to send it — which is
  // exactly how editing an item used to drop a discount. Do not add it back.
  position: doublePrecision("position"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBillLineSchema = createInsertSchema(billLinesTable).omit({ id: true, createdAt: true });
export type InsertBillLine = z.infer<typeof insertBillLineSchema>;
export type BillLine = typeof billLinesTable.$inferSelect;
