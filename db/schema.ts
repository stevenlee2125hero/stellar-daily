import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const feedback = sqliteTable("feedback", { storyId:text("story_id").primaryKey(), value:integer("value").notNull(), updatedAt:text("updated_at").notNull() });
export const users = sqliteTable("users", { username:text("username").primaryKey(), passwordHash:text("password_hash").notNull(), salt:text("salt").notNull(), createdAt:text("created_at").notNull() });
export const favorites = sqliteTable("favorites", { username:text("username").notNull(), storyId:text("story_id").notNull(), storyJson:text("story_json").notNull(), createdAt:text("created_at").notNull() }, table=>[primaryKey({columns:[table.username,table.storyId]})]);
