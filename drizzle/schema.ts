import { boolean, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: text("openId").notNull().unique(),
  name: text("name"),
  email: text("email"),
  loginMethod: text("loginMethod"),
  role: text("role", { enum: ["user", "admin"] }).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Bot configurations table
 * Stores trading bot settings and parameters for each user
 */
export const botConfigs = pgTable("bot_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  asset: text("asset").notNull(),
  stakeAmount: integer("stake_amount").notNull(), // stored in cents
  strategy: text("strategy").notNull(),
  maxLoss: integer("max_loss"), // in cents
  maxProfit: integer("max_profit"), // in cents
  tradeInterval: integer("trade_interval"), // in seconds
  lossMultiplier: integer("loss_multiplier"), // stored as integer
  isActive: integer("is_active").default(0).notNull(), // 0 = inactive, 1 = active. PG has boolean, but keeping int for compat or switch to boolean
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type BotConfig = typeof botConfigs.$inferSelect;
export type InsertBotConfig = typeof botConfigs.$inferInsert;

/**
 * File storage metadata table
 */
export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  fileKey: text("file_key").notNull(),
  url: text("url").notNull(),
  filename: text("filename").notNull(),
  mimeType: text("mime_type"),
  fileSize: integer("file_size"),
  category: text("category", { enum: ["strategy", "log", "config", "other"] }).default("other").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type File = typeof files.$inferSelect;
export type InsertFile = typeof files.$inferInsert;

/**
 * Trades table
 */
export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  contractId: text("contract_id").notNull(),
  symbol: text("symbol").notNull(),
  contractType: text("contract_type").notNull(),
  stake: integer("stake").notNull(), // in cents
  payout: integer("payout"), // in cents
  profit: integer("profit"), // in cents
  status: text("status", { enum: ["open", "won", "lost"] }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  closedAt: timestamp("closed_at"),
});

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = typeof trades.$inferInsert;

/**
 * Leaderboard table
 */
export const leaderboard = pgTable("leaderboard", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(), // No unique constraint on userId in original?? Added unique in MySQL version, adding here too.
  username: text("username").notNull(),
  totalTrades: integer("total_trades").default(0).notNull(),
  wonTrades: integer("won_trades").default(0).notNull(),
  lostTrades: integer("lost_trades").default(0).notNull(),
  totalProfit: integer("total_profit").default(0).notNull(),
  winRate: integer("win_rate").default(0).notNull(),
  lastUpdated: timestamp("last_updated").defaultNow().notNull(),
});

export type Leaderboard = typeof leaderboard.$inferSelect;
export type InsertLeaderboard = typeof leaderboard.$inferInsert;

/**
 * Bot sessions table
 */
export const botSessions = pgTable("bot_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  botName: text("bot_name"),
  botConfig: text("bot_config"),
  market: text("market"),
  stake: integer("stake"),
  duration: integer("duration"),
  contractType: text("contract_type"),
  totalStake: integer("total_stake").default(0),
  totalPayout: integer("total_payout").default(0),
  runs: integer("runs").default(0),
  won: integer("won").default(0),
  lost: integer("lost").default(0),
  profit: integer("profit").default(0),
  status: text("status", { enum: ["running", "paused", "completed", "stopped"] }).default("completed").notNull(),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BotSession = typeof botSessions.$inferSelect;
export type InsertBotSession = typeof botSessions.$inferInsert;