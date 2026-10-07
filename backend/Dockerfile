# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# build — compila TypeScript y genera el client de Prisma
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Prisma trae binarios propios (schema engine y query engine) que linkean
# contra libssl. La imagen alpine de node NO la incluye, y sin ella Prisma no
# logra detectar la version de OpenSSL, cae al binario de openssl-1.1.x y
# revienta con "Could not parse schema engine response". Verificado en el VPS.
RUN apk add --no-cache openssl

# Las dependencias van antes que el código: cambian mucho menos, así Docker
# reutiliza la capa entre builds y no reinstala todo por tocar un archivo.
COPY package.json package-lock.json ./
RUN npm ci

# El client de Prisma se genera contra el schema, no contra la base: no hace
# falta que Postgres esté levantado para buildear.
COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
# Los scripts sueltos (siembra de demo, normalización de localidades) viajan
# solo a esta etapa: se corren a mano con `docker compose run migrate npx tsx
# scripts/<x>.ts` y necesitan tsx, que es devDependency y no está en runtime.
COPY scripts ./scripts
RUN npm run build

# Esta etapa también es la que corre las migraciones en el compose de
# producción (servicio `migrate`): es la única que tiene el CLI de Prisma.

# ─────────────────────────────────────────────────────────────
# runtime — solo lo necesario para servir
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Prisma trae binarios propios (schema engine y query engine) que linkean
# contra libssl. La imagen alpine de node NO la incluye, y sin ella Prisma no
# logra detectar la version de OpenSSL, cae al binario de openssl-1.1.x y
# revienta con "Could not parse schema engine response". Verificado en el VPS.
RUN apk add --no-cache openssl

# Sin devDependencies: TypeScript, jest y supertest no tienen nada que hacer en
# producción, y cada paquete de más es superficie de ataque.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# El client generado vive dentro de node_modules y `npm ci --omit=dev` no lo
# regenera, porque el CLI que lo genera es una devDependency. Se copia del build.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client

COPY --from=build /app/dist ./dist
# El schema viaja para poder correr `prisma migrate deploy` desde este contenedor
# en una emergencia, aunque el camino normal sea el servicio `migrate`.
COPY --from=build /app/prisma ./prisma

# La imagen de node ya trae el usuario `node`. Escuchar en 3000 no necesita
# root, y un proceso comprometido corriendo como root es un VPS comprometido.
USER node

EXPOSE 3000

# Comprueba el proceso, no la base: si Postgres se cae, reiniciar el backend no
# arregla nada y el reinicio en loop solo agrega ruido.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
