import { promises as dns } from 'node:dns';
import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import { ORPCError } from '@orpc/server';
import Cloudflare, { APIError, NotFoundError } from 'cloudflare';
import { and, eq, gt, isNotNull, ne, or } from 'drizzle-orm';
import { config } from '#/config.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { type DomainRecord, helpCenters, publicAddresses } from '#/db/helpcenter.ts';

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

/** The help center's domain columns from what Cloudflare and DNS say now. */
const domainState = async (found: Hostname, target: string, previous: DomainRecord[]) => {
  const domainStatus = statusOf(found.status);
  const sslStatus = statusOf(found.ssl?.status);

  const dnsStatus: Status =
    domainStatus === 'active' || (await pointsTo(found.hostname, target)) ? 'active' : 'pending';

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

const createHostname = async (hostname: string) => {
  const { cf, zone_id } = client();

  return cf.customHostnames
    .create({
      zone_id,
      hostname,
      ssl: { method: 'txt', type: 'dv', settings: { min_tls_version: '1.2' } },
    })
    .catch((error: unknown) => {
      if (
        error instanceof APIError &&
        error.errors.some((item) => item.code === DUPLICATE_HOSTNAME)
      )
        throw refuse(`${hostname} is already connected elsewhere`);

      throw error;
    });
};

/** Cloudflare's hostname, registered again when it was removed on Cloudflare's side. */
const readHostname = async (hostname: string, cloudflareId: string | null) => {
  const { cf, zone_id } = client();

  if (!cloudflareId) return createHostname(hostname);

  return cf.customHostnames.get(cloudflareId, { zone_id }).catch((error: unknown) => {
    if (error instanceof NotFoundError) return createHostname(hostname);

    throw error;
  });
};

const checkUntil = () => new Date(Date.now() + CHECK_DAYS * 24 * 60 * 60 * 1000);

type HelpCenterDomain = Pick<
  typeof helpCenters.$inferSelect,
  'id' | 'publicKey' | 'hostname' | 'cloudflareId' | 'domainRecords'
>;

/**
 * Re-reads the help center's domain and saves it. A check a member caused restarts the week of
 * background checks while it is pending; the background check leaves the deadline.
 */
export const syncDomain = async (
  tx: Tx,
  center: HelpCenterDomain,
  { restart }: { restart: boolean },
) => {
  if (!center.hostname) throw refuse('No domain is connected');

  const found = await readHostname(center.hostname, center.cloudflareId);
  const state = await domainState(found, cnameTarget(center.publicKey), center.domainRecords);
  const active = state.domainStatus === 'active' && state.sslStatus === 'active';

  await tx
    .update(helpCenters)
    .set({
      ...state,
      ...(active ? { domainCheckUntil: null } : restart ? { domainCheckUntil: checkUntil() } : {}),
    })
    .where(eq(helpCenters.id, center.id));
};

/** Connects `input` to the help center: Cloudflare issues its certificate once the records are in. */
export const connectDomain = async (
  tx: Tx,
  orgId: string,
  center: HelpCenterDomain,
  input: string,
) => {
  const hostname = parseHostname(input);

  if (center.hostname && center.hostname !== hostname)
    throw refuse(`Reset ${center.hostname} before connecting another domain`);

  if (center.hostname === hostname) return syncDomain(tx, center, { restart: true });

  client();

  const [claimed] = await tx
    .insert(publicAddresses)
    .values({ address: hostname, organizationId: orgId, helpCenterId: center.id })
    .onConflictDoNothing()
    .returning();

  if (!claimed) throw refuse(`${hostname} is already connected to another help center`);

  await tx.update(helpCenters).set({ hostname }).where(eq(helpCenters.id, center.id));

  return syncDomain(tx, { ...center, hostname }, { restart: true });
};

/** Takes the domain off Cloudflare and the help center; already gone is the outcome wanted. */
export const resetDomain = async (tx: Tx, center: HelpCenterDomain) => {
  if (center.cloudflareId) {
    const { cf, zone_id } = client();

    await cf.customHostnames.delete(center.cloudflareId, { zone_id }).catch((error: unknown) => {
      if (!(error instanceof NotFoundError)) throw error;
    });
  }

  if (center.hostname)
    await tx.delete(publicAddresses).where(eq(publicAddresses.address, center.hostname));

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

/** The `helpcenter.domains` job: rechecks the organisation's pending domains in their week. */
export const checkDomains = (orgId: string) =>
  withOrg(orgId, async (tx) => {
    if (!domainsAvailable()) return { checked: 0 };

    const pending = await tx
      .select()
      .from(helpCenters)
      .where(
        and(
          isNotNull(helpCenters.hostname),
          gt(helpCenters.domainCheckUntil, new Date()),
          or(ne(helpCenters.domainStatus, 'active'), ne(helpCenters.sslStatus, 'active')),
        ),
      );

    await Promise.all(pending.map((center) => syncDomain(tx, center, { restart: false })));

    return { checked: pending.length };
  });
