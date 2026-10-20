import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";

describe("GET /widget/:owner/:repo", () => {
  it("returns an SVG with the right headers", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/widget/octocat/hello-world.svg" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("image/svg+xml");
    expect(res.headers["cache-control"]).toContain("s-maxage");
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