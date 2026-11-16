CREATE TABLE "frontline_unit_sync" (
	"org_id" text PRIMARY KEY NOT NULL,
	"adopted_at" timestamp with time zone,
	"synced_at" timestamp with time zone
);
--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_unit_sync');
