import { pgTable, serial, text, timestamp, numeric, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const billsTable = pgTable("bills", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  restaurantName: text("restaurant_name"),
  date: text("date").notNull(),
  currency: text("currency"),
  taxPercent: numeric("tax_percent", { precision: 10, scale: 4 }).notNull().default("0"),
  tipPercent: numeric("tip_percent", { precision: 10, scale: 4 }).notNull().default("0"),
  joinCode: text("join_code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  guestOwnerId: text("guest_owner_id"),
  isGuestBill: boolean("is_guest_bill").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const insertBillSchema = createInsertSchema(billsTable).omit({ id: true, createdAt: true });
export type InsertBill = z.infer<typeof insertBillSchema>;
export type Bill = typeof billsTable.$inferSelect;
