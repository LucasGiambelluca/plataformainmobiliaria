import rateLimit from "express-rate-limit";
import { isTest } from "@/config/env";

// En tests deshabilitamos el límite para no interferir.
const skip = () => isTest;

const json = (message: string) => ({
  error: { code: "RATE_LIMITED", message },
});

// Login / acciones sensibles de auth.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip,
  message: json("Demasiados intentos. Probá de nuevo en unos minutos."),
});

// Registro de inmobiliarias (self-serve).
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip,
  message: json("Demasiados registros desde esta IP."),
});

// Verificación de dominios: cada intento dispara consultas DNS salientes, así
// que se limita aunque el endpoint pida login.
export const dnsCheckLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip,
  message: json("Demasiadas verificaciones seguidas. Esperá unos minutos."),
});

// Endpoints públicos (catálogo, consultas).
export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip,
  message: json("Demasiadas solicitudes."),
});
