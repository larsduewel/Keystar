# syntax=docker/dockerfile:1.7
# Keystar production image: one image, three roles (web, worker, migrate).

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Builds the Next.js standalone server and bundles worker/migrate/demo-seed/support into dist/.
RUN pnpm build

FROM node:22-alpine AS runner
# Links the published image (ghcr.io/theragus/keystar) to the repository, so the
# package inherits its permissions. The release workflow adds version labels.
LABEL org.opencontainers.image.source="https://github.com/theragus/keystar" \
      org.opencontainers.image.title="Keystar" \
      org.opencontainers.image.description="Self-hosted EVE Online corporation dashboard" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Build metadata for System Info and the support package (src/core/version.ts); the
# release and main-image workflows set them. Declared late so they don't bust the build cache.
ARG KEYSTAR_COMMIT="" KEYSTAR_IMAGE_TAG="" KEYSTAR_BUILD_DATE=""
ENV KEYSTAR_COMMIT=$KEYSTAR_COMMIT KEYSTAR_IMAGE_TAG=$KEYSTAR_IMAGE_TAG KEYSTAR_BUILD_DATE=$KEYSTAR_BUILD_DATE
RUN addgroup -S keystar && adduser -S keystar -G keystar
COPY --from=build --chown=keystar:keystar /app/.next/standalone ./
COPY --from=build --chown=keystar:keystar /app/.next/static ./.next/static
COPY --from=build --chown=keystar:keystar /app/public ./public
COPY --from=build --chown=keystar:keystar /app/dist ./dist
COPY --from=build --chown=keystar:keystar /app/drizzle ./drizzle
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/keystar
USER keystar
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD [ "$KEYSTAR_ROLE" = "worker" ] || wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
ENTRYPOINT ["keystar"]
CMD ["web"]
