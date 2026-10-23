import pg from "pg";
import { env } from "../src/config/env.js";
import { migrate } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";

// use pnpm db:migrate   or   pnpm db:seed
const command = process.argv[2];
const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

try {
    if (command === "migrate") {
        const applied = await migrate(pool);
        console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Already up to date");
  1 }
    else if (command === "seed") {
        await seed(pool);
        console.log("Seeded sample data");
    }
    else {
        console.error("Usage: tsx scripts/db.ts <migrate|seed>");
        process.exitCode = 1;
    }
}
finally {
    // always close the pool, or the script would hang waiting on open connections
    await pool.end();
}