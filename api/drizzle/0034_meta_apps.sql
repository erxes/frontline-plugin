CREATE TABLE "frontline_meta_apps" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"app_id" text NOT NULL,
	"secret" text NOT NULL,
	"verify_token" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_meta_apps_org_key" UNIQUE("org_id")
);
--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_meta_apps');
