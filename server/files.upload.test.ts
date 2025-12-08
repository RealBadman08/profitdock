import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };

  return { ctx };
}

describe("files.upload", () => {
  it("should upload a file and return success with URL", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Create a simple test file (1x1 pixel transparent PNG)
    const testFileBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const result = await caller.files.upload({
      filename: "test-strategy.png",
      mimeType: "image/png",
      fileSize: 68,
      category: "strategy",
      description: "Test strategy file",
      base64Data: testFileBase64,
    });

    expect(result.success).toBe(true);
    expect(result.url).toBeDefined();
    expect(result.url).toContain("https://");
    expect(result.fileKey).toBeDefined();
    expect(result.fileKey).toContain("test-strategy.png");
  });

  it("should list uploaded files for the user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const files = await caller.files.list();

    expect(Array.isArray(files)).toBe(true);
    // After the upload test, there should be at least one file
    // Note: This assumes tests run in sequence and database persists
  });
});

describe("botConfigs.create", () => {
  it("should create a bot configuration", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.botConfigs.create({
      name: "Test Bot",
      asset: "BTC/USD",
      stakeAmount: 1000, // $10.00 in cents
      strategy: "Martingale",
      maxLoss: 5000,
      maxProfit: 10000,
      tradeInterval: 60,
      lossMultiplier: 200, // 2.0x
    });

    expect(result.success).toBe(true);
  });

  it("should list bot configurations for the user", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const configs = await caller.botConfigs.list();

    expect(Array.isArray(configs)).toBe(true);
  });
});
