import Fastify, { FastifyError, type FastifyInstance } from 'fastify';
import { env } from "./config/env.js";
import dbPlugin from "./plugins/db.js"
import widgetRoutes from './routes/widget.js';
import healthRoutes from './routes/health.js';


export async function buildApp(): Promise<FastifyInstance> {
    const app = Fastify({
        logger:
            env.NODE_ENV === "development"
                ? { level: env.LOG_LEVEL, transport: { target: "pino-pretty" } }
                : { level: env.LOG_LEVEL }
    });

    // one central error handler so every failure returns the same JSON shape
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error(error);
    const statusCode = error.statusCode ?? 500;
    reply.status(statusCode).send({
      error: statusCode >= 500 ? "Internal Server Error" : error.message,
    });
  });

    app.setNotFoundHandler((request, reply) => {
        reply.status(404).send({ error: `Route ${request.method} ${request.url} not found` });
    });

    // register routes for attaching plugins
    await app.register(dbPlugin);
    await app.register(healthRoutes);
    await app.register(widgetRoutes);

    return app;
}