import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { env } from "@/config/env";
import { logger } from "@/config/logger";
import { errorHandler, notFoundHandler } from "@/shared/middleware/error";
import { apiRouter } from "@/routes";

export function createApp(): Express {
  const app = express();

  // Detrás de Caddy: confiar en el primer proxy para IP real y rate limit.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "inmobiliaria-backend", env: env.NODE_ENV });
  });

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
