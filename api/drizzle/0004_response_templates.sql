CREATE TABLE "frontline_response_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"name" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "frontline_response_templates" ADD CONSTRAINT "frontline_response_templates_channel_fkey" FOREIGN KEY ("org_id","channel_id") REFERENCES "public"."frontline_channels"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "frontline_response_templates_org_channel_created_idx" ON "frontline_response_templates" USING btree ("org_id","channel_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_response_templates');