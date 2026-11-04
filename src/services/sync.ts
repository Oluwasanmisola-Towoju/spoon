import type pg from "pg";
import type { GitHubClient, GitHubUser } from "../types/github.js";

export interface SyncSummary {
    repository: string;
    forks: number;
    forkers: number;
    pullRequests: number;
    mergedPullRequests: number;
    complete: boolean; // false means the page cap was hit, so rows are the newest slice only
}

// pull a repo's forks and fork-originated PRs from GH and store them
// every write is an upsert, so existing rows get updated instead of duplicated
export async function syncRepository(
    db: pg.Pool,
    github: GitHubClient,
    owner: string,
    repo: string
): Promise<SyncSummary> {
    // reach GH fist before touching the database
    const repoInfo = await github.getRepo(owner, repo);

    // the fork list and PR list don't depend on each other, so we can fetch them in parallel
    const [forks, prs] = await Promise.all([
        github.listForks(owner, repo),
        github.listForkPullRequests(owner, repo, repoInfo.id)
    ]);

    // since a person can show up as a fork owner AND as a PR author, we de-duplicate by GH using a Map keyed by user ID
    const people = new Map<number, GitHubUser>();
    for (const fork of forks.items) { 
        people.set(fork.owner.id, fork.owner);
    }
    for (const pr of prs.items) {
        people.set(pr.author.id, pr.author);
    }

    // everything is written in 1 transaction, so a failure halfway leaves the db exactly as it was not half-updated
    const client = await db.connect();
    try {
        await client.query("BEGIN");

        // if a repo alrefy holds this owner/name, the unique name index would reject the insert
        // the name now belongs to the GH repo we just fetched, so the stale row goes. ON DELETE CASCADE remoevs its children
        await client.query(
            `DELETE FROM repositories
            WHERE lower(owner) = lower($1) AND lower(name) = lower($2) AND github_id <> $3`,
            [repoInfo.owner, repoInfo.name, repoInfo.id]
        );

        // upsert the repo itself
        const repoRow = await client.query<{ id: string }>(
            `INSERT INTO repositories (github_id, owner, name, forks_count, last_synced_at)
            VALUES ($1, $2, $3, $4, now())
            ON CONFLICT (github_id) DO UPDATE SET
                owner = EXCLUDED.owner,
                name = EXCLUDED.name,
                forks_count = EXCLUDED.forks_count,
                last_synced_at = now(),
                updated_at = now()
            RETURNING id`,
            [repoInfo.id, repoInfo.owner, repoInfo.name, repoInfo.forksCount]
        );
        const repositoryId = repoRow.rows[0].id;

        // upsert all people in 1 statement, unnest() turns parallel arrays into rows
        // so 500 people cost one round trip instead of 500
        const list = [...people.values()];
        const forkerRows = list.length
            ? await client.query<{ id: string; github_id: string }>(
                `INSERT INTO forkers (github_id, login, avatar_url)
                SELECT * FROM unnest($1::bigint[], $2::text[], $3::text[])
                ON CONFLICT (github_id) DO UPDATE SET
                    login = EXCLUDED.login,
                    avatar_url = EXCLUDED.avatar_url
                RETURNING id, github_id`,
                [
                    list.map((p) => p.id),
                    list.map((p) => p.login),
                    list.map((p) => p.avatarUrl)
                ]
            )
            : { rows: [] }; 
        
        // returning gave us internal IDs; now map GH id -> internal ID for the next upserts
        // both come back as strings(BIGINT), so we use strings as the map key type to avoid JS number precision issues
        const forkerIdGitHubId = new Map<string, string>();
        for (const row of forkerRows.rows) {
            forkerIdGitHubId.set(row.github_id, row.id);
        }
        const internalId = (user: GitHubUser) => forkerIdGitHubId.get(String(user.id))!;

        if (forks.items.length) {
            await client.query(
                `INSERT INTO forks (github_id, repository_id, forker_id)
                SELECT f.github_id, $1::bigint, f.forker_id
                FROM unnest($2::bigint[], $3::bigint[]) AS f(github_id, forker_id)
                ON CONFLICT (github_id) DO UPDATE SET
                    repository_id = EXCLUDED.repository_id,
                    forker_id = EXCLUDED.forker_id`,
                [repositoryId, forks.items.map((f) => f.id), forks.items.map((f) => internalId(f.owner))]
            );
        }

        if (prs.items.length) {
            // on conflict, refresh title/state/merged_at since a PR's life is: open -> merged
            await client.query(
                `INSERT INTO pull_requests
                    (github_id, repository_id, forker_id, number, title, state, merged_at, created_at)
                SELECT p.github_id, $1::bigint, p.forker_id, p.number, p.title, p.state, p.merged_at, p.created_at
                FROM unnest(
                    $2::bigint[], $3::bigint[], $4::int[], $5::text[], $6::text[], $7::timestamptz[], $8::timestamptz[]    
                ) AS p(github_id, forker_id, number, title, state, merged_at, created_at)
                ON CONFLICT (github_id) DO UPDATE SET
                    title = EXCLUDED.title,
                    state = EXCLUDED.state,
                    merged_at = EXCLUDED.merged_at`,
                [
                    repositoryId,
                    prs.items.map((p) => p.id),
                    prs.items.map((p) => internalId(p.author)),
                    prs.items.map((p) => p.number),
                    prs.items.map((p) => p.title),
                    prs.items.map((p) => p.state),
                    prs.items.map((p) => p.mergedAt),
                    prs.items.map((p) => p.createdAt)
                ]
            );
        }

        // forks that vanished on GH should vanish here as well
        if (forks.complete) {
            await client.query(
                `DELETE FROM forks
                WHERE repository_id = $1 AND github_id <> ALL($2::bigint[])`,
                [repositoryId, forks.items.map((f) => f.id)]
            );
        }

        await client.query("COMMIT");
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        // always hand connection back to the pool, even if we rolled back or threw an error
        client.release();
    }

    return {
        repository: `${repoInfo.owner}/${repoInfo.name}`,
        forks: forks.items.length,
        forkers: people.size,
        pullRequests: prs.items.length,
        mergedPullRequests: prs.items.filter((p) => p.state === "merged").length,
        complete: forks.complete && prs.complete
    };
}