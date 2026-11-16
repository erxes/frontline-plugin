CREATE TABLE "frontline_meta_bots" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"account_id" text NOT NULL,
	"name" text NOT NULL,
	"persistent_menu" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ice_breakers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"get_started_text" text,
	"greeting" text,
	"status" text DEFAULT 'healthy' NOT NULL,
	"error" text,
	"synced_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_meta_bots_org_account_key" UNIQUE("org_id","account_id"),
	CONSTRAINT "frontline_meta_bots_status_check" CHECK ("frontline_meta_bots"."status" in ('healthy', 'broken'))
);
--> statement-breakpoint
ALTER TABLE "frontline_meta_bots" ADD CONSTRAINT "frontline_meta_bots_account_fkey" FOREIGN KEY ("org_id","account_id") REFERENCES "public"."frontline_integration_accounts"("org_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_meta_bots');