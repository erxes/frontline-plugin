CREATE TABLE "frontline_channel_members" (
	"org_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_channel_members_pkey" PRIMARY KEY("org_id","channel_id","user_id"),
	CONSTRAINT "frontline_channel_members_role_check" CHECK ("frontline_channel_members"."role" in ('admin', 'member'))
);
--> statement-breakpoint
CREATE TABLE "frontline_channels" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "frontline_channel_members_org_user_idx" ON "frontline_channel_members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "frontline_channels_org_name_key" ON "frontline_channels" USING btree ("org_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "frontline_channels_org_id_key" ON "frontline_channels" USING btree ("org_id","id");--> statement-breakpoint
ALTER TABLE "frontline_channel_members" ADD CONSTRAINT "frontline_channel_members_channel_fkey" FOREIGN KEY ("org_id","channel_id") REFERENCES "public"."frontline_channels"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_channels');--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_channel_members');