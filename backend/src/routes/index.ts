import { Router } from "express";
import { authRouter } from "@/modules/auth/auth.router";
import { tenantsRouter } from "@/modules/tenants/tenants.router";

// Router raíz de la API. Cada módulo monta su sub-router acá.
export const apiRouter = Router();

apiRouter.get("/", (_req, res) => {
  res.json({ api: "inmobiliaria", version: "0.1.0" });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/admin/tenants", tenantsRouter);

// Módulos (se irán montando a medida que se construyen en la Fase 1):
// apiRouter.use("/subscription", subscriptionRouter);
