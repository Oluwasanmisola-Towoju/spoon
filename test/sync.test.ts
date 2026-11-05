import pg from "pg";
import { beforeAll, afterAll, afterEach, describe, it, expect } from "vitest";
import { env } from "../src/config/env.js";
import { migrate } from "../src/db/migrate.js";
import { syncRepository } from "../src/services/sync.js";
import { getWidgetData } from "../src/services/widget-data.js";
import type { Fetched, GitHubClient, GitHubFork, GitHubPullRequest, GitHubRepo } from "../src/types/github.js";

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

// test data uses its own owner and high ids so it can never touch the seed data.
const OWNER = "sync-test";
const REPO_ID = 9_000_001;

beforeAll(async () => {
  await migrate(pool);
});

// Wipe whatever a test created. Deleting the repo cascades to forks and PRs.
afterEach(async () => {
  await pool.query("DELETE FROM repositories WHERE lower(owner) = lower($1)", [OWNER]);
});

afterAll(async () => {
  await pool.end();
});

// ---- helpers: build a fake GitHubClient from plain data ----
const person = (id: number, login: string) => ({ id: 9_100_000 + id, login, avatarUrl: null });
const fork = (n: number): GitHubFork => ({
  id: 9_200_000 + n,
  createdAt: "2026-01-01T00:00:00Z",
  owner: person(n, `forker${n}`),
});
const pullRequest = (n: number, by: number, state: GitHubPullRequest["state"]): GitHubPullRequest => ({
  id: 9_300_000 + n,
  number: n,
  title: `PR ${n}`,
  state,
  mergedAt: state === "merged" ? "2026-03-01T00:00:00Z" : null,
  createdAt: "2026-02-01T00:00:00Z",
  updatedAt: state === "merged" ? "2026-03-01T00:00:00Z" : "2026-02-01T00:00:00Z",
  author: person(by, `forker${by}`),
});

function fakeClient(opts: {
  repo?: Partial<GitHubRepo>;
  forks: GitHubFork[];
  prs: GitHubPullRequest[];
  forksComplete?: boolean;
}): GitHubClient {
  const repo: GitHubRepo = { id: REPO_ID, owner: OWNER, name: "demo", forksCount: opts.forks.length, ...opts.repo };
  return {
    getRepo: async () => repo,
    listForks: async (): Promise<Fetched<GitHubFork>> => ({
      items: opts.forks,
      complete: opts.forksComplete ?? true,
    }),
    listForkPullRequests: async (): Promise<Fetched<GitHubPullRequest>> => ({ items: opts.prs, complete: true }),
  };
}

const count = async (table: string) =>
  Number(
    (
      await pool.query(
        `SELECT count(*) AS n FROM ${table} t JOIN repositories r ON r.id = t.repository_id WHERE r.github_id = $1`,
        [REPO_ID]
      )
    ).rows[0].n
  );

describe("syncRepository", () => {
  it("stores forks, people and PRs, and the widget reads them", async () => {
    const client = fakeClient({
      repo: { forksCount: 250 }, // GitHub says 250 even though we only hold 3
      forks: [fork(1), fork(2), fork(3)],
      prs: [pullRequest(1, 1, "merged"), pullRequest(2, 1, "merged"), pullRequest(3, 2, "open")],
    });

    const summary = await syncRepository(pool, client, OWNER, "demo");
    expect(summary).toMatchObject({ forks: 3, forkers: 3, pullRequests: 3, mergedPullRequests: 2, complete: true });

    const widget = await getWidgetData(pool, OWNER, "demo");
    expect(widget?.forkCount).toBe(250); // GitHub's total beats our row count
    expect(widget?.mergedPrTotal).toBe(2);
    expect(widget?.topForkers[0]).toEqual({ login: "forker1", mergedPrCount: 2 });
  });

  it("is idempotent: syncing twice creates no duplicates", async () => {
    const client = fakeClient({ forks: [fork(1), fork(2)], prs: [pullRequest(1, 1, "merged")] });
    await syncRepository(pool, client, OWNER, "demo");
    await syncRepository(pool, client, OWNER, "demo");
    expect(await count("forks")).toBe(2);
    expect(await count("pull_requests")).toBe(1);
  });

  it("updates a PR when its state changes between syncs", async () => {
    await syncRepository(pool, fakeClient({ forks: [fork(1)], prs: [pullRequest(1, 1, "open")] }), OWNER, "demo");
    await syncRepository(pool, fakeClient({ forks: [fork(1)], prs: [pullRequest(1, 1, "merged")] }), OWNER, "demo");
    const { rows } = await pool.query("SELECT state, merged_at FROM pull_requests WHERE github_id = $1", [9_300_001]);
    expect(rows[0].state).toBe("merged");
    expect(rows[0].merged_at).not.toBeNull();
  });

  it("removes forks deleted on GitHub, but only when the fork list was complete", async () => {
    await syncRepository(pool, fakeClient({ forks: [fork(1), fork(2)], prs: [] }), OWNER, "demo");

    // Capped list that happens to lack fork 2: we must NOT delete it.
    await syncRepository(pool, fakeClient({ forks: [fork(1)], prs: [], forksComplete: false }), OWNER, "demo");
    expect(await count("forks")).toBe(2);

    // Complete list without fork 2: now it really is gone.
    await syncRepository(pool, fakeClient({ forks: [fork(1)], prs: [] }), OWNER, "demo");
    expect(await count("forks")).toBe(1);
  });

  it("replaces a stale row that holds the same owner/name under a different GitHub id", async () => {
    await pool.query("INSERT INTO repositories (github_id, owner, name) VALUES (9000999, $1, 'demo')", [OWNER]);
    await syncRepository(pool, fakeClient({ forks: [fork(1)], prs: [] }), OWNER, "demo");
    const { rows } = await pool.query("SELECT github_id FROM repositories WHERE lower(owner) = lower($1)", [OWNER]);
    expect(rows.map((r) => Number(r.github_id))).toEqual([REPO_ID]);
  });

  it("rolls everything back if any write fails", async () => {
    // 'bogus' violates the CHECK constraint on pull_requests.state
    const bad = { ...pullRequest(1, 1, "open"), state: "bogus" as GitHubPullRequest["state"] };
    await expect(syncRepository(pool, fakeClient({ forks: [fork(1)], prs: [bad] }), OWNER, "demo")).rejects.toThrow();
    const { rows } = await pool.query("SELECT 1 FROM repositories WHERE github_id = $1", [REPO_ID]);
    expect(rows).toHaveLength(0); // the repository insert was undone too
  });
});