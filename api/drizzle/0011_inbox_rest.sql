CREATE TABLE "frontline_visitors" (
	"org_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"integration_id" text NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"session_count" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"browser" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"remote_address" text,
	CONSTRAINT "frontline_visitors_pkey" PRIMARY KEY("org_id","customer_id")
);
--> statement-breakpoint
ALTER TABLE "frontline_conversations" ADD COLUMN "operator" text DEFAULT 'bot' NOT NULL;--> statement-breakpoint
CREATE INDEX "frontline_visitors_org_integration_idx" ON "frontline_visitors" USING btree ("org_id","integration_id");--> statement-breakpoint
ALTER TABLE "frontline_conversations" ADD CONSTRAINT "frontline_conversations_operator_check" CHECK ("frontline_conversations"."operator" in ('bot', 'person'));--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_visitors');