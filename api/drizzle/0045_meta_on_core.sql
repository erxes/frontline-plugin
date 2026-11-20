CREATE TABLE "frontline_meta_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"kind" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_meta_accounts_org_kind_external_key" UNIQUE("org_id","kind","external_id"),
	CONSTRAINT "frontline_meta_accounts_kind_check" CHECK ("frontline_meta_accounts"."kind" in ('facebook', 'instagram'))
);
--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_meta_accounts');--> statement-breakpoint
ALTER TABLE "frontline_meta_bots" RENAME COLUMN "account_id" TO "connection_id";--> statement-breakpoint
ALTER TABLE "frontline_meta_bots" DROP CONSTRAINT "frontline_meta_bots_org_account_key";--> statement-breakpoint
ALTER TABLE "frontline_meta_bots" DROP CONSTRAINT "frontline_meta_bots_account_fkey";--> statement-breakpoint
ALTER TABLE "frontline_meta_bots" ADD CONSTRAINT "frontline_meta_bots_org_connection_key" UNIQUE("org_id","connection_id");--> statement-breakpoint
ALTER TABLE "frontline_integration_accounts" DROP CONSTRAINT "frontline_integration_accounts_provider_check";--> statement-breakpoint
ALTER TABLE "frontline_integration_accounts" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "frontline_meta_accounts" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
INSERT INTO "frontline_meta_accounts" ("id", "org_id", "kind", "external_id", "name", "config", "secret", "status", "error", "created_by", "created_at", "updated_at")
SELECT "id", "org_id", "provider", "external_id", "name", "config", "secret", "status", "error", "created_by", "created_at", "updated_at"
FROM "frontline_integration_accounts"
WHERE "provider" in ('facebook', 'instagram');--> statement-breakpoint
DELETE FROM "frontline_integration_accounts" WHERE "provider" in ('facebook', 'instagram');--> statement-breakpoint
ALTER TABLE "frontline_meta_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "frontline_integration_accounts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
DELETE FROM "frontline_public_keys" WHERE "kind" in ('facebook', 'instagram', 'meta-verify');--> statement-breakpoint
ALTER TABLE "frontline_integration_accounts" ADD CONSTRAINT "frontline_integration_accounts_provider_check" CHECK ("frontline_integration_accounts"."provider" in ('telegram', 'discord', 'mail', 'call', 'callpro'));
