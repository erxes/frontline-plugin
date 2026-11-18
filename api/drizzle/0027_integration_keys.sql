-- Every integration gets the public key its website embed or webhook carries; rows written
-- around `integrations.create`, such as imports and seeds, had none, so their messenger showed
-- no install code. Without FORCE row-level security the plugin's role sees every organisation's
-- integrations until FORCE is back, in this transaction.
ALTER TABLE "frontline_integrations" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO "frontline_public_keys" ("key", "org_of", "kind", "target_id")
SELECT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), i."org_id", 'integration', i."id"
FROM "frontline_integrations" i
WHERE NOT EXISTS (
  SELECT 1 FROM "frontline_public_keys" k WHERE k."kind" = 'integration' AND k."target_id" = i."id"
);--> statement-breakpoint
ALTER TABLE "frontline_integrations" FORCE ROW LEVEL SECURITY;
