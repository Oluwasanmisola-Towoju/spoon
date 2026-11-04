import pg from "pg";
import { env } from "../src/config/env.js";
import {
    BadCredentialsError,
    createGitHubClient,
    createOctokit,
    RateLimitError,
    RepoNotFoundError
} from "../src/services/github.js";
import { syncRepository } from "../src/services/sync.js";

// use by: pnpm sync owner/repo
const target = process.argv[2] ?? "";
const [owner, repo, ...extra] = target.split("/");

if (!owner || !repo || extra.length > 0) {
    console.error("Usage: pnpm sync <owner>/<repo>");
    process.exit(1);
}

const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

try {
    // build the real Octokit, wrap it in our own GitHubClient, and pass it to the sync service
    // service never knows it's talking to GitHub
    const github = createGitHubClient(createOctokit(env.GITHUB_TOKEN));
    console.log(`Syncing ${owner}/${repo}${env.GITHUB_TOKEN ? "" : " (no token: 60 requests/hour limit)"}...`);

    const summary = await syncRepository(pool, github, owner, repo);

    console.log(`Done: ${summary.repository}`);
    console.log(`  forks stored:        ${summary.forks}`);
    console.log(`  people:              ${summary.forkers}`);
    console.log(`  fork pull requests:  ${summary.pullRequests} (${summary.mergedPullRequests} merged)`);
    if (!summary.complete) {
        console.log("  note: hit the page limit, so this is the newest slice of a larger repo");
    }
}
catch (error) {
    // expected problems get a friendly one-liner, unexpected problems get a stack trace
    if (
        error instanceof RepoNotFoundError ||
        error instanceof BadCredentialsError ||
        error instanceof RateLimitError
    ) {
        console.error(error.message);
    }
    else {
        console.error(error);
    }
    process.exitCode = 1;
}
finally {
    await pool.end();
}