import { en } from "zod/locales";
import { buildApp } from "./app.js";
import { env }  from "./config/env.js";

async function main() {
    const app = await buildApp();
    
    // graceful shutdown when processes stop
    const shutdown = async (signal: string) => {
        app.log.info(`${signal} received, shutting down`);
        await app.close();
        process.exit(0);
    };
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    try {
        await app.listen({ port: env.PORT, host: env.HOST });
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
}

main();