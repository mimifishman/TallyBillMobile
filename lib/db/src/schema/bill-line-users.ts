import { pgTable, serial, integer } from "drizzle-orm/pg-core";
import { billLinesTable } from "./bill-lines";
import { billUsersTable } from "./bill-users";

export const billLineUsersTable = pgTable("bill_line_users", {
  id: serial("id").primaryKey(),
  billLineId: integer("bill_line_id").notNull().references(() => billLinesTable.id, { onDelete: "cascade" }),
  billUserId: integer("bill_user_id").notNull().references(() => billUsersTable.id, { onDelete: "cascade" }),
});

export type BillLineUser = typeof billLineUsersTable.$inferSelect;
