CREATE TABLE "frontline_form_answers" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"submission_id" text NOT NULL,
	"field_id" text NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "frontline_form_fields" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"form_id" text NOT NULL,
	"type" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"description" text,
	"placeholder" text,
	"options" text[] DEFAULT '{}' NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"allow_search" boolean DEFAULT false NOT NULL,
	"page_number" integer DEFAULT 1 NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"column" integer DEFAULT 1 NOT NULL,
	"validator" jsonb,
	"logic_action" text,
	"logics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_form_fields_column_check" CHECK ("frontline_form_fields"."column" between 1 and 2),
	CONSTRAINT "frontline_form_fields_page_check" CHECK ("frontline_form_fields"."page_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "frontline_form_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"form_id" text NOT NULL,
	"customer_id" text,
	"conversation_id" text,
	"reference_type" text,
	"reference_id" text,
	"link_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_form_submissions_org_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "frontline_forms" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"description" text,
	"button_text" text,
	"code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"appearance" text DEFAULT 'iframe' NOT NULL,
	"load_type" text DEFAULT 'embedded' NOT NULL,
	"primary_color" text,
	"save_as_customer" boolean DEFAULT false NOT NULL,
	"callout_title" text,
	"callout_body" text,
	"callout_button_text" text,
	"callout_image" jsonb,
	"callout_skip" boolean DEFAULT false NOT NULL,
	"thank_title" text,
	"thank_content" text,
	"thank_image" jsonb,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"contacts_gathered" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_forms_org_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "frontline_forms_status_check" CHECK ("frontline_forms"."status" in ('active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "frontline_survey_votes" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"survey_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"message_id" text NOT NULL,
	"voter_id" text NOT NULL,
	"customer_id" text,
	"visitor_id" text,
	"option_ids" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "frontline_surveys" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"title" text NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"rejection_reason" text,
	"duration_hours" integer,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_surveys_org_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "frontline_surveys_status_check" CHECK ("frontline_surveys"."status" in ('pending', 'active', 'rejected', 'archived')),
	CONSTRAINT "frontline_surveys_duration_check" CHECK ("frontline_surveys"."duration_hours" between 1 and 768)
);
--> statement-breakpoint
CREATE TABLE "frontline_public_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"org_of" text NOT NULL,
	"kind" text NOT NULL,
	"target_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- A help center's key is hex; a connected host always has a dot.
INSERT INTO "frontline_public_keys" ("key", "org_of", "kind", "target_id")
SELECT "address", "organization_id", CASE WHEN "address" LIKE '%.%' THEN 'help-center-domain' ELSE 'help-center' END, "help_center_id"
FROM "frontline_public_addresses";--> statement-breakpoint
DROP TABLE "frontline_public_addresses" CASCADE;--> statement-breakpoint
ALTER TABLE "frontline_form_answers" ADD CONSTRAINT "frontline_form_answers_submission_fkey" FOREIGN KEY ("org_id","submission_id") REFERENCES "public"."frontline_form_submissions"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_form_fields" ADD CONSTRAINT "frontline_form_fields_form_fkey" FOREIGN KEY ("org_id","form_id") REFERENCES "public"."frontline_forms"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_form_submissions" ADD CONSTRAINT "frontline_form_submissions_form_fkey" FOREIGN KEY ("org_id","form_id") REFERENCES "public"."frontline_forms"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_forms" ADD CONSTRAINT "frontline_forms_channel_fkey" FOREIGN KEY ("org_id","channel_id") REFERENCES "public"."frontline_channels"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_survey_votes" ADD CONSTRAINT "frontline_survey_votes_survey_fkey" FOREIGN KEY ("org_id","survey_id") REFERENCES "public"."frontline_surveys"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_surveys" ADD CONSTRAINT "frontline_surveys_channel_fkey" FOREIGN KEY ("org_id","channel_id") REFERENCES "public"."frontline_channels"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "frontline_form_answers_org_submission_field_key" ON "frontline_form_answers" USING btree ("org_id","submission_id","field_id");--> statement-breakpoint
CREATE INDEX "frontline_form_answers_org_field_idx" ON "frontline_form_answers" USING btree ("org_id","field_id");--> statement-breakpoint
CREATE INDEX "frontline_form_fields_org_form_idx" ON "frontline_form_fields" USING btree ("org_id","form_id","page_number","order");--> statement-breakpoint
CREATE UNIQUE INDEX "frontline_form_submissions_org_link_key" ON "frontline_form_submissions" USING btree ("org_id","link_id");--> statement-breakpoint
CREATE INDEX "frontline_form_submissions_org_form_created_idx" ON "frontline_form_submissions" USING btree ("org_id","form_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "frontline_form_submissions_org_customer_idx" ON "frontline_form_submissions" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "frontline_forms_org_code_key" ON "frontline_forms" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "frontline_forms_org_created_idx" ON "frontline_forms" USING btree ("org_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "frontline_survey_votes_org_message_voter_key" ON "frontline_survey_votes" USING btree ("org_id","message_id","voter_id");--> statement-breakpoint
CREATE INDEX "frontline_survey_votes_org_survey_idx" ON "frontline_survey_votes" USING btree ("org_id","survey_id");--> statement-breakpoint
CREATE UNIQUE INDEX "frontline_surveys_org_code_key" ON "frontline_surveys" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "frontline_surveys_org_created_idx" ON "frontline_surveys" USING btree ("org_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "frontline_public_keys_kind_target_key" ON "frontline_public_keys" USING btree ("kind","target_id");--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_forms');--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_form_fields');--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_form_submissions');--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_form_answers');--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_surveys');--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_survey_votes');