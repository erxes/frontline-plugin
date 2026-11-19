// Core's file addresses, with no imports, so the member UI reads them as the API does.

/** The address core gives a file it stores, with the file's id. */
export const CORE_FILE = /^\/core\/v1\/files\/([\w-]{1,64})\/download$/;

/** The id of the core file at `url`, the address core gives its files, or null for another address. */
export const fileIdOf = (url: string) => CORE_FILE.exec(url)?.[1] ?? null;
