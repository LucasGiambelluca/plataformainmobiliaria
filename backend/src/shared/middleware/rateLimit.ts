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

// Renovación de sesión. Va aparte del login a propósito.
//
// El access token dura 15 minutos y vive solo en memoria, así que cada recarga
// de página dispara un refresh. Compartiendo el cupo del login (10 cada 15
// min) alcanzaba con recargar diez veces para comerse un 429: el frontend lo
// leía como sesión muerta y echaba al usuario al login. En una oficina era
// peor, porque varios empleados detrás de la misma IP se tumbaban entre sí.
//
// El cupo sigue existiendo para cortar un bucle de refresh, no para frenar
// fuerza bruta: el refresh token es un JWT firmado, adivinarlo no es viable.
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip,
  message: json("Demasiadas renovaciones de sesión seguidas."),
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

// Suplantación de inmobiliaria: es una acción de soporte, no de volumen. El
// cupo existe para que un token de super admin robado no barra la plataforma
// entera abriendo el panel de cada inmobiliaria una atrás de la otra.
export const impersonateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip,
  message: json("Demasiadas sesiones de soporte seguidas."),
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
