import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { billsTable } from "./bills";
import { usersTable } from "./users";

export const billUsersTable = pgTable("bill_members", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull().references(() => billsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BillUser = typeof billUsersTable.$inferSelect;
