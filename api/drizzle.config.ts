import { defineConfig } from 'drizzle-kit';

// `pnpm db:generate` writes a SQL migration from changes in src/db/schema.ts and tickets.ts.
// The API applies pending migrations on startup (src/db/migrate.ts).
export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/db/schema.ts', './src/db/tickets.ts'],
  out: './drizzle',
  casing: 'snake_case',
  // Same table as the API's migrator.
  migrations: { schema: 'public', table: '__drizzle_migrations_frontline' },
  // Core and other plugins share the database: drizzle-kit must never see their tables.
  tablesFilter: ['frontline_*'],
  strict: true,
  verbose: true,
});
