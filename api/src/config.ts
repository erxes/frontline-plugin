import { z } from 'zod';

/** The plugin's name in core: tables, permissions, events and the UI remote all start with it. */
export const PLUGIN = 'frontline';

/** Every setting the API reads. Nothing else touches `process.env`. */
const Env = z.object({
  PORT: z.coerce.number().int().positive().default(3399),
  /** Postgres as the plugin's own role (`pnpm db:plugin-role frontline` in core). */
  DATA_URL: z.url(),
  /** Core's address, without `/core/v1`. */
  CORE_URL: z.url(),
  /** This plugin's secret from core's `CORE_PLUGIN_KEYS`. */
  PLUGIN_SECRET: z.string().min(32),
  /** Where core and browsers reach this API. */
  PUBLIC_URL: z.url().default('http://localhost:3399'),
  /** The UI remote's entry; the built UI is served at `/ui` unless this points elsewhere. */
  UI_ENTRY_URL: z.url().optional(),
  /** The built UI to serve at `/ui` (the image sets it). */
  UI_DIR: z.string().optional(),
  /** The built embeds websites load, served at `/widget` (the image sets it). */
  WIDGET_DIR: z.string().optional(),
  /** web's origin, which calls this API from the browser. Defaults to CORE_URL's origin. */
  CORE_UI_URL: z.url().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  VERSION: z.string().default('0.1.0'),
  /** Traces go to this OTLP collector; the SDK reads the other OTEL_* variables itself. */
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
  /** Help centers on members' own domains: Cloudflare for SaaS, off unless both are set. */
  CLOUDFLARE_CUSTOMHOST_API_TOKEN: z.string().min(1).optional(),
  CLOUDFLARE_ZONE_ID: z.string().min(1).optional(),
  /** A member's domain CNAMEs to `<help center key>.<suffix>`. */
  HELPCENTER_DOMAIN_SUFFIX: z.string().min(1).default('helpcenter.erxes.io'),
  /**
   * Encrypts page tokens, bot tokens and mail passwords at rest: 32 random bytes in base64
   * (`openssl rand -base64 32`). Changing it makes every stored secret unreadable.
   */
  SECRETS_KEY: z.base64().refine((key) => Buffer.from(key, 'base64').length === 32, {
    message: 'SECRETS_KEY must be 32 bytes in base64',
  }),
  /** The Meta app that Facebook pages and Instagram accounts connect through. */
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  /** What Meta's webhook subscription sends back as `hub.verify_token`. */
  META_VERIFY_TOKEN: z.string().optional(),
});

const env = Env.parse(process.env);

export const config = {
  port: env.PORT,
  dataUrl: env.DATA_URL,
  coreUrl: env.CORE_URL,
  pluginSecret: env.PLUGIN_SECRET,
  publicUrl: env.PUBLIC_URL.replace(/\/+$/, ''),
  uiEntryUrl: env.UI_ENTRY_URL ?? `${env.PUBLIC_URL.replace(/\/+$/, '')}/ui/remoteEntry.js`,
  uiDir: env.UI_DIR,
  widgetDir: env.WIDGET_DIR,
  coreUiOrigin: new URL(env.CORE_UI_URL ?? env.CORE_URL).origin,
  logLevel: env.LOG_LEVEL,
  version: env.VERSION,
  tracing: Boolean(env.OTEL_EXPORTER_OTLP_ENDPOINT),
  cloudflare:
    env.CLOUDFLARE_CUSTOMHOST_API_TOKEN && env.CLOUDFLARE_ZONE_ID
      ? { apiToken: env.CLOUDFLARE_CUSTOMHOST_API_TOKEN, zoneId: env.CLOUDFLARE_ZONE_ID }
      : null,
  helpCenterDomainSuffix: env.HELPCENTER_DOMAIN_SUFFIX,
  secretsKey: Buffer.from(env.SECRETS_KEY, 'base64'),
  meta: {
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    verifyToken: env.META_VERIFY_TOKEN,
  },
};
