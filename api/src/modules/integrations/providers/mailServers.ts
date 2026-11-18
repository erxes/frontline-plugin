import { Resolver } from 'node:dns/promises';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { readsWithCore } from '#/orpc.ts';

const SERVICES = ['google', 'microsoft', 'yahoo', 'apple', 'zoho', 'yandex'] as const;

type Service = (typeof SERVICES)[number];

const Host = z.object({ host: z.string(), port: z.number() });

const Servers = z.object({
  /** The mail service the address is on, when it is a known one; its sign-in rules differ. */
  service: z.enum(SERVICES).nullable(),
  imap: Host,
  smtp: Host,
});

type Servers = z.infer<typeof Servers>;

/**
 * Each known service: the domains of its own addresses, the endings of the MX hosts a company
 * domain on it points at, and its IMAP and SMTP servers.
 */
const KNOWN: Record<Service, { domains: string[]; mx: string[] } & Omit<Servers, 'service'>> = {
  google: {
    domains: ['gmail.com', 'googlemail.com'],
    mx: ['google.com', 'googlemail.com'],
    imap: { host: 'imap.gmail.com', port: 993 },
    smtp: { host: 'smtp.gmail.com', port: 465 },
  },
  microsoft: {
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
    mx: ['outlook.com'],
    imap: { host: 'outlook.office365.com', port: 993 },
    smtp: { host: 'smtp.office365.com', port: 587 },
  },
  yahoo: {
    domains: ['yahoo.com', 'ymail.com'],
    mx: ['yahoodns.net'],
    imap: { host: 'imap.mail.yahoo.com', port: 993 },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465 },
  },
  apple: {
    domains: ['icloud.com', 'me.com', 'mac.com'],
    mx: ['icloud.com'],
    imap: { host: 'imap.mail.me.com', port: 993 },
    smtp: { host: 'smtp.mail.me.com', port: 587 },
  },
  zoho: {
    domains: ['zoho.com', 'zohomail.com'],
    mx: ['zoho.com', 'zoho.eu'],
    imap: { host: 'imap.zoho.com', port: 993 },
    smtp: { host: 'smtp.zoho.com', port: 465 },
  },
  yandex: {
    domains: ['yandex.com', 'yandex.ru', 'ya.ru'],
    mx: ['yandex.net', 'yandex.ru'],
    imap: { host: 'imap.yandex.com', port: 993 },
    smtp: { host: 'smtp.yandex.com', port: 465 },
  },
};

const serversOf = (service: Service): Servers => ({
  service,
  imap: KNOWN[service].imap,
  smtp: KNOWN[service].smtp,
});

const endsWith = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** One try with a short wait: the form only suggests, and the member can type the servers. */
const resolver = new Resolver({ timeout: 3000, tries: 1 });

/**
 * The servers a mailbox at `address` most likely uses: a known service by the address's domain,
 * else by where the domain's MX records point, else `imap.` and `smtp.` on the domain itself.
 */
const mailServersOf = async (address: string): Promise<Servers> => {
  const domain = address.split('@').at(-1)?.toLowerCase() ?? '';
  const own = SERVICES.find((service) => KNOWN[service].domains.includes(domain));

  if (own) return serversOf(own);

  const exchanges = await resolver.resolveMx(domain).catch(() => []);

  const hosted = SERVICES.find((service) =>
    exchanges.some(({ exchange }) =>
      KNOWN[service].mx.some((mx) => endsWith(exchange.toLowerCase(), mx)),
    ),
  );

  if (hosted) return serversOf(hosted);

  return {
    service: null,
    imap: { host: `imap.${domain}`, port: 993 },
    smtp: { host: `smtp.${domain}`, port: 465 },
  };
};

/** The servers to suggest on the mailbox form once its address is typed. */
export const servers = readsWithCore(
  PERMISSIONS.integrationManage,
  z.object({ address: z.email().max(320) }),
  async (_member, input) => mailServersOf(input.address),
)
  .output(Servers)
  .handler(({ context: { fromCore } }) => fromCore);
