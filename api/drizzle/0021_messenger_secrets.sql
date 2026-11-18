CREATE TABLE "frontline_messenger_secrets" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"integration_id" text NOT NULL,
	"secret" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_messenger_secrets_org_integration_key" UNIQUE("org_id","integration_id")
);
--> statement-breakpoint
ALTER TABLE "frontline_messenger_secrets" ADD CONSTRAINT "frontline_messenger_secrets_integration_fkey" FOREIGN KEY ("org_id","integration_id") REFERENCES "public"."frontline_integrations"("org_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_messenger_secrets');