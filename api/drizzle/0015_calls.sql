CREATE TABLE "frontline_call_legs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"call_id" text NOT NULL,
	"leg_id" text NOT NULL,
	"cdr" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_call_legs_org_call_leg_key" UNIQUE("org_id","call_id","leg_id")
);
--> statement-breakpoint
CREATE TABLE "frontline_call_operators" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"account_id" text NOT NULL,
	"user_id" text NOT NULL,
	"extension" text NOT NULL,
	"status" text DEFAULT 'unavailable' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_call_operators_org_account_user_key" UNIQUE("org_id","account_id","user_id"),
	CONSTRAINT "frontline_call_operators_org_account_extension_key" UNIQUE("org_id","account_id","extension"),
	CONSTRAINT "frontline_call_operators_status_check" CHECK ("frontline_call_operators"."status" in ('unavailable', 'available', 'paused'))
);
--> statement-breakpoint
CREATE TABLE "frontline_call_queues" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"account_id" text NOT NULL,
	"queue" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"total_calls" integer DEFAULT 0 NOT NULL,
	"answered_calls" integer DEFAULT 0 NOT NULL,
	"abandoned_calls" integer DEFAULT 0 NOT NULL,
	"transferred_calls" integer DEFAULT 0 NOT NULL,
	"avg_wait" real DEFAULT 0 NOT NULL,
	"avg_talk" real DEFAULT 0 NOT NULL,
	"sla_rate" real DEFAULT 0 NOT NULL,
	"stats_at" timestamp with time zone,
	"live" jsonb,
	"live_at" timestamp with time zone,
	CONSTRAINT "frontline_call_queues_org_account_queue_key" UNIQUE("org_id","account_id","queue")
);
--> statement-breakpoint
CREATE TABLE "frontline_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"account_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"call_key" text NOT NULL,
	"direction" text NOT NULL,
	"status" text DEFAULT 'ringing' NOT NULL,
	"customer_phone" text NOT NULL,
	"number" text DEFAULT '' NOT NULL,
	"queue" text,
	"extension" text,
	"answered_by" text,
	"started_at" timestamp with time zone NOT NULL,
	"answered_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_sec" integer,
	"recording" jsonb,
	"recording_file" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_calls_org_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "frontline_calls_org_account_key_key" UNIQUE("org_id","account_id","call_key"),
	CONSTRAINT "frontline_calls_direction_check" CHECK ("frontline_calls"."direction" in ('incoming', 'outgoing')),
	CONSTRAINT "frontline_calls_status_check" CHECK ("frontline_calls"."status" in ('ringing', 'active', 'answered', 'missed', 'busy', 'failed', 'voicemail'))
);
--> statement-breakpoint
ALTER TABLE "frontline_integration_accounts" DROP CONSTRAINT "frontline_integration_accounts_provider_check";--> statement-breakpoint
ALTER TABLE "frontline_call_legs" ADD CONSTRAINT "frontline_call_legs_call_fkey" FOREIGN KEY ("org_id","call_id") REFERENCES "public"."frontline_calls"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_call_operators" ADD CONSTRAINT "frontline_call_operators_account_fkey" FOREIGN KEY ("org_id","account_id") REFERENCES "public"."frontline_integration_accounts"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_call_queues" ADD CONSTRAINT "frontline_call_queues_account_fkey" FOREIGN KEY ("org_id","account_id") REFERENCES "public"."frontline_integration_accounts"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_calls" ADD CONSTRAINT "frontline_calls_account_fkey" FOREIGN KEY ("org_id","account_id") REFERENCES "public"."frontline_integration_accounts"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_calls" ADD CONSTRAINT "frontline_calls_conversation_fkey" FOREIGN KEY ("org_id","conversation_id") REFERENCES "public"."frontline_conversations"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "frontline_call_operators_org_user_idx" ON "frontline_call_operators" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "frontline_calls_org_started_idx" ON "frontline_calls" USING btree ("org_id","started_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "frontline_calls_org_customer_idx" ON "frontline_calls" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE INDEX "frontline_calls_org_conversation_idx" ON "frontline_calls" USING btree ("org_id","conversation_id");--> statement-breakpoint
ALTER TABLE "frontline_integration_accounts" ADD CONSTRAINT "frontline_integration_accounts_provider_check" CHECK ("frontline_integration_accounts"."provider" in ('facebook', 'instagram', 'telegram', 'discord', 'mail', 'call', 'callpro'));
--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_call_operators');
--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_call_queues');
--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_calls');
--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_call_legs');