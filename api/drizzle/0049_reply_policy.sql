CREATE TABLE "frontline_member_availability" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_member_availability_pkey" PRIMARY KEY("org_id","user_id"),
	CONSTRAINT "frontline_member_availability_status_check" CHECK ("frontline_member_availability"."status" in ('available', 'away'))
);
--> statement-breakpoint
ALTER TABLE "frontline_channels" ADD COLUMN "reply_policy" jsonb DEFAULT '{"autoAssign":false}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "frontline_conversations" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "frontline_conversations" ADD COLUMN "waiting_since" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "frontline_conversations" ADD COLUMN "reply_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "frontline_conversations" ADD COLUMN "reply_warned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "frontline_conversations" ADD COLUMN "reply_breached_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "frontline_messages" ADD COLUMN "waited_seconds" integer;--> statement-breakpoint
ALTER TABLE "frontline_messages" ADD COLUMN "reply_on_time" boolean;--> statement-breakpoint
CREATE INDEX "frontline_conversations_org_waiting_idx" ON "frontline_conversations" USING btree ("org_id","waiting_since") WHERE "frontline_conversations"."waiting_since" is not null;--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_member_availability');
