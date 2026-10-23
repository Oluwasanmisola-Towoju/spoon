import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getWidgetData } from "../services/widget-data.js";
import { renderWidget } from "../services/svg-renderer.js";

// follow GH repo and username patterns
const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]{1,100}$/;

const paramsSchema = z.object({
    owner: z.string().regex(OWNER_PATTERN),
    repo: z
        .string()
        .regex(REPO_PATTERN)
        .refine((r) => r !== "." && r !== "..")
});

// anything else is rejected
const querySchema = z.object({
    theme: z.enum(["dark", "light"]).default("dark")
});

const widgetRoutes: FastifyPluginAsync = async (app) => {
    // shape of request.params for this route
    app.get<{ Params: { owner: string; repo: string } }>(
        "/widget/:owner/:repo",
        async (request, reply) => {
            // strip optional .svg
            const rawRepo = request.params.repo.replace(/\.svg$/i, "");

            // validate params and queries once
            const params = paramsSchema.safeParse({ owner: request.params.owner, repo: rawRepo });
            const query = querySchema.safeParse(request.query);

            if (!params.success || !query.success) {
                return reply.status(400).send({ error: "Invalid owner, repo, or theme" });
            }

            // get data, then render
            const data = await getWidgetData(app.db, params.data.owner, params.data.repo);

            if (!data) {
                return reply.status(404).send({ error: "Repository not tracked by Spoon" });
            }

            const svg = renderWidget(data, query.data.theme);

            return reply
                .type("image/svg+xml; charset=utf-8") // makes GH & browsers treat it as an image
                .header("Cache-control", "public, max-age=300, s-maxage=1800") // caching to prevent from heavy Traffic
                .header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; font-src data:") // forbid scripts and external loads, embedds font as data
                .header("X-Content-Type-Options", "nosniff")  // stops browser from guessing a different type
                .send(svg);
        }
    );
};

export default widgetRoutes;