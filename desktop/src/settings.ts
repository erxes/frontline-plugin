import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app } from 'electron';
import { z } from 'zod';

const Settings = z.object({
  /** erxes web's address, such as `https://erxes.example.mn`. */
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
 * What the member typed as erxes's address, as an origin: `erxes.example.mn` is
 * `https://erxes.example.mn`. Null for anything that isn't a web address.
 */
export const parseServer = (typed: string) => {
  const text = typed.trim();

  const parsed = Settings.shape.server.safeParse(
    /^https?:\/\//i.test(text) ? text : `https://${text}`,
  );

  return parsed.success && parsed.data ? new URL(parsed.data).origin : null;
};
