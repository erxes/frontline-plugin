CREATE TABLE "frontline_survey_tickets" (
	"org_id" text NOT NULL,
	"survey_id" text NOT NULL,
	"option_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_survey_tickets_pkey" PRIMARY KEY("org_id","survey_id","option_id")
);
--> statement-breakpoint
CREATE TABLE "frontline_message_reactions" (
	"org_id" text NOT NULL,
	"message_id" text NOT NULL,
	"user_id" text,
	"customer_id" text,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_message_reactions_reactor_key" UNIQUE NULLS NOT DISTINCT("org_id","message_id","user_id","customer_id","emoji"),
	CONSTRAINT "frontline_message_reactions_reactor_check" CHECK (("frontline_message_reactions"."user_id" is null) <> ("frontline_message_reactions"."customer_id" is null))
);
--> statement-breakpoint
ALTER TABLE "frontline_tags" DROP CONSTRAINT "frontline_tags_type_check";--> statement-breakpoint
ALTER TABLE "frontline_forms" ADD COLUMN "tag_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "frontline_conversations" ADD COLUMN "properties_data" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "frontline_messages" ADD COLUMN "survey_id" text;--> statement-breakpoint
ALTER TABLE "frontline_call_operators" ADD COLUMN "sip_secret" text;--> statement-breakpoint
ALTER TABLE "frontline_survey_tickets" ADD CONSTRAINT "frontline_survey_tickets_survey_fkey" FOREIGN KEY ("org_id","survey_id") REFERENCES "public"."frontline_surveys"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_message_reactions" ADD CONSTRAINT "frontline_message_reactions_message_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."frontline_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "frontline_forms_tag_ids_idx" ON "frontline_forms" USING gin ("tag_ids");--> statement-breakpoint
ALTER TABLE "frontline_tags" ADD CONSTRAINT "frontline_tags_type_check" CHECK ("frontline_tags"."type" in ('ticket', 'conversation', 'form'));
--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_survey_tickets');
--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_message_reactions');