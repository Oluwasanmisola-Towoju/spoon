import Fastify, { type FastifyInstance } from 'fastify';
import { env } from "./config/env.js";
import healthRoutes from './routes/health.js';
import { request } from 'node:http';

export async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({
        logger:
            env.NODE_ENV === "development"
                ? { level: env.LOG_LEVEL, transport: { target: "pino-pretty" } }
                : { level: env.LOG_LEVEL }
    });

    // one central error handler so every failure returns the same JSON shape
    app.setErrorHandler((error, request, reply) => {
        // log full error to me, only return a safe message to the client
        request.log.error(error);

        const statusCode =
            typeof error === "object" &&
                error !== null &&
                "statusCode" in error &&
                typeof error.statusCode === "number"
                ? error.statusCode
                : 500;
        reply.status(statusCode).send({
            error: statusCode >= 500
                ? "Internal Server Error"
                : error instanceof Error
                    ? error.message
                    : "Request failed"
        });
    });

    app.setNotFoundHandler((request, reply) => {
        reply.status(404).send({ error: `Route ${request.method} ${request.url} not found` });
    });

    // register routes for attaching plugins
    await app.register(healthRoutes);

    return app;
}