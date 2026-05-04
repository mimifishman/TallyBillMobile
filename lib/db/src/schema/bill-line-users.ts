import { pgTable, serial, integer } from "drizzle-orm/pg-core";
import { billLinesTable } from "./bill-lines";
import { billMembersTable } from "./bill-members";

export const billLineMembersTable = pgTable("bill_line_members", {
  id: serial("id").primaryKey(),
  billLineId: integer("bill_line_id").notNull().references(() => billLinesTable.id, { onDelete: "cascade" }),
  billMemberId: integer("bill_member_id").notNull().references(() => billMembersTable.id, { onDelete: "cascade" }),
});

export type BillLineMember = typeof billLineMembersTable.$inferSelect;
