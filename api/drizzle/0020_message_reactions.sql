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
ALTER TABLE "frontline_message_reactions" ADD CONSTRAINT "frontline_message_reactions_message_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."frontline_messages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_message_reactions');