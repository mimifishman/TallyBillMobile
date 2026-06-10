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
  total: numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
  position: doublePrecision("position"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBillLineSchema = createInsertSchema(billLinesTable).omit({ id: true, createdAt: true });
export type InsertBillLine = z.infer<typeof insertBillLineSchema>;
export type BillLine = typeof billLinesTable.$inferSelect;
