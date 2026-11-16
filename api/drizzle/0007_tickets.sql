CREATE TABLE "frontline_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"pipeline_id" text NOT NULL,
	"status_id" text NOT NULL,
	"number" text,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"assignee_id" text,
	"start_date" timestamp with time zone,
	"target_date" timestamp with time zone,
	"state" text DEFAULT 'active' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status_changed_by" text,
	"first_response_due_at" timestamp with time zone,
	"resolution_due_at" timestamp with time zone,
	"first_responded_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_tickets_priority_check" CHECK ("frontline_tickets"."priority" between 0 and 4),
	CONSTRAINT "frontline_tickets_state_check" CHECK ("frontline_tickets"."state" in ('active', 'archived'))
);
--> statement-breakpoint
ALTER TABLE "frontline_pipeline_statuses" ADD CONSTRAINT "frontline_pipeline_statuses_org_pipeline_id_key" UNIQUE("org_id","pipeline_id","id");--> statement-breakpoint
ALTER TABLE "frontline_pipelines" ADD CONSTRAINT "frontline_pipelines_org_channel_id_key" UNIQUE("org_id","channel_id","id");--> statement-breakpoint
ALTER TABLE "frontline_tickets" ADD CONSTRAINT "frontline_tickets_channel_fkey" FOREIGN KEY ("org_id","channel_id") REFERENCES "public"."frontline_channels"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_tickets" ADD CONSTRAINT "frontline_tickets_pipeline_fkey" FOREIGN KEY ("org_id","channel_id","pipeline_id") REFERENCES "public"."frontline_pipelines"("org_id","channel_id","id") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "frontline_tickets" ADD CONSTRAINT "frontline_tickets_status_fkey" FOREIGN KEY ("org_id","pipeline_id","status_id") REFERENCES "public"."frontline_pipeline_statuses"("org_id","pipeline_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "frontline_tickets_org_pipeline_number_key" ON "frontline_tickets" USING btree ("org_id","pipeline_id","number");--> statement-breakpoint
CREATE INDEX "frontline_tickets_org_pipeline_status_idx" ON "frontline_tickets" USING btree ("org_id","pipeline_id","status_id");--> statement-breakpoint
CREATE INDEX "frontline_tickets_org_updated_idx" ON "frontline_tickets" USING btree ("org_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "frontline_tickets_org_channel_idx" ON "frontline_tickets" USING btree ("org_id","channel_id");--> statement-breakpoint
CREATE INDEX "frontline_tickets_org_assignee_idx" ON "frontline_tickets" USING btree ("org_id","assignee_id");--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_tickets');