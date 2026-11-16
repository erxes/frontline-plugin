CREATE TABLE "frontline_conversation_tags" (
	"org_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "frontline_conversation_tags_pkey" PRIMARY KEY("org_id","conversation_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "frontline_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"integration_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"external_id" text,
	"status" text DEFAULT 'new' NOT NULL,
	"assignee_id" text,
	"participant_ids" text[] DEFAULT '{}' NOT NULL,
	"read_by" text[] DEFAULT '{}' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"customer_responded_last" boolean DEFAULT true NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_responded_at" timestamp with time zone,
	"first_responded_by" text,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_conversations_org_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "frontline_conversations_status_check" CHECK ("frontline_conversations"."status" in ('new', 'open', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "frontline_customer_links" (
	"org_id" text NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_customer_links_pkey" PRIMARY KEY("org_id","source","external_id")
);
--> statement-breakpoint
CREATE TABLE "frontline_integrations" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_integrations_org_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "frontline_integrations_org_channel_id_key" UNIQUE("org_id","channel_id","id")
);
--> statement-breakpoint
CREATE TABLE "frontline_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"internal" boolean DEFAULT false NOT NULL,
	"customer_id" text,
	"user_id" text,
	"mentioned_user_ids" text[] DEFAULT '{}' NOT NULL,
	"reply_to_id" text,
	"external_id" text,
	"delivery_status" text,
	"provider_data" jsonb,
	"customer_read_at" timestamp with time zone,
	"pinned_at" timestamp with time zone,
	"pinned_by" text,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_messages_author_check" CHECK ("frontline_messages"."customer_id" is null or "frontline_messages"."user_id" is null),
	CONSTRAINT "frontline_messages_delivery_status_check" CHECK ("frontline_messages"."delivery_status" in ('queued', 'sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "frontline_tags" ADD CONSTRAINT "frontline_tags_org_id_key" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "frontline_conversation_tags" ADD CONSTRAINT "frontline_conversation_tags_conversation_fkey" FOREIGN KEY ("org_id","conversation_id") REFERENCES "public"."frontline_conversations"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_conversation_tags" ADD CONSTRAINT "frontline_conversation_tags_tag_fkey" FOREIGN KEY ("org_id","tag_id") REFERENCES "public"."frontline_tags"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_conversations" ADD CONSTRAINT "frontline_conversations_integration_fkey" FOREIGN KEY ("org_id","channel_id","integration_id") REFERENCES "public"."frontline_integrations"("org_id","channel_id","id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "frontline_integrations" ADD CONSTRAINT "frontline_integrations_channel_fkey" FOREIGN KEY ("org_id","channel_id") REFERENCES "public"."frontline_channels"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_messages" ADD CONSTRAINT "frontline_messages_conversation_fkey" FOREIGN KEY ("org_id","conversation_id") REFERENCES "public"."frontline_conversations"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_messages" ADD CONSTRAINT "frontline_messages_reply_to_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "public"."frontline_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "frontline_conversation_tags_org_tag_idx" ON "frontline_conversation_tags" USING btree ("org_id","tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "frontline_conversations_org_integration_external_key" ON "frontline_conversations" USING btree ("org_id","integration_id","external_id");--> statement-breakpoint
CREATE INDEX "frontline_conversations_org_last_message_idx" ON "frontline_conversations" USING btree ("org_id","last_message_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "frontline_conversations_org_channel_status_idx" ON "frontline_conversations" USING btree ("org_id","channel_id","status");--> statement-breakpoint
CREATE INDEX "frontline_conversations_org_customer_idx" ON "frontline_conversations" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE INDEX "frontline_conversations_org_assignee_idx" ON "frontline_conversations" USING btree ("org_id","assignee_id");--> statement-breakpoint
CREATE INDEX "frontline_customer_links_org_customer_idx" ON "frontline_customer_links" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE INDEX "frontline_integrations_org_channel_idx" ON "frontline_integrations" USING btree ("org_id","channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "frontline_messages_org_conversation_external_key" ON "frontline_messages" USING btree ("org_id","conversation_id","external_id");--> statement-breakpoint
CREATE INDEX "frontline_messages_org_conversation_created_idx" ON "frontline_messages" USING btree ("org_id","conversation_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "frontline_messages_reply_to_idx" ON "frontline_messages" USING btree ("reply_to_id");--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_integrations');--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_conversations');--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_messages');--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_customer_links');--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_conversation_tags');