CREATE TABLE "frontline_integration_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret" text NOT NULL,
	"sync_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'healthy' NOT NULL,
	"error" text,
	"checked_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_integration_accounts_org_provider_external_key" UNIQUE("org_id","provider","external_id"),
	CONSTRAINT "frontline_integration_accounts_org_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "frontline_integration_accounts_provider_check" CHECK ("frontline_integration_accounts"."provider" in ('facebook', 'instagram', 'telegram', 'discord', 'mail')),
	CONSTRAINT "frontline_integration_accounts_status_check" CHECK ("frontline_integration_accounts"."status" in ('healthy', 'broken'))
);
--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_integration_accounts');
