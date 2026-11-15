# Imagen del backend para Azure Container Apps.
# Las claves (DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY) NO van en la imagen:
# se cargan como secrets de la Container App. La imagen puede ser pública.

# ---------- Etapa 1: compilación ----------
FROM node:22-slim AS build
WORKDIR /app

# El motor de Prisma necesita OpenSSL.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

RUN npx prisma generate

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build \
  && npm prune --omit=dev

# ---------- Etapa 2: ejecución ----------
# Solo dist/ y node_modules: ni prisma/seed.ts ni scripts/ llegan a la imagen.
FROM node:22-slim
WORKDIR /app

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
