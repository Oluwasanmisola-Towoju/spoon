import { describe, it, expect } from "vitest";
import { buildApp } from "../src/app.js";

describe("GET /health", () => {
  it("returns status ok", async () => {
    const app = await buildApp();

    // inject simulates a request in-process straight to the app without a network
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("ok");

    // Always close the app so the test process can exit cleanly
    await app.close();
  });

  it("returns a JSON 404 for unknown routes", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/nope" });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toContain("not found");

    await app.close();
  });
});