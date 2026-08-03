import { Router } from "express";
import { env } from "@/config/env";
import { logger } from "@/config/logger";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { CaddyAskService } from "./caddy.service";
import { certificateAuthorizationRepository } from "./caddy.repository";

/**
 * Endpoint interno que consulta Caddy antes de emitir un certificado
 * (directiva `on_demand_tls.ask`, ver deploy/Caddyfile).
 *
 * Contrato de Caddy: 200 autoriza, cualquier otra cosa rechaza. El cuerpo no
 * se mira, así que va vacío — un mensaje solo le confirmaría a quien sondee
 * qué dominios existen en la plataforma.
 *
 * Caddy no puede mandar headers propios en esta consulta, por eso el token
 * viaja en la query. Es un secreto de 32 bytes y el endpoint solo se alcanza
 * desde la red interna del compose.
 */
export function createCaddyRouter(service: CaddyAskService): Router {
  const router = Router();

  router.get(
    "/ask",
    asyncHandler(async (req, res) => {
      const { token, domain } = req.query as Record<string, unknown>;

      if (!service.tokenIsValid(token)) {
        logger.warn(
          { host: typeof domain === "string" ? domain : null },
          "Consulta de certificado con token inválido",
        );
        res.status(403).end();
        return;
      }

      const host = typeof domain === "string" ? domain : "";
      const autorizado = await service.allowsCertificateFor(host);

      if (!autorizado) {
        // Se loguea para poder diagnosticar por qué un dominio propio no
        // levanta HTTPS: es la primera pregunta cuando falla el handshake.
        logger.info({ host }, "Certificado denegado: el host no es de ninguna inmobiliaria");
      }

      res.status(autorizado ? 200 : 403).end();
    }),
  );

  return router;
}

const service = new CaddyAskService(certificateAuthorizationRepository, {
  platformDomain: env.PLATFORM_DOMAIN,
  askToken: env.CADDY_ASK_TOKEN,
});

export const caddyRouter = createCaddyRouter(service);
