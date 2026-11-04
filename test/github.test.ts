import { describe, it, expect } from "vitest";
import { Octokit } from "@octokit/rest";
import {
  BadCredentialsError,
  createGitHubClient,
  RateLimitError,
  RepoNotFoundError,
} from "../src/services/github.js";

// these tests run the REAL Octokit SDK (real pagination, real header parsing)
// but replace the network with a fake fetch that returns canned GitHub-shaped
// JSON. So we test our mapping code without needing internet or a token.

type Route = (url: URL) => { status?: number; body: unknown; headers?: Record<string, string> };

function fakeOctokit(route: Route): Octokit {
  const fakeFetch = async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const { status = 200, body, headers = {} } = route(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json; charset=utf-8", ...headers },
    });
  };
  return new Octokit({ request: { fetch: fakeFetch } });
}

const user = (id: number, login: string) => ({ id, login, avatar_url: `https://avatars.example/${id}` });
const nextLink = (page: number) => ({
  link: `<https://api.github.com/repositories/1/forks?per_page=100&page=${page}>; rel="next"`,
});

describe("getRepo", () => {
  it("maps GitHub's snake_case payload to our shape", async () => {
    const octokit = fakeOctokit(() => ({
      body: { id: 1296269, name: "Hello-World", owner: user(583231, "octocat"), forks_count: 5000 },
    }));
    const repo = await createGitHubClient(octokit).getRepo("octocat", "Hello-World");
    expect(repo).toEqual({ id: 1296269, owner: "octocat", name: "Hello-World", forksCount: 5000 });
  });

  it("throws RepoNotFoundError on 404", async () => {
    const octokit = fakeOctokit(() => ({ status: 404, body: { message: "Not Found" } }));
    await expect(createGitHubClient(octokit).getRepo("nobody", "nothing")).rejects.toBeInstanceOf(
      RepoNotFoundError
    );
  });

  it("throws BadCredentialsError on 401", async () => {
    const octokit = fakeOctokit(() => ({ status: 401, body: { message: "Bad credentials" } }));
    await expect(createGitHubClient(octokit).getRepo("a", "b")).rejects.toBeInstanceOf(BadCredentialsError);
  });

  it("throws RateLimitError with a reset time when the limit is exhausted", async () => {
    const octokit = fakeOctokit(() => ({
      status: 403,
      body: { message: "API rate limit exceeded" },
      headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1893456000" },
    }));
    const error = await createGitHubClient(octokit)
      .getRepo("a", "b")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).resetAt?.toISOString()).toBe("2030-01-01T00:00:00.000Z");
  });
});

describe("listForks", () => {
  const forkItem = (id: number) => ({ id, created_at: "2026-01-01T00:00:00Z", owner: user(id * 10, `user${id}`) });

  it("follows pagination and reports complete when it reaches the end", async () => {
    const octokit = fakeOctokit((url) =>
      url.searchParams.get("page") === "2"
        ? { body: [forkItem(3)] }
        : { body: [forkItem(1), forkItem(2)], headers: nextLink(2) }
    );
    const result = await createGitHubClient(octokit).listForks("o", "r");
    expect(result.items.map((f) => f.id)).toEqual([1, 2, 3]);
    expect(result.items[0].owner).toEqual({ id: 10, login: "user1", avatarUrl: "https://avatars.example/10" });
    expect(result.complete).toBe(true);
  });

  it("stops at the page cap and reports incomplete", async () => {
    // Every page claims there is a next one, as a huge repo would.
    const octokit = fakeOctokit(() => ({ body: [forkItem(1)], headers: nextLink(2) }));
    const result = await createGitHubClient(octokit, 2).listForks("o", "r");
    expect(result.items).toHaveLength(2); // 2 pages x 1 item, then it stopped
    expect(result.complete).toBe(false);
  });
});

describe("listForkPullRequests", () => {
  const BASE_REPO_ID = 100;
  const pr = (over: Record<string, unknown>) => ({
    id: 1,
    number: 1,
    title: "A change",
    state: "open",
    merged_at: null,
    created_at: "2026-02-01T00:00:00Z",
    user: user(7, "contributor"),
    head: { repo: { id: 555 } },
    base: { repo: { id: BASE_REPO_ID } },
    ...over,
  });

  it("keeps only fork PRs and classifies state correctly", async () => {
    const octokit = fakeOctokit(() => ({
      body: [
        pr({ id: 1, head: { repo: { id: 555 } }, merged_at: "2026-02-02T00:00:00Z", state: "closed" }), // merged fork PR
        pr({ id: 2, head: { repo: { id: BASE_REPO_ID } } }), // same-repo branch: excluded
        pr({ id: 3, head: { repo: null }, state: "closed" }), // deleted fork, closed unmerged
        pr({ id: 4, user: null }), // deleted account: skipped
        pr({ id: 5, state: "open" }), // open fork PR
      ],
    }));
    const result = await createGitHubClient(octokit).listForkPullRequests("o", "r", BASE_REPO_ID);
    expect(result.items.map((p) => [p.id, p.state])).toEqual([
      [1, "merged"],
      [3, "closed"],
      [5, "open"],
    ]);
    expect(result.items[0].mergedAt).toBe("2026-02-02T00:00:00Z");
    expect(result.complete).toBe(true);
  });
});