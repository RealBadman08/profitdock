import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { InsertUser, users, botConfigs, files, trades, leaderboard, InsertTrade, botSessions } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
      });
      _db = drizzle(pool);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

/**
 * Bot Configuration Queries
 */
export async function getUserBotConfigs(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(botConfigs).where(eq(botConfigs.userId, userId));
}

export async function createBotConfig(config: typeof botConfigs.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(botConfigs).values(config);
  return result;
}

export async function updateBotConfig(id: number, userId: number, updates: Partial<typeof botConfigs.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and } = await import("drizzle-orm");
  await db.update(botConfigs).set(updates).where(and(eq(botConfigs.id, id), eq(botConfigs.userId, userId)));
}

export async function deleteBotConfig(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and } = await import("drizzle-orm");
  await db.delete(botConfigs).where(and(eq(botConfigs.id, id), eq(botConfigs.userId, userId)));
}

/**
 * File Storage Queries
 */
export async function getUserFiles(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const { desc } = await import("drizzle-orm");
  return db.select().from(files).where(eq(files.userId, userId)).orderBy(desc(files.createdAt));
}

export async function createFileRecord(file: typeof files.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(files).values(file);
  return result;
}

export async function deleteFileRecord(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const { and } = await import("drizzle-orm");
  await db.delete(files).where(and(eq(files.id, id), eq(files.userId, userId)));
}

export async function getFileById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const { and } = await import("drizzle-orm");
  const result = await db.select().from(files).where(and(eq(files.id, id), eq(files.userId, userId))).limit(1);
  return result.length > 0 ? result[0] : undefined;
}


// ==================== Trades Functions ====================

export async function recordTrade(userId: number, trade: Omit<InsertTrade, "userId">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const stakeInCents = Math.round(trade.stake * 100);
  const payoutInCents = trade.payout ? Math.round(trade.payout * 100) : null;
  const profitInCents = trade.profit ? Math.round(trade.profit * 100) : null;

  const [result] = await db.insert(trades).values({
    userId,
    contractId: trade.contractId,
    symbol: trade.symbol,
    contractType: trade.contractType,
    stake: stakeInCents,
    payout: payoutInCents,
    profit: profitInCents,
    status: trade.status,
  });

  return result;
}

export async function getUserTrades(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const userTrades = await db.select().from(trades).where(eq(trades.userId, userId)).orderBy(trades.createdAt);

  // Convert cents back to dollars
  return userTrades.map((trade) => ({
    ...trade,
    stake: trade.stake / 100,
    payout: trade.payout ? trade.payout / 100 : null,
    profit: trade.profit ? trade.profit / 100 : null,
  }));
}

// ==================== Leaderboard Functions ====================

export async function updateLeaderboard(userId: number, username: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get user's trade statistics
  const userTrades = await db.select().from(trades).where(eq(trades.userId, userId));

  const totalTrades = userTrades.length;
  const wonTrades = userTrades.filter((t) => t.status === "won").length;
  const lostTrades = userTrades.filter((t) => t.status === "lost").length;
  const totalProfit = userTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
  const winRate = totalTrades > 0 ? Math.round((wonTrades / totalTrades) * 10000) : 0; // stored as percentage * 100

  // Upsert leaderboard entry
  const existing = await db.select().from(leaderboard).where(eq(leaderboard.userId, userId));

  if (existing.length > 0) {
    await db
      .update(leaderboard)
      .set({
        username,
        totalTrades,
        wonTrades,
        lostTrades,
        totalProfit,
        winRate,
      })
      .where(eq(leaderboard.userId, userId));
  } else {
    await db.insert(leaderboard).values({
      userId,
      username,
      totalTrades,
      wonTrades,
      lostTrades,
      totalProfit,
      winRate,
    });
  }
}

export async function getLeaderboard() {
  const db = await getDb();
  if (!db) return [];

  const leaders = await db.select().from(leaderboard).orderBy(leaderboard.totalProfit).limit(100);

  // Convert cents to dollars and percentage
  return leaders.map((leader) => ({
    ...leader,
    totalProfit: leader.totalProfit / 100,
    winRate: leader.winRate / 100,
  }));
}

export async function getUserLeaderboardStats(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const [stats] = await db.select().from(leaderboard).where(eq(leaderboard.userId, userId));

  if (!stats) return null;

  return {
    ...stats,
    totalProfit: stats.totalProfit / 100,
    winRate: stats.winRate / 100,
  };
}

// ==================== Bot Sessions Functions ====================

export async function createBotSession(
  userId: number,
  sessionData: {
    botName?: string;
    botConfig?: string;
    market?: string;
    stake?: number;
    duration?: number;
    contractType?: string;
  }
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db.insert(botSessions).values({
    userId,
    ...sessionData,
    startedAt: new Date(),
  });
  return result;
}

export async function updateBotSession(
  sessionId: number,
  stats: {
    totalStake: number;
    totalPayout: number;
    runs: number;
    won: number;
    lost: number;
    profit: number;
  },
  status?: 'running' | 'paused' | 'completed' | 'stopped'
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const updateData: any = {
    ...stats,
    endedAt: status === 'completed' || status === 'stopped' ? new Date() : undefined,
  };

  if (status) {
    updateData.status = status;
  }

  await db
    .update(botSessions)
    .set(updateData)
    .where(eq(botSessions.id, sessionId));

  return { success: true };
}

export async function getUserBotSessions(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const { desc } = await import("drizzle-orm");
  return await db
    .select()
    .from(botSessions)
    .where(eq(botSessions.userId, userId))
    .orderBy(desc(botSessions.createdAt));
}
