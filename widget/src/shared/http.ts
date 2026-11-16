import wretch from 'wretch';

/**
 * frontline's public API under `base`, which ends in a slash: paths append to it, and a
 * refusal's error carries the message the route gave.
 */
export const publicApi = (base: URL) =>
  wretch(base.href).customError(async (error, response) => {
    let data: unknown = null;

    try {
      data = await response.json();
    } catch {
      // Not JSON: the error keeps the status text.
    }

    if (typeof data === 'object' && data && 'message' in data && typeof data.message === 'string')
      error.message = data.message;

    return error;
  });

/** The bearer header of a visitor's token. */
export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
