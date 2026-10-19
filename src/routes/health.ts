// load balancers and hosting platforms ping this route to know whether service is alive
import type { FastifyPluginAsync } from "fastify";

const healthRoutes: FastifyPluginAsync = async (app) => {
    app.get(
        "/health",
        {   // this schema documents the shape of the reply and strips any property not listed
            schema: {
                response: {
                    200: {
                        type: "object",
                        properties: {
                            status: { type: "string" },
                            uptimeSeconds: { type: "number" }
                        }
                    }
                }
            }
        },
        async () => ({
            status: "ok",
            uptimeSeconds: Math.round(process.uptime())
        })
    );
};

export default healthRoutes;