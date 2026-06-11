import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const circlesTable = pgTable("circles", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const circleMembersTable = pgTable("circle_members", {
  id: serial("id").primaryKey(),
  circleId: integer("circle_id").notNull().references(() => circlesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  linkedUserId: integer("linked_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCircleSchema = createInsertSchema(circlesTable).omit({ id: true, createdAt: true });
export type InsertCircle = z.infer<typeof insertCircleSchema>;
export type Circle = typeof circlesTable.$inferSelect;

export const insertCircleMemberSchema = createInsertSchema(circleMembersTable).omit({ id: true, createdAt: true });
export type InsertCircleMember = z.infer<typeof insertCircleMemberSchema>;
export type CircleMember = typeof circleMembersTable.$inferSelect;
