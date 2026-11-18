import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import { ORPCError } from '@orpc/server';
import Cloudflare, { APIError, NotFoundError } from 'cloudflare';
import { and, eq, gt, isNotNull, isNull, ne, or } from 'drizzle-orm';
import { config } from '#/config.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { type DomainRecord, HELP_CENTER_DOMAIN, helpCenters } from '#/db/helpcenter.ts';
import { publicKeys } from '#/db/public.ts';
import { logger } from '#/logger.ts';
import { removeKeys } from '../public.ts';

type Status = 'pending' | 'active';

type Hostname = Awaited<ReturnType<Cloudflare['customHostnames']['get']>>;

/** Our own zones and local names, which no help center may claim. */
const RESERVED = ['erxes.io', 'erxes.tech', 'erxes.mn', 'localhost'];

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** A pending domain is rechecked in the background for a week after it is saved or refreshed. */
const CHECK_DAYS = 7;

/** Cloudflare's "Duplicate custom hostname found." */
const DUPLICATE_HOSTNAME = 1406;

const cloudflare = config.cloudflare && new Cloudflare({ apiToken: config.cloudflare.apiToken });

/** Where a help center's domain points: `<its key>.<HELPCENTER_DOMAIN_SUFFIX>`. */
export const cnameTarget = (publicKey: string) => `${publicKey}.${config.helpCenterDomainSuffix}`;

export const domainsAvailable = () => cloudflare !== null;

const refuse = (message: string) => new ORPCError('BAD_REQUEST', { message });

/**
 * What the member typed ("https://Help.Acme.com/", "help.acme.com:443") as the bare ASCII
 * hostname Cloudflare and DNS take, or a refusal saying what is wrong with it.
 */
export const parseHostname = (input: string) => {
  const raw = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '');

  const host = (raw.split(/[/?#]/)[0] ?? '').split('@').pop() ?? '';
  const hostname = domainToASCII(host.replace(/:\d+$/, '').replace(/\.$/, ''));
  const labels = hostname.split('.');

  if (!hostname) throw refuse('Enter a domain such as help.example.com');

  if (hostname.length > 253 || isIP(hostname))
    throw refuse('Enter a domain name, not an IP address');

  if (
    labels.length < 2 ||
    !labels.every((label) => LABEL.test(label)) ||
    /^\d+$/.test(labels.at(-1) ?? '')
  )
    throw refuse(`${hostname} is not a valid domain name`);

  const reserved = RESERVED.find((zone) => hostname === zone || hostname.endsWith(`.${zone}`));

  if (reserved) throw refuse(`Domains under ${reserved} cannot be a help center's domain`);

  return hostname;
};

const statusOf = (value: string | undefined): Status => (value === 'active' ? 'active' : 'pending');

/** Whether `hostname` CNAMEs to `target`; an apex domain served by flattening has none to read. */
const pointsTo = async (hostname: string, target: string) => {
  const records = await dns.resolveCname(hostname).catch(() => []);

  return records.some((record) => record.toLowerCase().replace(/\.$/, '') === target);
};

/** Whether `name` has the TXT record `value`. */
const hasTxt = async (name: string, value: string) => {
  const records = await dns.resolveTxt(name).catch(() => []);

  return records.some((chunks) => chunks.join('') === value);
};

/**
 * Whether DNS proves the domain is this help center's: it CNAMEs to the center's own target, or
 * an apex domain carries the ownership TXT record of the center's own Cloudflare hostname.
 * Cloudflare's status can't tell: it turns active for a domain that points at any help center.
 */
const owns = async (found: Hostname, target: string) => {
  const ownership = found.ownership_verification;

  if (await pointsTo(found.hostname, target)) return true;

  return ownership?.name && ownership.value ? hasTxt(ownership.name, ownership.value) : false;
};

/** The help center's domain columns from what Cloudflare and DNS say now. */
const domainState = (found: Hostname, target: string, previous: DomainRecord[], owned: boolean) => {
  const domainStatus = statusOf(found.status);
  const sslStatus = statusOf(found.ssl?.status);
  const dnsStatus: Status = owned ? 'active' : 'pending';

  const ssl = (found.ssl?.validation_records ?? []).flatMap((record) =>
    record.txt_name && record.txt_value
      ? [{ type: 'TXT', name: record.txt_name, value: record.txt_value, status: sslStatus }]
      : [],
  );

  const ownership = found.ownership_verification;

  const records: DomainRecord[] = [
    { type: 'CNAME', name: found.hostname, value: target, status: dnsStatus },
    // Cloudflare stops returning the certificate's TXT records once it is issued.
    ...(ssl.length > 0 ? ssl : previous.filter((record) => record.type === 'TXT')),
    ...(ownership?.name && ownership.value
      ? [
          {
            type: 'TXT ownership',
            name: ownership.name,
            value: ownership.value,
            status: domainStatus,
          },
        ]
      : []),
  ];

  return {
    hostname: found.hostname,
    cloudflareId: found.id,
    domainStatus,
    sslStatus,
    dnsStatus,
    domainRecords: records,
    domainErrors: [
      ...(found.verification_errors ?? []),
      ...(found.ssl?.validation_errors ?? []).flatMap((error) =>
        error.message ? [error.message] : [],
      ),
    ],
    domainCheckedAt: new Date(),
  };
};

const client = () => {
  if (!cloudflare || !config.cloudflare)
    throw refuse('Custom domains are not available on this installation');

  return { cf: cloudflare, zone_id: config.cloudflare.zoneId };
};

/**
 * Registers `hostname` on Cloudflare. Another help center's registration of it gives way only
 * when the domain already CNAMEs to `target`: DNS shows who owns it.
 */
const createHostname = async (hostname: string, target: string): Promise<Hostname> => {
  const { cf, zone_id } = client();

  const create = () =>
    cf.customHostnames.create({
      zone_id,
      hostname,
      ssl: { method: 'txt', type: 'dv', settings: { min_tls_version: '1.2' } },
    });

  return create().catch(async (error: unknown) => {
    if (
      !(error instanceof APIError) ||
      !error.errors.some((item) => item.code === DUPLICATE_HOSTNAME)
    )
      throw error;

    if (!(await pointsTo(hostname, target)))
      throw refuse(
        `${hostname} is already connected elsewhere. Point its CNAME at ${target} and connect it again`,
      );

    const { result } = await cf.customHostnames.list({ zone_id, hostname: { exact: hostname } });

    await Promise.all(result.map((other) => cf.customHostnames.delete(other.id, { zone_id })));

    return create();
  });
};

/** Cloudflare's hostname, registered again when it was removed on Cloudflare's side. */
const readHostname = async (hostname: string, cloudflareId: string | null, target: string) => {
  const { cf, zone_id } = client();

  if (!cloudflareId) return createHostname(hostname, target);

  return cf.customHostnames.get(cloudflareId, { zone_id }).catch((error: unknown) => {
    if (error instanceof NotFoundError) return createHostname(hostname, target);

    throw error;
  });
};

const checkUntil = () => new Date(Date.now() + CHECK_DAYS * 24 * 60 * 60 * 1000);

const domainColumns = {
  id: helpCenters.id,
  publicKey: helpCenters.publicKey,
  hostname: helpCenters.hostname,
  cloudflareId: helpCenters.cloudflareId,
  domainRecords: helpCenters.domainRecords,
};

type HelpCenterDomain = Pick<typeof helpCenters.$inferSelect, keyof typeof domainColumns>;

const domainOf = async (tx: Tx, id: string) => {
  const [row] = await tx.select(domainColumns).from(helpCenters).where(eq(helpCenters.id, id));

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such help center' });

  return row;
};

/**
 * What Cloudflare and DNS say about `hostname` on the help center now. It runs outside any
 * transaction, so a slow call holds no connection or lock; `recordDomain` saves the answer.
 */
const checkDomain = async (center: HelpCenterDomain, hostname: string) => {
  const target = cnameTarget(center.publicKey);
  const cloudflareId = hostname === center.hostname ? center.cloudflareId : null;
  const found = await readHostname(hostname, cloudflareId, target);
  const owned = await owns(found, target);

  return {
    id: center.id,
    previous: center.hostname,
    owned,
    ...domainState(found, target, center.domainRecords, owned),
  };
};

export type DomainCheck = Awaited<ReturnType<typeof checkDomain>>;

/** Checks `input` for the help center: Cloudflare issues its certificate once the records are in. */
export const connectDomain = async (orgId: string, id: string, input: string) => {
  const hostname = parseHostname(input);

  const center = await withOrg(orgId, async (tx) => {
    const found = await domainOf(tx, id);

    if (found.hostname && found.hostname !== hostname)
      throw refuse(`Reset ${found.hostname} before connecting another domain`);

    const [other] = await tx
      .select({ id: helpCenters.id })
      .from(helpCenters)
      .where(and(eq(helpCenters.hostname, hostname), ne(helpCenters.id, id)));

    if (other) throw refuse(`${hostname} is already connected to another help center`);

    return found;
  });

  client();

  return checkDomain(center, hostname);
};

/** Checks the help center's connected domain again. */
export const recheckDomain = async (orgId: string, id: string) => {
  const center = await withOrg(orgId, (tx) => domainOf(tx, id));

  if (!center.hostname) throw refuse('No domain is connected');

  return checkDomain(center, center.hostname);
};

/**
 * Saves a check. A check a member caused restarts the week of background checks while the domain
 * is pending; the background check leaves the deadline. Once DNS proves the domain is the help
 * center's, signed-out visitors reach the center by it, even when another one held it before.
 */
export const recordDomain = async (
  tx: Tx,
  orgId: string,
  { id, previous, owned, ...state }: DomainCheck,
  { restart }: { restart: boolean },
) => {
  const active = state.domainStatus === 'active' && state.sslStatus === 'active';

  const [saved] = await tx
    .update(helpCenters)
    .set({
      ...state,
      ...(active ? { domainCheckUntil: null } : restart ? { domainCheckUntil: checkUntil() } : {}),
    })
    .where(
      and(
        eq(helpCenters.id, id),
        previous ? eq(helpCenters.hostname, previous) : isNull(helpCenters.hostname),
      ),
    )
    .returning({ id: helpCenters.id });

  if (!saved)
    throw new ORPCError('CONFLICT', { message: 'The domain changed meanwhile. Try again' });

  if (!owned) return;

  const claim = { orgOf: orgId, kind: HELP_CENTER_DOMAIN, targetId: id };

  await tx
    .insert(publicKeys)
    .values({ key: state.hostname, ...claim })
    .onConflictDoUpdate({
      target: publicKeys.key,
      set: claim,
      setWhere: eq(publicKeys.kind, HELP_CENTER_DOMAIN),
    });
};

/** Takes the domain and its claim off the help center. `dropHostname` clears Cloudflare after. */
export const clearDomain = async (tx: Tx, orgId: string, center: HelpCenterDomain) => {
  if (center.hostname)
    await removeKeys(
      tx,
      orgId,
      and(
        eq(publicKeys.kind, HELP_CENTER_DOMAIN),
        eq(publicKeys.key, center.hostname),
        eq(publicKeys.targetId, center.id),
      ),
    );

  await tx
    .update(helpCenters)
    .set({
      hostname: null,
      cloudflareId: null,
      domainStatus: null,
      sslStatus: null,
      dnsStatus: null,
      domainRecords: [],
      domainErrors: [],
      domainCheckUntil: null,
      domainCheckedAt: null,
    })
    .where(eq(helpCenters.id, center.id));
};

/**
 * Takes a cleared domain off Cloudflare, after the transaction commits. Already gone is the
 * outcome wanted; a failure leaves the hostname there, logged.
 */
export const dropHostname = async ({ id, cloudflareId }: HelpCenterDomain) => {
  if (!cloudflareId || !cloudflare || !config.cloudflare) return;

  await cloudflare.customHostnames
    .delete(cloudflareId, { zone_id: config.cloudflare.zoneId })
    .catch((error: unknown) => {
      if (!(error instanceof NotFoundError))
        logger.error(
          { err: error, helpCenterId: id, cloudflareId },
          'cloudflare hostname delete failed',
        );
    });
};

/** The `helpcenter.domains` job: rechecks the organisation's pending domains in their week. */
export const checkDomains = async (orgId: string) => {
  if (!domainsAvailable()) return { checked: 0, failed: 0 };

  const pending = await withOrg(orgId, (tx) =>
    tx
      .select(domainColumns)
      .from(helpCenters)
      .where(
        and(
          isNotNull(helpCenters.hostname),
          gt(helpCenters.domainCheckUntil, new Date()),
          or(ne(helpCenters.domainStatus, 'active'), ne(helpCenters.sslStatus, 'active')),
        ),
      ),
  );

  // Each domain is checked on its own: one Cloudflare refusal doesn't stop the others.
  const failed = await Promise.all(
    pending.map(async (center) => {
      if (!center.hostname) return false;

      try {
        const check = await checkDomain(center, center.hostname);

        await withOrg(orgId, (tx) => recordDomain(tx, orgId, check, { restart: false }));

        return false;
      } catch (error) {
        logger.warn({ err: error, orgId, helpCenterId: center.id }, 'domain check failed');

        return true;
      }
    }),
  );

  return { checked: pending.length, failed: failed.filter(Boolean).length };
};
