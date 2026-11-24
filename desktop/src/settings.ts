import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { z } from 'zod';

const Settings = z.object({
  /** erxes web's address: an origin such as `https://erxes.example.mn`, or the page to start on. */
  server: z.url({ protocol: /^https?$/ }).optional(),
  /** Where the window was when the member last closed it. */
  bounds: z
    .object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() })
    .optional(),
  maximized: z.boolean().optional(),
});

type Settings = z.infer<typeof Settings>;

/** The settings file's text: JSON of the settings. */
const SettingsFile = z
  .string()
  .transform((text, context) => {
    try {
      const value: unknown = JSON.parse(text);

      return value;
    } catch {
      context.addIssue('Not JSON');

      return z.NEVER;
    }
  })
  .pipe(Settings);

const file = () => join(app.getPath('userData'), 'settings.json');

/** The saved settings; none on the first run, or when someone broke the file by hand. */
const read = () => {
  if (!existsSync(file())) return {};

  const parsed = SettingsFile.safeParse(readFileSync(file(), 'utf8'));

  return parsed.success ? parsed.data : {};
};

let current: Settings | null = null;

export const settings = () => (current ??= read());

export const saveSettings = (patch: Partial<Settings>) => {
  current = { ...settings(), ...patch };
  writeFileSync(file(), JSON.stringify(current, null, 2));
};

/**
 * What the member typed as erxes's address: `erxes.example.mn` is the origin
 * `https://erxes.example.mn`, and a path they typed stays, even a bare `/`, for an erxes that
 * doesn't serve Frontline's pages at `/frontline`. Null for anything that isn't a web address.
 */
export const parseServer = (typed: string) => {
  const text = typed.trim();
  const address = /^https?:\/\//i.test(text) ? text : `https://${text}`;

  const parsed = Settings.shape.server.safeParse(address);

  if (!parsed.success || !parsed.data) return null;

  const { origin, pathname } = new URL(parsed.data);

  return /^https?:\/\/[^/]+\//i.test(address) ? `${origin}${pathname}` : origin;
};

/** Whether `url` is on erxes's saved address: the same origin, whatever its path. */
export const onServer = (url: string) => {
  const { server } = settings();

  return Boolean(server) && URL.parse(url)?.origin === URL.parse(server ?? '')?.origin;
};
