import { z } from 'zod';

/** The plugin's name in core: tables, permissions, events and the UI remote all start with it. */
export const PLUGIN = 'frontline';

/** Every setting the API reads. Nothing else touches `process.env`. */
const Env = z.object({
  PORT: z.coerce.number().int().positive().default(3399),
  /** Postgres as the plugin's own role (`pnpm db:plugin-role frontline` in core). */
  DATA_URL: z.url(),
  /** Connections each API process holds open at most. */
  DATA_POOL_MAX: z.coerce.number().int().positive().default(10),
  /**
   * Whether hosts a member names (a PBX, a mailbox's IMAP and SMTP, a link to preview) may be
   * private, loopback or link-local addresses, as core's setting of the same name allows: for a
   * stack whose mail server or PBX runs beside it, such as e2e. Off, they must be public.
   */
  OUTBOUND_ALLOW_PRIVATE: z.stringbool().default(false),
  /** Core's address, without `/core/v1`. */
  CORE_URL: z.url(),
  /** This plugin's secret from core's `CORE_PLUGIN_KEYS`. */
  PLUGIN_SECRET: z.string().min(32),
  /** Where core and browsers reach this API. */
  PUBLIC_URL: z.url().default('http://localhost:3399'),
  /**
   * The proxies in front of the API, as Express's `trust proxy` takes them: a hop count such as
   * `1`, or addresses and subnets such as `loopback, 10.0.0.0/8`. A visitor's IP, which the
   * rate limits count by, comes from X-Forwarded-For past them. Unset, empty or `false` trusts
   * none; `true` trusts every hop.
   */
  TRUST_PROXY: z
    .string()
    .optional()
    .transform((value = '') => {
      const trimmed = value.trim();

      if (trimmed === '' || trimmed === 'false') return false;

      if (trimmed === 'true') return true;

      return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
    }),
  /**
   * The widgets app that draws forms for visitors. A form link opens
   * `<WIDGETS_DOMAIN>/forms/<key>/<code>?link=<token>`; without it, automations make no links.
   */
  WIDGETS_DOMAIN: z.url().optional(),
  /** The UI remote's entry; the built UI is served at `/ui` unless this points elsewhere. */
  UI_ENTRY_URL: z.url().optional(),
  /** The built UI to serve at `/ui` (the image sets it). */
  UI_DIR: z.string().optional(),
  /** The built embeds websites load, served at `/widget` (the image sets it). */
  WIDGET_DIR: z.string().optional(),
  /** web's origin, where Meta's login sends members back. Defaults to CORE_URL's origin. */
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
  /**
   * The Grandstream UCM API user every PBX is signed in to, as the old plugin read it: a user
   * from the UCM's API configuration page. Set both or neither; without them no PBX connects.
   */
  CALL_API_USER: z.string().min(1).optional(),
  CALL_API_PASSWORD: z.string().min(1).optional(),
  /**
   * The Cloudflare Realtime TURN key softphones relay their audio through when they or the PBX
   * are behind NAT: its id and API token from the dashboard. Set both or neither; unset,
   * softphones connect directly.
   */
  CF_TURN_KEY_ID: z.string().trim().min(1).optional(),
  CF_TURN_API_TOKEN: z.string().trim().min(1).optional(),
  /**
   * The install's Meta app, the one core's Facebook connections sign in through unless an
   * organisation sets its own there: meta-relay forwards its deliveries, which its secret checks.
   */
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  /** What Meta's webhook subscription sends back as `hub.verify_token`. */
  META_VERIFY_TOKEN: z.string().optional(),
  /**
   * meta-relay, which forwards the deliveries of a Meta app another erxes install shares: each
   * connected page and Instagram account is routed to this API. Off unless both are set.
   */
  META_RELAY_URL: z.url().optional(),
  /** This install's key at meta-relay. */
  META_RELAY_KEY: z.string().min(1).optional(),
});

const env = Env.refine((vars) => !vars.META_RELAY_URL === !vars.META_RELAY_KEY, {
  message: 'Set META_RELAY_URL and META_RELAY_KEY together, or neither',
  path: ['META_RELAY_KEY'],
})
  .refine((vars) => !vars.CALL_API_USER === !vars.CALL_API_PASSWORD, {
    message: 'Set CALL_API_USER and CALL_API_PASSWORD together, or neither',
    path: ['CALL_API_PASSWORD'],
  })
  .refine((vars) => !vars.CF_TURN_KEY_ID === !vars.CF_TURN_API_TOKEN, {
    message: 'Set CF_TURN_KEY_ID and CF_TURN_API_TOKEN together, or neither',
    path: ['CF_TURN_API_TOKEN'],
  })
  .parse(process.env);

export const config = {
  port: env.PORT,
  dataUrl: env.DATA_URL,
  /**
   * The pool: a request waits 5 s for a free connection, a transaction's statement runs 15 s,
   * and a transaction idle for 30 s is ended, so a stuck one can't hold a connection.
   */
  pool: {
    max: env.DATA_POOL_MAX,
    connectMs: 5_000,
    statementMs: 15_000,
    idleInTransactionMs: 30_000,
  },
  /** How long frontline waits for core or a provider's API to answer. */
  outboundMs: 15_000,
  outboundAllowPrivate: env.OUTBOUND_ALLOW_PRIVATE,
  coreUrl: env.CORE_URL,
  pluginSecret: env.PLUGIN_SECRET,
  publicUrl: env.PUBLIC_URL.replace(/\/+$/, ''),
  trustProxy: env.TRUST_PROXY,
  uiEntryUrl: env.UI_ENTRY_URL ?? `${env.PUBLIC_URL.replace(/\/+$/, '')}/ui/remoteEntry.js`,
  uiDir: env.UI_DIR,
  widgetDir: env.WIDGET_DIR,
  widgetsDomain: env.WIDGETS_DOMAIN?.replace(/\/+$/, ''),
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
  /** The softphones' Cloudflare TURN key, or null when none is set. */
  turn:
    env.CF_TURN_KEY_ID && env.CF_TURN_API_TOKEN
      ? { keyId: env.CF_TURN_KEY_ID, apiToken: env.CF_TURN_API_TOKEN }
      : null,
  /** The PBXes' API user, or null when none is set. */
  callApi:
    env.CALL_API_USER && env.CALL_API_PASSWORD
      ? { user: env.CALL_API_USER, password: env.CALL_API_PASSWORD }
      : null,
  meta: {
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    verifyToken: env.META_VERIFY_TOKEN,
    relay:
      env.META_RELAY_URL && env.META_RELAY_KEY
        ? { url: env.META_RELAY_URL.replace(/\/+$/, ''), key: env.META_RELAY_KEY }
        : null,
  },
};

/** What checks a token core signed for this plugin: its session, job, event and call tokens. */
export const signedByCore = { coreUrl: config.coreUrl, plugin: PLUGIN };
