import ky, { HTTPError, NetworkError, TimeoutError, type Options } from 'ky';
import { config } from '#/config.ts';
import { AccountRefused } from './provider.ts';

const answered = (status: number) => `it answered ${status}`;

/**
 * The provider answered, and not with what was asked: any status outside 2xx, or an answer that
 * isn't the JSON its API gives. `status` is the HTTP status, or for an API that answers every call
 * 200, such as a PBX's, the status in its answer.
 */
export class ProviderRefused extends Error {
  readonly status: number;

  constructor(name: string, status: number, why: string | undefined) {
    super(`${name} refused: ${why ?? answered(status)}`);
    this.status = status;
  }
}

/** What a provider's error body says: its reason, and whether the account's token is dead. */
export interface Refusal {
  why?: string;
  deadToken?: boolean;
}

/** A body that carries a file: it goes up in the one request, so it gets longer than a call. */
const carriesFile = (body: unknown) =>
  body instanceof FormData || body instanceof Uint8Array || body instanceof Blob;

/**
 * An HTTP client for one provider's API, on `ky`. It sends JSON with `json` and forms or bytes
 * with `body`, waits `config.outboundMs` for an answer, 4× for a file, and never tries twice: a
 * send that timed out may have gone. A refusal is `ProviderRefused` in the provider's words, read
 * by `readError` from its body; `AccountRefused` when `readError` says the token is dead. A
 * timeout or a dropped connection fails without the address, which may hold a token.
 */
export const providerApi = ({
  name,
  readError,
  ...options
}: Options & {
  name: string;
  readError?: (body: unknown, status: number) => Refusal;
}) =>
  ky.create({
    retry: 0,
    timeout: config.outboundMs,
    ...options,
    parseJson: (text, { response }) => {
      if (text === '') return null;

      try {
        const parsed: unknown = JSON.parse(text);

        return parsed;
      } catch {
        throw new ProviderRefused(name, response.status, 'it answered something other than JSON');
      }
    },
    hooks: {
      init: [
        (init) => {
          if (carriesFile(init.body)) init.timeout = 4 * config.outboundMs;
        },
      ],
      beforeError: [
        ({ error }) => {
          if (error instanceof HTTPError) {
            const { status } = error.response;
            const { why, deadToken } = readError?.(error.data, status) ?? {};

            return deadToken
              ? new AccountRefused(why ?? answered(status))
              : new ProviderRefused(name, status, why);
          }

          if (error instanceof TimeoutError) return new Error(`${name} did not answer in time`);

          if (error instanceof NetworkError)
            return new Error(`${name} did not answer`, { cause: error.cause });

          return error;
        },
      ],
    },
  });
