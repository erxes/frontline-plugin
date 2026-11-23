import { lookup } from 'node:dns';
import type { LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, buildConnector } from 'undici';
import { config } from '#/config.ts';

/**
 * Whether the API may dial `address`, an IP: a public unicast one, so a host a member names
 * can't reach the cluster's network, the metadata service or the API's own loopback. Any with
 * `OUTBOUND_ALLOW_PRIVATE`.
 */
export const isReachable = (address: string) =>
  config.outboundAllowPrivate || ipaddr.process(address).range() === 'unicast';

/**
 * Whether `host`, a name or an IP, is an IP the API may not dial, with or without a trailing dot
 * or IPv6 brackets. Names are checked on lookup.
 */
export const isBlockedIp = (host: string) => {
  const bare = host.replace(/^\[|\]$/g, '').replace(/\.$/, '');

  return ipaddr.isValid(bare) && !isReachable(bare);
};

/**
 * Resolves a name only to addresses the API may dial. A socket that dials through it checks the
 * address it connects to, so a name that rebinds after a check can't reach a private one.
 */
export const reachableLookup: LookupFunction = (hostname, options, callback) =>
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, []);

    const [first] = addresses;

    if (!first || !addresses.every(({ address }) => isReachable(address)))
      callback(new Error(`${hostname} is not a public address`), []);
    else if (options.all) callback(null, addresses);
    else callback(null, first.address, first.family);
  });

/**
 * An undici dispatcher whose sockets resolve names through `reachableLookup`, with `tls` for its
 * TLS connections. A socket dials an IP without the lookup, so one the API may not dial is
 * refused before it connects, on a redirect too.
 */
const reachableAgent = (tls: { rejectUnauthorized?: boolean } = {}) => {
  const connector = buildConnector({ lookup: reachableLookup, ...tls });

  return new Agent({
    connect: (options, callback) => {
      if (isBlockedIp(options.hostname))
        callback(new Error(`${options.hostname} is not a public address`), null);
      else connector(options, callback);
    },
  });
};

/** Dials only addresses the API may, and checks TLS. */
export const reachableOnly = reachableAgent();

/**
 * Dials only addresses the API may, and takes any certificate. For a PBX alone: a UCM ships a
 * self-signed certificate or one without its intermediate, as the old plugin accepted.
 */
export const reachableUnverified = reachableAgent({ rejectUnauthorized: false });

/**
 * The address to dial for `host`, checked by `reachableLookup`, for a client that resolves names
 * itself and takes no lookup (nodemailer). It connects to the address and checks TLS against
 * `host`.
 */
export const reachableAddress = (host: string) =>
  new Promise<string>((resolve, reject) => {
    reachableLookup(host, { all: false }, (error, address) => {
      if (error) reject(error);
      else if (typeof address === 'string') resolve(address);
      else reject(new Error(`${host} did not resolve`));
    });
  });
