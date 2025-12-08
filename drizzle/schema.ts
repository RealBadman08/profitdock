import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Bot configurations table
 * Stores trading bot settings and parameters for each user
 */
export const botConfigs = mysqlTable("bot_configs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  asset: varchar("asset", { length: 100 }).notNull(),
  stakeAmount: int("stake_amount").notNull(), // stored in cents to avoid decimal issues
  strategy: varchar("strategy", { length: 100 }).notNull(),
  maxLoss: int("max_loss"), // in cents
  maxProfit: int("max_profit"), // in cents
  tradeInterval: int("trade_interval"), // in seconds
  lossMultiplier: int("loss_multiplier"), // stored as integer (e.g., 200 = 2.0x)
  isActive: int("is_active").default(0).notNull(), // 0 = inactive, 1 = active
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type BotConfig = typeof botConfigs.$inferSelect;
export type InsertBotConfig = typeof botConfigs.$inferInsert;

/**
 * File storage metadata table
 * Stores metadata for files uploaded to S3 (strategy files, logs, etc.)
 */
export const files = mysqlTable("files", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  fileKey: varchar("file_key", { length: 512 }).notNull(), // S3 key
  url: text("url").notNull(), // S3 public URL
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }),
  fileSize: int("file_size"), // in bytes
  category: mysqlEnum("category", ["strategy", "log", "config", "other"]).default("other").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type File = typeof files.$inferSelect;
export type InsertFile = typeof files.$inferInsert;

/**
 * Trades table
 * Stores all trading activity for analytics and leaderboard
 */
export const trades = mysqlTable("trades", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  contractId: varchar("contract_id", { length: 255 }).notNull(),
  symbol: varchar("symbol", { length: 100 }).notNull(),
  contractType: varchar("contract_type", { length: 50 }).notNull(),
  stake: int("stake").notNull(), // in cents
  payout: int("payout"), // in cents
  profit: int("profit"), // in cents
  status: mysqlEnum("status", ["open", "won", "lost"]).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
});

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = typeof trades.$inferInsert;

/**
 * Leaderboard table
 * Aggregated statistics for each trader
 */
export const leaderboard = mysqlTable("leaderboard", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull().unique(),
  username: varchar("username", { length: 255 }).notNull(),
  totalTrades: int("total_trades").default(0).notNull(),
  wonTrades: int("won_trades").default(0).notNull(),
  lostTrades: int("lost_trades").default(0).notNull(),
  totalProfit: int("total_profit").default(0).notNull(), // in cents
  winRate: int("win_rate").default(0).notNull(), // stored as percentage * 100 (e.g., 7550 = 75.50%)
  lastUpdated: timestamp("last_updated").defaultNow().onUpdateNow().notNull(),
});

export type Leaderboard = typeof leaderboard.$inferSelect;
export type InsertLeaderboard = typeof leaderboard.$inferInsert;

/**
 * Bot sessions table
 * Stores complete bot run history with configurations and final results
 */
export const botSessions = mysqlTable("bot_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  botName: varchar("bot_name", { length: 255 }),
  botConfig: text("bot_config"),
  market: varchar("market", { length: 50 }),
  stake: int("stake"), // in cents
  duration: int("duration"),
  contractType: varchar("contract_type", { length: 20 }),
  totalStake: int("total_stake").default(0), // in cents
  totalPayout: int("total_payout").default(0), // in cents
  runs: int("runs").default(0),
  won: int("won").default(0),
  lost: int("lost").default(0),
  profit: int("profit").default(0), // in cents
  status: mysqlEnum("status", ["running", "paused", "completed", "stopped"]).default("completed").notNull(),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BotSession = typeof botSessions.$inferSelect;
export type InsertBotSession = typeof botSessions.$inferInsert;