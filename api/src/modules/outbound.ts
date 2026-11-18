import { lookup } from 'node:dns';
import type { LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent } from 'undici';
import { config } from '#/config.ts';

/**
 * Whether the API may dial `address`, an IP: a public unicast one, so a host a member names
 * can't reach the cluster's network, the metadata service or the API's own loopback. Any with
 * `OUTBOUND_ALLOW_PRIVATE`.
 */
export const isReachable = (address: string) =>
  config.outboundAllowPrivate || ipaddr.process(address).range() === 'unicast';

/** Whether `host`, a name or an IP, is an IP the API may not dial. Names are checked on lookup. */
export const isBlockedIp = (host: string) => ipaddr.isValid(host) && !isReachable(host);

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

/** An undici dispatcher whose sockets resolve through `reachableLookup`. */
export const reachableOnly = new Agent({ connect: { lookup: reachableLookup } });

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
