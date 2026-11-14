import type { PluginManifest } from '@erxes/core-contract';
import { createCoreClient } from '@erxes/plugin-sdk';
import { config, PLUGIN } from '#/config.ts';

/**
 * Core, called as this plugin: `core.forOrg(orgId).customers.get({ id })`.
 * Tokens last 15 minutes and carry the scopes the organisation granted.
 * Call core from the API only, outside request transactions.
 */
export const core = createCoreClient({
  coreUrl: config.coreUrl,
  plugin: PLUGIN,
  clientSecret: config.pluginSecret,
});

/** The actions members can be granted in core's roles. */
export const PERMISSIONS = {
  view: 'frontline.item.view',
  manage: 'frontline.item.manage',
} as const;

/**
 * What the plugin adds to core, sent on every start. Everything it names
 * starts with `frontline.`. A new scope waits for the owner's approval.
 */
export const manifest = {
  title: 'Frontline',
  description: 'Inbox, channels, tickets and customer messaging for erxes',
  version: config.version,
  ui: { remote: 'frontline_ui', entry: config.uiEntryUrl },
  api: { url: `${config.publicUrl}/api` },
  scopes: [],
  permissions: [
    { action: PERMISSIONS.view, label: 'View items', group: 'Frontline' },
    { action: PERMISSIONS.manage, label: 'Create and change items', group: 'Frontline' },
  ],
} satisfies PluginManifest;
