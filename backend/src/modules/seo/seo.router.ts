import { Router, type Request } from "express";
import { env } from "@/config/env";
import { publicLimiter } from "@/shared/middleware/rateLimit";
import {
  createResolveTenant,
  type TenantResolverRepository,
} from "@/shared/middleware/resolveTenant";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { PublicService } from "@/modules/public/public.service";
import { publicRepository } from "@/modules/public/public.repository";
import { tenantResolverRepository } from "@/modules/sites/sites.repository";

/**
 * sitemap.xml y robots.txt (tarea 4.9).
 *
 * Van colgados de la raíz y no de /api porque robots.txt solo se lee en la raíz
 * del host: un crawler nunca pide /api/robots.txt. Caddy los redirige al
 * backend antes de caer en los estáticos (ver deploy/Caddyfile).
 *
 * El contenido depende del host, igual que la web: en el portal se listan todas
 * las inmobiliarias y todas las propiedades visibles; en el dominio propio de
 * una inmobiliaria, solo las suyas. Publicar el catálogo entero bajo el dominio
 * de un cliente sería contenido duplicado, y encima ajeno.
 */

/** Páginas fijas del portal. La home va aparte porque también existe en el sitio de cada tenant. */
const RUTAS_DEL_PORTAL = [
  "/buscar",
  "/inmobiliarias",
  "/publicar",
  "/calculadoras",
  "/tasaciones",
];

/**
 * Escapa lo que va dentro de una etiqueta XML. Hoy las URLs se arman con uuids
 * y slugs, pero el host lo elige quien hace el pedido: sin escapar, un Host
 * raro rompe el documento entero.
 */
function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Origen público del pedido. Detrás de Caddy `req.protocol` lee
 * x-forwarded-proto (app.ts confía en el primer proxy); sin host, cae a
 * FRONTEND_URL, que es lo que se usa en desarrollo.
 *
 * Del APP_BASE_PATH se cuelga porque estas URL se leen fuera de la aplicación:
 * en la raíz del host son la dirección de la página, y bajo un subpath
 * ("/m2prop") el prefijo es parte de la URL. Sin él, el sitemap declararía como
 * canónicas rutas que en el host no existen.
 */
function baseUrl(req: Request): string {
  const prefijo = env.APP_BASE_PATH;
  const host = req.get("host");
  if (!host) return env.FRONTEND_URL.replace(/\/$/, "") + prefijo;
  return `${req.protocol}://${host}${prefijo}`;
}

export function createSeoRouter(
  service: PublicService,
  resolverRepo: TenantResolverRepository,
): Router {
  const router = Router();

  router.use(publicLimiter);

  // `required: false`: el portal no resuelve ningún tenant y tiene que seguir
  // respondiendo, no dar 404.
  const resolverOpcional = createResolveTenant(resolverRepo, { required: false });

  router.get(
    "/sitemap.xml",
    resolverOpcional,
    asyncHandler(async (req, res) => {
      const tenant = req.resolvedTenant;
      const base = baseUrl(req);
      const { properties, agencies } = await service.sitemap(tenant?.id);

      const fijas = tenant ? ["/"] : ["/", ...RUTAS_DEL_PORTAL];
      const urls = [
        ...fijas.map((path) => ({ path, updatedAt: null })),
        ...agencies,
        ...properties,
      ];

      const cuerpo = urls
        .map(({ path, updatedAt }) => {
          const lastmod = updatedAt
            ? `\n    <lastmod>${updatedAt.toISOString().slice(0, 10)}</lastmod>`
            : "";
          return `  <url>\n    <loc>${xml(base + path)}</loc>${lastmod}\n  </url>`;
        })
        .join("\n");

      res.type("application/xml");
      // Una hora: el catálogo cambia seguido, pero ningún crawler necesita la
      // versión del segundo anterior.
      res.set("Cache-Control", "public, max-age=3600");
      res.send(
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${cuerpo}\n</urlset>\n`,
      );
    }),
  );

  router.get("/robots.txt", (req, res) => {
    // Los paneles no se indexan: exigen login, así que el crawler solo
    // encontraría la pantalla de acceso. /api tampoco: son respuestas JSON.
    //
    // Las reglas se escriben relativas al prefijo, no a la raíz del host: un
    // `Disallow: /panel/` en un despliegue bajo /m2prop no bloquearía nada,
    // porque el panel está en /m2prop/panel. Y el `Allow` se limita al prefijo
    // para no autorizar a indexar el resto del dominio, que es de otro sitio.
    const p = env.APP_BASE_PATH;
    const lineas = [
      "User-agent: *",
      `Allow: ${p}/`,
      `Disallow: ${p}/panel/`,
      `Disallow: ${p}/admin/`,
      `Disallow: ${p}/login`,
      `Disallow: ${p}/registro`,
      `Disallow: ${p}/api/`,
      "",
      `Sitemap: ${baseUrl(req)}/sitemap.xml`,
      "",
    ];

    res.type("text/plain");
    res.set("Cache-Control", "public, max-age=86400");
    res.send(lineas.join("\n"));
  });

  return router;
}

// Router con el wiring por defecto (repositorio Prisma).
export const seoRouter = createSeoRouter(
  new PublicService(publicRepository),
  tenantResolverRepository,
);
