CREATE TABLE "frontline_items" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "frontline_items_org_created_idx" ON "frontline_items" USING btree ("org_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "frontline_items_org_name_key" ON "frontline_items" USING btree ("org_id",lower("name"));--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_items');