# Packages what `pnpm image` built on the host: the bundled API with
# its production node_modules (.runtime), the UI remote, served at /ui, and
# the embeds websites load, served at /widget.
FROM node:26-bookworm-slim
# The runtime only runs node; npm and corepack bring their own dependencies (and advisories).
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
ARG VERSION=0.1.0
WORKDIR /app
COPY --chown=node:node .runtime/ ./
COPY --chown=node:node ui/dist/ ./ui/
COPY --chown=node:node widget/dist/ ./widget/
ENV NODE_ENV=production PORT=3399 UI_DIR=/app/ui WIDGET_DIR=/app/widget VERSION=$VERSION
USER node
EXPOSE 3399
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "--import", "./dist/telemetry.mjs", "dist/main.mjs"]
