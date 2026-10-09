# Two stages: node_modules and the build never reach the running image, which
# matters on the small VPS this is priced for — the final image is ~200 MB.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_* are inlined into the browser bundle at BUILD time, not read at
# run time, so they have to be arguments here. API_BASE is deliberately empty by
# default: the browser then calls /v1/... on whatever host served the page, the
# reverse proxy routes that to Django, and there is no CORS and no second
# certificate to keep alive.
ARG NEXT_PUBLIC_API_BASE=""
ARG NEXT_PUBLIC_SITE_ORIGIN=""
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE
ENV NEXT_PUBLIC_SITE_ORIGIN=$NEXT_PUBLIC_SITE_ORIGIN
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000

# Not root. A Next server that is compromised should not own its own filesystem.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
