import { Router } from "express";
import { authRouter } from "@/modules/auth/auth.router";
import { tenantsRouter } from "@/modules/tenants/tenants.router";
import { usersRouter } from "@/modules/users/users.router";
import { subscriptionsRouter } from "@/modules/subscriptions/subscriptions.router";
import { plansRouter } from "@/modules/subscriptions/plans.router";
import { propertiesRouter } from "@/modules/properties/properties.router";
import { publicRouter } from "@/modules/public/public.router";
import { publicSitesRouter, sitesRouter } from "@/modules/sites/sites.router";
import {
  inquiriesRouter,
  publicInquiriesRouter,
} from "@/modules/inquiries/inquiries.router";

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
// "Mi Sitio Web" de la inmobiliaria autenticada.
apiRouter.use("/site", sitesRouter);
// Catálogo abierto: sin login y cruzando inmobiliarias.
apiRouter.use("/public", publicRouter);
// Web pública de cada inmobiliaria: /api/public/sites/:slug
apiRouter.use("/public/sites", publicSitesRouter);
// Bandeja de consultas de la inmobiliaria.
apiRouter.use("/inquiries", inquiriesRouter);
// Alta de consulta desde la ficha pública, sin login.
apiRouter.use("/public/properties/:propertyId/inquiries", publicInquiriesRouter);
