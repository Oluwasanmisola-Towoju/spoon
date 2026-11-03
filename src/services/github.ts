import { Octokit }  from "@octokit/rest";
import type {
    Fetched,
    GitHubClient,
    GitHubFork,
    GitHubPullRequest,
    GitHubUser,
} from "../types/github.js";

const PER_PAGE = 100; // max allowed by GitHub
const DEFAULT_MAX_PAGES = 10; // cap how many pages we fetch to protect rate limit

// using custom errrors instead of parsing message strings makes it easier to handle specific errors in the sync service
export class RepoNotFoundError extends Error {
    constructor(owner: string, repo: string) {
        super(`GitHub repository ${owner}/${repo} was not found (or is private)`);
        this.name = "RepoNotFoundError";
    }
}

export class RateLimitError extends Error {
    constructor(public resetAt: Date | null) {
        super(
            `GitHub API rate limit reached${resetAt ? `, resets at ${resetAt.toISOString()}` : ""}. ` +
                "Set GITHUB_TOKEN in .env to raise the limit, or wait until the reset time to continue."
            );
        this.name = "RateLimitError";
    }
}

export class BadCredentialsError extends Error {
    constructor() {
        super("GitHub rejected the token (401). Check that GITHUB_TOKEN in .env is valid and has the correct scopes.");
        this.name = "BadCredentialsError";
    }     
}

//octokit throws errors that carry the HTTP status while I translate the ones we care about into our own error types
function translateError(error: unknown, owner: string, repo: string): never {
    const e = error as { status?: number; response?: { headers?: Record<string, string | undefined > } };

    const headers = e.response?.headers ?? {};

    if (e.status === 401) throw new BadCredentialsError();
    if (e.status === 404) throw new RepoNotFoundError(owner, repo);

    // GH signals rate limiting with 429
    if (e.status === 429 || e.status === 403 && headers["x-ratelimit-remaining"] === "0") {
        const reset = Number(headers["x-ratelimit-reset"]);
        throw new RateLimitError(Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000) : null);
    }
    throw error;
}

function toUser(user: { id: number; login: string; avatar_url: string } | null | undefined ): GitHubUser | null {
    if (!user) return null;
    return { id: user.id, login: user.login, avatarUrl: user.avatar_url ?? null };
}

export function createOctokit(token?: string): Octokit {
    return new Octokit({ auth: token, userAgent: "spoon-widget" });
}

// used dependency injection since 'octokit' is a parameter (not imported) so we can mock it in tests
export function createGitHubClient(octokit: Octokit, maxPages = DEFAULT_MAX_PAGES): GitHubClient {
    return {
        async getRepo(owner, repo) {
            try {
                const { data } = await octokit.rest.repos.get({ owner, repo });
                return {
                    id: data.id,
                    owner: data.owner.login,
                    name: data.name,
                    forksCount: data.forks_count
                };
            }
            catch (error) {
                translateError(error, owner, repo);
            }
        },

        async listForks(owner, repo) {
            const items: GitHubFork[] = [];
            let complete = true;
            try {
                // using paginate.iterator to hand one page at a time
                // instead of octokit.paginate that would download everything, however many pages
                const pages = octokit.paginate.iterator(octokit.rest.repos.listForks, {
                    owner,
                    repo,
                    per_page: PER_PAGE,
                    sort: "newest"
                });

                let pageCount = 0;
                for await (const page of pages) {
                    pageCount++;
                    for (const fork of page.data) {
                        const forkOwner = toUser(fork.owner);
                        if (forkOwner) items.push({ id: fork.id, createdAt: fork.created_at ?? "", owner: forkOwner });
                    }

                    // GH tells whether another page exists in the link header
                    // so we can know we stopped early without one more request
                    const hasNext = /rel="next"/.test(page.headers.link ?? "");
                    if (pageCount >= maxPages) {
                        complete = !hasNext;
                        break;
                    }
                }
            }
            catch (error) {
                translateError(error, owner, repo);
            }
            return { items, complete } satisfies Fetched<GitHubFork>;
        },

        async listForkPullRequests(owner, repo, baseRepoId) {
            const items: GitHubPullRequest[] = [];
            let complete = true;
            try {
                const pages = octokit.paginate.iterator(octokit.rest.pulls.list, {
                    owner,
                    repo,
                    state: "all",
                    sort: "created",
                    direction: "desc",
                    per_page: PER_PAGE
                });

                let pageCount = 0;
                for await (const page of pages) {
                    pageCount++;
                    for (const pr of page.data) {
                        // only include PRs that came from forks (including deleted forks)
                        const fromFork = pr.head.repo === null || pr.head.repo.id !== baseRepoId;
                        const author = toUser(pr.user);

                        // no author means a deleted user, which we don't want to include in the sync
                        if (!fromFork || !author) continue;

                        items.push({
                            id: pr.id,
                            number: pr.number,
                            title: pr.title,

                            // GH only says "open" or "closed", but we can tell if it was merged by the merged_at field
                            state: pr.merged_at ? "merged" : pr.state === "open" ? "open" : "closed",
                            mergedAt: pr.merged_at,
                            createdAt: pr.created_at,
                            author
                        });
                    }

                    const hasNext = /rel="next"/.test(page.headers.link ?? "");
                    if (pageCount >= maxPages) {
                        complete = !hasNext;
                        break;
                    }
                }
            }
            catch (error) {
                translateError(error, owner, repo);
            }
            return { items, complete } satisfies Fetched<GitHubPullRequest>;
        }
    };
}