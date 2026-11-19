-- A PBX's TURN password moves from its plain config into its sealed secret, which only the API
-- can seal, so SQL drops it from every organisation's config and an admin enters it again. The
-- plugin owns the table, so without FORCE row-level security its role sees every row until FORCE
-- is back, in this transaction.
ALTER TABLE "frontline_integration_accounts" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "frontline_integration_accounts"
SET "config" = ("config" - 'turnPassword') || '{"hasTurnPassword": false}'::jsonb
WHERE "provider" = 'call';--> statement-breakpoint
ALTER TABLE "frontline_integration_accounts" FORCE ROW LEVEL SECURITY;
