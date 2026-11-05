import type pg from "pg";

// anything that can run a query: a pool or a single client inside a transaction
export type Queryable = Pick<pg.Pool, "query">;

export interface RepoRecord {
    id: number;  // GH's id for the repo
    owner: string;
    name: string;
    forksCount?: number | null;
}

export interface UserRecord {
    id: number;
    login: string;
    avatarUrl?: string | null;
}

// insert or update a repo and return the internal id for it
// decided to store it here instead of copy pasting it into the REST sync and webhandlers
export async function upsertRepository(db: Queryable, repo: RepoRecord): Promise<string> {
    // handles a repo deleted or name being reused, ON DELETE CASCADE removes its children
    await db.query(
    `DELETE FROM repositories
        WHERE lower(owner) = lower($1) AND lower(name) = lower($2) AND github_id <> $3`,
    [repo.owner, repo.name, repo.id]
    );

    // COALESCE keeps the old forks_count when the caller doesn't know a new one,
    // so an event that omits the number can't blank out a good value.
    const result = await db.query<{ id: string }>(
    `INSERT INTO repositories (github_id, owner, name, forks_count)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (github_id) DO UPDATE SET
        owner = EXCLUDED.owner,
        name = EXCLUDED.name,
        forks_count = COALESCE(EXCLUDED.forks_count, repositories.forks_count),
        updated_at = now()
        RETURNING id`,
    [repo.id, repo.owner, repo.name, repo.forksCount ?? null]
    );
    return result.rows[0].id;
}

// insert or update one person and return our internal id for them.
export async function upsertForker(db: Queryable, user: UserRecord): Promise<string> {
  const result = await db.query<{ id: string }>(
    `INSERT INTO forkers (github_id, login, avatar_url)
     VALUES ($1, $2, $3)
     ON CONFLICT (github_id) DO UPDATE SET
       login = EXCLUDED.login,
       avatar_url = COALESCE(EXCLUDED.avatar_url, forkers.avatar_url)
     RETURNING id`,
    [user.id, user.login, user.avatarUrl ?? null]
  );
  return result.rows[0].id;
}