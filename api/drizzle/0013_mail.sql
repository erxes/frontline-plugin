CREATE TABLE "frontline_email_suppressions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"address" text NOT NULL,
	"reason" text NOT NULL,
	"detail" text,
	"account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_email_suppressions_org_address_key" UNIQUE("org_id","address"),
	CONSTRAINT "frontline_email_suppressions_reason_check" CHECK ("frontline_email_suppressions"."reason" in ('bounce', 'complaint'))
);
--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_email_suppressions');
