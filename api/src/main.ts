import { config } from '#/config.ts';
import { core } from '#/core.ts';
import { pool } from '#/db/client.ts';
import { manifest } from '#/manifest.ts';
import { runMigrations } from '#/db/migrate.ts';
import { logger } from '#/logger.ts';
import { stopDiscordGateways } from '#/modules/integrations/providers/discordGateway.ts';
import { flushViews } from '#/modules/views.ts';
import { createApp } from '#/server.ts';

const applied = await runMigrations();

if (applied.length) logger.info({ applied }, 'applied migrations');

// Core installs it automatically in development and self-hosted (PLUGINS_AUTO_INSTALL).
await core.registerManifest(manifest);

const server = createApp().listen(config.port, () => {
  logger.info(`API on ${config.publicUrl}, UI entry ${manifest.ui.entry}`);
});

// Public articles and forms count their views in memory; they're written every 10 s.
const views = setInterval(() => void flushViews(), 10_000);

/**
 * Writes the views counted since the last flush and closes the Discord gateways, then lets go of
 * the database.
 */
const finish = async () => {
  await Promise.all([flushViews(), stopDiscordGateways()]);
  await pool.end();
};

const stop = () => {
  clearInterval(views);
  server.close(() => void finish());
};

process.once('SIGTERM', stop);

process.once('SIGINT', stop);
