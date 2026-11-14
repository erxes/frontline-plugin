import { pgTableCreator } from 'drizzle-orm/pg-core';

/**
 * Every table is `frontline_<name>`: the plugin shares core's database, and core
 * gives its role rights on its own tables only. Name indexes and constraints
 * in full (`frontline_items_org_created_idx`).
 */
export const table = pgTableCreator((name) => `frontline_${name}`);
