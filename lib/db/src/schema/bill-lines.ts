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
  /** How the receipt worded it, e.g. "25% Happy Hour". */
  discountLabel: text("discount_label"),
  position: doublePrecision("position"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBillLineSchema = createInsertSchema(billLinesTable).omit({ id: true, createdAt: true });
export type InsertBillLine = z.infer<typeof insertBillLineSchema>;
export type BillLine = typeof billLinesTable.$inferSelect;
