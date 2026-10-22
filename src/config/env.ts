// better to read process.env once, validateit and export a typed object instead of reading process.env all over the codebase
import { z } from "zod";

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default("0.0.0.0"),
    LOG_LEVEL: z
        .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
        .default("info"),
        DATABASE_URL: z.string().url().default("postgres://spoon:spoon@localhost:5432/spoon"),
});

// used safeParse to return a result object instead of throwing, which lets us print a friendly error before exiting
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error("Invalid environment configuration");
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
}

export const env = parsed.data;