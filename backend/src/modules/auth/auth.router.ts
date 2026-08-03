import { Router, type Response } from "express";
import { isProd } from "@/config/env";
import { authenticate } from "@/shared/middleware/authenticate";
import {
  authLimiter,
  refreshLimiter,
  registerLimiter,
} from "@/shared/middleware/rateLimit";
import { validate } from "@/shared/middleware/validate";
import { asyncHandler } from "@/shared/utils/asyncHandler";
import { UnauthorizedError } from "@/shared/errors";
import { TenantsService } from "@/modules/tenants/tenants.service";
import { tenantsRepository } from "@/modules/tenants/tenants.repository";
import {
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from "./auth.schemas";
import { notifier, panelUrls } from "@/modules/notifications";
import { AuthService, type AuthTokens } from "./auth.service";
import { authRepository } from "./auth.repository";

export const REFRESH_COOKIE = "refresh_token";

// La cookie solo viaja a los endpoints de auth: menor superficie de CSRF.
const COOKIE_PATH = "/api/auth";

function setRefreshCookie(res: Response, tokens: AuthTokens): void {
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: COOKIE_PATH,
    expires: tokens.refreshExpiresAt,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
}

export function createAuthRouter(
  service: AuthService,
  tenantsService: TenantsService,
): Router {
  const router = Router();

  // Alta self-serve de inmobiliaria + admin, con auto-login (§9.1).
  router.post(
    "/register",
    registerLimiter,
    validate(registerSchema),
    asyncHandler(async (req, res) => {
      const body = req.body as RegisterInput;
      const { tenant } = await tenantsService.provision({
        tenantName: body.tenantName,
        slug: body.slug,
        adminEmail: body.email,
        adminPassword: body.password,
        adminName: body.name,
      });
      const { user, accessToken, ...tokens } = await service.login(
        body.email,
        body.password,
      );
      setRefreshCookie(res, { accessToken, ...tokens });

      // La bienvenida no puede hacer fallar el alta: el servicio de
      // notificaciones se traga sus propios errores.
      await notifier.inmobiliariaCreada(body.email, {
        agencyName: tenant.name,
        slug: tenant.slug,
        panelUrl: panelUrls.panel,
      });

      res.status(201).json({ tenant, user, accessToken });
    }),
  );

  router.post(
    "/login",
    authLimiter,
    validate(loginSchema),
    asyncHandler(async (req, res) => {
      const { email, password } = req.body as LoginInput;
      const { user, accessToken, ...tokens } = await service.login(email, password);
      setRefreshCookie(res, { accessToken, ...tokens });
      // El refresh token nunca va en el body: solo cookie httpOnly.
      res.json({ user, accessToken });
    }),
  );

  router.post(
    "/refresh",
    refreshLimiter,
    asyncHandler(async (req, res) => {
      const current = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
      if (!current) throw new UnauthorizedError("Falta el refresh token");
      try {
        const { user, accessToken, ...tokens } = await service.refresh(current);
        setRefreshCookie(res, { accessToken, ...tokens });
        res.json({ user, accessToken });
      } catch (err) {
        // Token inválido/revocado: se borra la cookie para cortar reintentos.
        clearRefreshCookie(res);
        throw err;
      }
    }),
  );

  router.post(
    "/logout",
    asyncHandler(async (req, res) => {
      const current = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE];
      if (current) await service.logout(current);
      clearRefreshCookie(res);
      res.status(204).end();
    }),
  );

  // Identidad del access token vigente (el frontend la usa al rehidratar).
  router.get("/me", authenticate, (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}

// Router con el wiring por defecto (repositorio Prisma).
export const authRouter = createAuthRouter(
  new AuthService(authRepository),
  new TenantsService(tenantsRepository),
);
