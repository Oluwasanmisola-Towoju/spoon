import pg from "pg";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { migrate } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { getWidgetData } from "../src/services/widget-data.js";

// these tests use the real database. beforeAll makes sure the tables exist
// and the sample data is loaded, so the tests don't depend on having
// run the seed by hand.
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

beforeAll(async () => {
  await migrate(pool);
  await seed(pool);
});

afterAll(async () => {
  await pool.end();
});

describe("getWidgetData", () => {
  it("computes counts and ranks forkers by merged PRs", async () => {
    const data = await getWidgetData(pool, "octocat", "hello-world");
    expect(data).not.toBeNull();
    expect(data!.forkCount).toBe(6);
    expect(data!.mergedPrTotal).toBe(35);
    expect(data!.topForkers).toHaveLength(5);
    expect(data!.topForkers[0]).toEqual({ login: "Oluwasanmisola-Towoju", mergedPrCount: 14 });
  });

  it("matches owner and repo case-insensitively", async () => {
    const data = await getWidgetData(pool, "OCTOCAT", "Hello-World");
    expect(data?.owner).toBe("octocat");
  });

  it("returns null for a repo we don't track", async () => {
    expect(await getWidgetData(pool, "nobody", "nothing")).toBeNull();
  });

  it("is safe against SQL injection attempts", async () => {
    const data = await getWidgetData(pool, "octocat", "x' OR '1'='1");
    expect(data).toBeNull();
  });
});

describe("GET /widget/:owner/:repo", () => {
  it("returns an SVG with the right headers", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/widget/octocat/hello-world.svg" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
    expect(res.headers["cache-control"]).toContain("s-maxage");
    expect(res.headers["content-security-policy"]).toContain("font-src data:");
    expect(res.body).toContain("octocat/hello-world");
    await app.close();
  });

  it("supports the light theme", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/widget/octocat/hello-world?theme=light" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("#ffffff");
    await app.close();
  });

  it("returns 404 for a repo Spoon doesn't track", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/widget/nobody/nothing.svg" });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("rejects invalid owner names", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/widget/bad_owner!/repo" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("rejects unknown themes", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/widget/octocat/hello-world?theme=neon" });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});