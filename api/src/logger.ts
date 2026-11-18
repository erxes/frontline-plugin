import { pino } from 'pino';
import { pinoHttp } from 'pino-http';
import { config, PLUGIN } from '#/config.ts';

/** JSON logs on stdout. With OpenTelemetry on, each line carries its trace id. */
export const logger = pino({ name: PLUGIN, level: config.logLevel });

/**
 * Query parameters that carry a credential: a visitor's token on the messenger's event stream
 * and file links, which EventSource and `<img>` can't send as a header, and a login's code.
 */
const SECRET_PARAMS = ['token', 'code', 'state', 'hub.verify_token'];

/** Headers that carry one: a member's or visitor's session token, Telegram's webhook secret. */
const SECRET_HEADERS = new Set(['authorization', 'cookie', 'x-telegram-bot-api-secret-token']);

const REDACTED = '[Redacted]';

/** `url` with the value of each secret query parameter replaced. */
const redactUrl = (url: string) => {
  const parsed = new URL(url, 'http://local');

  for (const name of SECRET_PARAMS)
    if (parsed.searchParams.has(name)) parsed.searchParams.set(name, REDACTED);

  return `${parsed.pathname}${parsed.search}`;
};

/** One line per request, with no credential in its URL or headers. */
export const requestLogger = pinoHttp({
  logger,
  serializers: {
    // The query and params repeat what the URL holds.
    req: ({ query, params, ...req }: pino.SerializedRequest) => ({
      ...req,
      url: redactUrl(req.url),
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([name, value]) => [
          name,
          SECRET_HEADERS.has(name) ? REDACTED : value,
        ]),
      ),
    }),
  },
});
