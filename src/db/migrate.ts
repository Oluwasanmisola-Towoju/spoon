import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// applies each .sql file in order exactly once and remembers which ones ran in a table.
export async function migrate(pool: pg.Pool): Promise<string[]> {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name    TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `);

    const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
    // since filenames start with 001, 002 sorting them gives the right order
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

    const { rows } = await pool.query<{ name: string }>("SELECT name FROM schema_migrations");
    const done = new Set(rows.map((r) => r.name));
    const applied: string[] = [];

    for (const file of files) {
        if (done.has(file)) continue;

        // runs each migration inside a transaction so its either the whole file applies or nothing changes
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            await client.query(readFileSync(join(dir, file), "utf-8"));
            await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
            await client.query("COMMIT");
            applied.push(file);
        }
        catch (err) {
            await client.query("ROLLBACK");
            throw err;
        }
        finally {
            client.release();
        }
    }
    return applied;
}