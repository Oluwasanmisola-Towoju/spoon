import { readFileSync } from 'node:fs';
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

// read the .env file and hand the values to the tests
function loadDotEnv(): Record<string, string> {
    try {
        return parseEnv(readFileSync(".env", "utf-8")) as Record<string, string>;
    }
    catch (error) {
        console.error("Error parsing .env file:", error);
        return {};
    }
}

export default defineConfig({
    test: {
        env: { ...loadDotEnv(), LOG_LEVEL: "silent" }, // silence keeps test output readable
        fileParallelism: false // disable parallelism to avoid DB conflicts
    }
}); 