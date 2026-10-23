import type pg from "pg";

export async function seed(pool: pg.Pool): Promise<void> {
    const repo = await pool.query<{ id: string }>(
        `INSERT INTO repositories (github_id, owner, name)
        VALUES (1000, 'octocat', 'hello-world')
        ON CONFLICT (github_id) DO UPDATE SET updated_at = now()
        RETURNING id `
    );
    const repoId = repo.rows[0].id;

    const people: Array<[number, string, number]> = [
        [1, "Oluwasanmisola-Towoju", 14],
        [2, "tunde-dev", 9],
        [3, "chioma", 7],
        [4, "kofi-builds", 4],
        [5, "zainab", 1],
        [6, "just-forked", 0],
    ];

    let prGithubId = 5000;
    for (const [id, login, merged] of people) {
        const forker = await pool.query<{ id: string }>(
            `INSERT INTO forkers (github_id, login) VALUES ($1, $2)
            ON CONFLICT (github_id) DO UPDATE SET login = EXCLUDED.login
            RETURNING id`,
            [id, login]
        );
        const forkerId = forker.rows[0].id;

        await pool.query(
            `INSERT INTO forks (github_id, repository_id, forker_id) VALUES ($1, $2, $3)
            ON CONFLICT (github_id) DO NOTHING`,
            [2000 + id, repoId, forkerId]
        );

        for (let n = 1; n <= merged; n++) {
            prGithubId++;
            await pool.query(
                `INSERT INTO pull_requests
                    (github_id, repository_id, forker_id, number, title, state, merged_at)
                VALUES ($1, $2, $3, $4, $5, 'merged', now())
                ON CONFLICT (github_id) DO NOTHING`,
                [prGithubId, repoId, forkerId, prGithubId, `Improvement #${n} by ${login}`]
            );
        }
    }
}