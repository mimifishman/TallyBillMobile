import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { billsTable } from "./bills";

export const billMembersTable = pgTable("bill_members", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull().references(() => billsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull(),
  tipPercentOverride: numeric("tip_percent_override", { precision: 10, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBillMemberSchema = createInsertSchema(billMembersTable).omit({ id: true, createdAt: true });
export type InsertBillMember = z.infer<typeof insertBillMemberSchema>;
export type BillMember = typeof billMembersTable.$inferSelect;
