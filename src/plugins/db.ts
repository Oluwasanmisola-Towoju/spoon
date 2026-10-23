import fp from "fastify-plugin"; // enables app.db to be shared with every route registered after it
import pg from "pg";
import { env } from "../config/env.js";

// tells TS that app.db exists
declare module "fastify" {
    interface FastifyInstance {
        db: pg.Pool;
    }   
}

// pool keeps a handful of connections and lends them out per query
export default fp(async (app) => {
    const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });

    // know if databasse is unreachable at a boot
    await pool.query("SELECT 1");

    // decorate attaches the pool to the app so any route can use app.db
    app.decorate("db", pool);

    // shutdown releases db connections cleanly
    app.addHook("onClose", async () => {
        await pool.end();
    });
});