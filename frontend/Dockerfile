# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# build — bundle de Vite
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite congela las variables dentro del bundle: esto NO se puede cambiar
# después sin volver a buildear la imagen.
#
# El default es "/api" a propósito: Caddy sirve la API en el mismo host que
# cada web, así no hay CORS y la cookie httpOnly del refresh (sameSite lax)
# viaja también desde el dominio propio de una inmobiliaria. Apuntarlo a otro
# host rompe la sesión en los dominios custom.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

# Con qué host la SPA está sirviendo el portal. Todo lo que no sea este dominio
# (ni su www, ni un subdominio reservado) se trata como la web de una
# inmobiliaria y la raíz muestra su sitio en vez de la home del portal.
#
# Sin valor, todo host es el portal: es lo correcto en desarrollo, donde se
# entra por localhost, pero en producción hay que pasarlo o los dominios propios
# muestran el portal.
ARG VITE_PLATFORM_DOMAIN=
ENV VITE_PLATFORM_DOMAIN=$VITE_PLATFORM_DOMAIN

# `npm run build` es `tsc -b && vite build`: si el typecheck falla, no hay
# imagen. Es lo que se quiere — mejor romper acá que en producción.
RUN npm run build

# ─────────────────────────────────────────────────────────────
# runtime — estáticos servidos por Caddy
# ─────────────────────────────────────────────────────────────
# Caddy y no nginx por la misma razón que en el borde: una sola herramienta de
# proxy en todo el stack. Acá no termina TLS, solo sirve archivos.
FROM caddy:2-alpine AS runtime

COPY --from=build /app/dist /srv
COPY Caddyfile.static /etc/caddy/Caddyfile

EXPOSE 80
