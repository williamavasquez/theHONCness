import {
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export type NewUser = typeof users.$inferInsert;
export type NewMessage = typeof messages.$inferInsert;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name"),
  email: text("email"),
  settings: jsonb("settings"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  content: text("content").notNull(),
  roomId: text("room_id").notNull(),
  userId: serial("user_id").references(() => users.id),
  userName: text("user_name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
