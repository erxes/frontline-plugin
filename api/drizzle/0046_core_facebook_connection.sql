DROP TABLE "frontline_meta_apps" CASCADE;--> statement-breakpoint
ALTER TABLE "frontline_integration_accounts" ADD COLUMN "connection_id" text;--> statement-breakpoint
-- Organisations' own Meta apps now live in core: their verify tokens lead nowhere.
DELETE FROM "frontline_public_keys" WHERE "kind" = 'meta-verify';
