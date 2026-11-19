CREATE TABLE "frontline_report_charts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"section" text NOT NULL,
	"kind" text NOT NULL,
	"visual" text NOT NULL,
	"period" text NOT NULL,
	"from" timestamp with time zone,
	"to" timestamp with time zone,
	"filter" jsonb,
	"field_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "frontline_report_charts_org_section_created_idx" ON "frontline_report_charts" USING btree ("org_id","section","created_at");--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_report_charts');
