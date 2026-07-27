import { Router } from "express";
import { authRouter } from "@/modules/auth/auth.router";
import { tenantsRouter } from "@/modules/tenants/tenants.router";
import { usersRouter } from "@/modules/users/users.router";
import { subscriptionsRouter } from "@/modules/subscriptions/subscriptions.router";
import { plansRouter } from "@/modules/subscriptions/plans.router";
import { propertiesRouter } from "@/modules/properties/properties.router";

// Router raíz de la API. Cada módulo monta su sub-router acá.
export const apiRouter = Router();

apiRouter.get("/", (_req, res) => {
  res.json({ api: "inmobiliaria", version: "0.1.0" });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/admin/tenants", tenantsRouter);
apiRouter.use("/users", usersRouter);
apiRouter.use("/subscription", subscriptionsRouter);
apiRouter.use("/admin/plans", plansRouter);
// Multimedia va anidada: /api/properties/:propertyId/media
apiRouter.use("/properties", propertiesRouter);
