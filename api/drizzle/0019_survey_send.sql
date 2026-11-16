CREATE TABLE "frontline_survey_tickets" (
	"org_id" text NOT NULL,
	"survey_id" text NOT NULL,
	"option_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_survey_tickets_pkey" PRIMARY KEY("org_id","survey_id","option_id")
);
--> statement-breakpoint
ALTER TABLE "frontline_messages" ADD COLUMN "survey_id" text;--> statement-breakpoint
ALTER TABLE "frontline_survey_tickets" ADD CONSTRAINT "frontline_survey_tickets_survey_fkey" FOREIGN KEY ("org_id","survey_id") REFERENCES "public"."frontline_surveys"("org_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_survey_tickets');