CREATE TABLE "frontline_pipeline_statuses" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"pipeline_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#4F46E5' NOT NULL,
	"type" integer NOT NULL,
	"order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_pipeline_statuses_type_check" CHECK ("frontline_pipeline_statuses"."type" between 1 and 6)
);
--> statement-breakpoint
CREATE TABLE "frontline_pipelines" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"number_config" text,
	"number_size" integer,
	"name_config" text,
	"sla_policy" jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_pipelines_org_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "frontline_pipeline_statuses" ADD CONSTRAINT "frontline_pipeline_statuses_pipeline_fkey" FOREIGN KEY ("org_id","pipeline_id") REFERENCES "public"."frontline_pipelines"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_pipelines" ADD CONSTRAINT "frontline_pipelines_channel_fkey" FOREIGN KEY ("org_id","channel_id") REFERENCES "public"."frontline_channels"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "frontline_pipeline_statuses_org_pipeline_type_order_idx" ON "frontline_pipeline_statuses" USING btree ("org_id","pipeline_id","type","order");--> statement-breakpoint
CREATE INDEX "frontline_pipelines_org_channel_created_idx" ON "frontline_pipelines" USING btree ("org_id","channel_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_pipelines');--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_pipeline_statuses');