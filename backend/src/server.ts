import { app } from "@/app";
import { env } from "@/config/env";
import { logger } from "@/config/logger";
import { connectDatabase, disconnectDatabase } from "@/config/database";

async function bootstrap(): Promise<void> {
  await connectDatabase();
  logger.info("Conexión a PostgreSQL establecida");

  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 Backend escuchando en http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} recibido, cerrando...`);
    server.close();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

bootstrap().catch((err) => {
  logger.error({ err }, "Fallo al iniciar el servidor");
  process.exit(1);
});
