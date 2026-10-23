import type pg from "pg";
import type { WidgetData } from "../types/widget.js";

const TOP_FORKER_LIMIT = 5;

// fetch everything widget needs for one repo
export async function getWidgetData(
    db: pg.Pool,
    owner: string,
    repo: string
): Promise<WidgetData | null> {
    // find the repo, using lower() matches index from migration, lookups become case-insensitive and fast
    const repoResult = await db.query<{ id: string; owner: string; name: string }>(
        `SELECT id, owner, name FROM repositories
        WHERE lower(owner) = lower($1) AND lower(name) = lower($2)`,
        [owner, repo]
    );
    const found = repoResult.rows[0];
    if (!found) return null;

    const [forkCount, mergedCount, top] = await Promise.all([
        db.query<{ n: string }>(`SELECT count(*) AS n FROM forks WHERE repository_id = $1`, [found.id]),
        db.query<{ n: string }>(
            `SELECT count(*) AS n FROM pull_requests WHERE repository_id = $1 AND state = 'merged'`,
            [found.id]
        ),
        db.query<{ login: string; merged: string }>(
            `SELECT fk.login, count(pr.id) AS merged
            FROM forks f
            JOIN forkers fk ON fk.id = f.forker_id
            LEFT JOIN pull_requests pr
                ON pr.forker_id = fk.id AND pr.repository_id = f.repository_id AND pr.state = 'merged'
            WHERE f.repository_id = $1
            GROUP BY fk.id, fk.login
            ORDER BY merged DESC, fk.login ASC
            LIMIT ${TOP_FORKER_LIMIT}`,
            [found.id]
        ),
    ]);

    return {
        owner: found.owner,
        repo: found.name,
        forkCount: Number(forkCount.rows[0].n),
        mergedPrTotal: Number(mergedCount.rows[0].n),
        topForkers: top.rows.map((r) => ({ login: r.login, mergedPrCount: Number(r.merged) }))
    };
}