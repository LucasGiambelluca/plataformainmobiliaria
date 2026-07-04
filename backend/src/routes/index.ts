import { Router } from "express";

// Router raíz de la API. Cada módulo monta su sub-router acá.
export const apiRouter = Router();

apiRouter.get("/", (_req, res) => {
  res.json({ api: "inmobiliaria", version: "0.1.0" });
});

// Módulos (se irán montando a medida que se construyen en la Fase 1):
// apiRouter.use("/auth", authRouter);
// apiRouter.use("/admin/tenants", tenantsRouter);
// apiRouter.use("/subscription", subscriptionRouter);
