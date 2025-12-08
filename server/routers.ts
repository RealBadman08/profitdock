import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { z } from "zod";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import * as db from "./db";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // Trades router
  trades: router({
    record: protectedProcedure
      .input(
        z.object({
          contractId: z.string(),
          symbol: z.string(),
          contractType: z.string(),
          stake: z.number(),
          payout: z.number().optional(),
          profit: z.number().optional(),
          status: z.enum(["open", "won", "lost"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const trade = await db.recordTrade(ctx.user.id, input);
        
        // Update leaderboard if trade is closed
        if (input.status !== "open") {
          await db.updateLeaderboard(ctx.user.id, ctx.user.name || "Anonymous");
        }
        
        return trade;
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserTrades(ctx.user.id);
    }),
  }),

  // Bot sessions router
  botSessions: router({
    create: protectedProcedure
      .input(
        z.object({
          botName: z.string().optional(),
          botConfig: z.string().optional(),
          market: z.string().optional(),
          stake: z.number().optional(),
          duration: z.number().optional(),
          contractType: z.string().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await db.createBotSession(ctx.user.id, input);
      }),

    update: protectedProcedure
      .input(
        z.object({
          sessionId: z.number(),
          stats: z.object({
            totalStake: z.number(),
            totalPayout: z.number(),
            runs: z.number(),
            won: z.number(),
            lost: z.number(),
            profit: z.number(),
          }),
          status: z.enum(["running", "paused", "completed", "stopped"]).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        return await db.updateBotSession(input.sessionId, input.stats, input.status);
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserBotSessions(ctx.user.id);
    }),
  }),

  // Leaderboard router
  leaderboard: router({
    get: publicProcedure.query(async () => {
      return await db.getLeaderboard();
    }),

    myStats: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserLeaderboardStats(ctx.user.id);
    }),
  }),

  // File storage router
  files: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserFiles(ctx.user.id);
    }),

    upload: protectedProcedure
      .input(
        z.object({
          filename: z.string(),
          mimeType: z.string(),
          fileSize: z.number(),
          category: z.enum(["strategy", "log", "config", "other"]),
          description: z.string().optional(),
          base64Data: z.string(), // base64 encoded file data
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Decode base64 data
        const buffer = Buffer.from(input.base64Data, "base64");

        // Generate unique file key with random suffix to prevent enumeration
        const fileKey = `${ctx.user.id}/files/${nanoid()}-${input.filename}`;

        // Upload to S3
        const { url } = await storagePut(fileKey, buffer, input.mimeType);

        // Save metadata to database
        await db.createFileRecord({
          userId: ctx.user.id,
          fileKey,
          url,
          filename: input.filename,
          mimeType: input.mimeType,
          fileSize: input.fileSize,
          category: input.category,
          description: input.description || null,
        });

        return { success: true, url, fileKey };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Verify file belongs to user before deleting
        const file = await db.getFileById(input.id, ctx.user.id);
        if (!file) {
          throw new Error("File not found or access denied");
        }

        // Delete from database (S3 files remain for now - can add S3 deletion if needed)
        await db.deleteFileRecord(input.id, ctx.user.id);

        return { success: true };
      }),
  }),

  // Bot configuration router
  botConfigs: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserBotConfigs(ctx.user.id);
    }),

    create: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1),
          asset: z.string().min(1),
          stakeAmount: z.number().positive(),
          strategy: z.string().min(1),
          maxLoss: z.number().optional(),
          maxProfit: z.number().optional(),
          tradeInterval: z.number().optional(),
          lossMultiplier: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await db.createBotConfig({
          userId: ctx.user.id,
          ...input,
        });
        return { success: true };
      }),

    update: protectedProcedure
      .input(
        z.object({
          id: z.number(),
          name: z.string().optional(),
          asset: z.string().optional(),
          stakeAmount: z.number().optional(),
          strategy: z.string().optional(),
          maxLoss: z.number().optional(),
          maxProfit: z.number().optional(),
          tradeInterval: z.number().optional(),
          lossMultiplier: z.number().optional(),
          isActive: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const { id, ...updates } = input;
        await db.updateBotConfig(id, ctx.user.id, updates);
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.deleteBotConfig(input.id, ctx.user.id);
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
