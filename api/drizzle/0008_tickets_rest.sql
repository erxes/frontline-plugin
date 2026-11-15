CREATE TABLE "frontline_ticket_properties" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"options" text[] DEFAULT '{}' NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"pipeline_ids" text[] DEFAULT '{}' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_ticket_properties_type_check" CHECK ("frontline_ticket_properties"."type" in ('text', 'textarea', 'number', 'date', 'select', 'multiselect', 'boolean'))
);
--> statement-breakpoint
CREATE TABLE "frontline_team_members" (
	"org_id" text NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_team_members_pkey" PRIMARY KEY("org_id","team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "frontline_teams" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"parent_id" text,
	"supervisor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_teams_org_id_key" UNIQUE("org_id","id"),
	CONSTRAINT "frontline_teams_kind_check" CHECK ("frontline_teams"."kind" in ('department', 'branch'))
);
--> statement-breakpoint
CREATE TABLE "frontline_tags" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"color_code" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_tags_type_check" CHECK ("frontline_tags"."type" in ('ticket', 'conversation'))
);
--> statement-breakpoint
ALTER TABLE "frontline_pipeline_statuses" ADD COLUMN "visibility_type" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "frontline_pipeline_statuses" ADD COLUMN "member_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "frontline_pipeline_statuses" ADD COLUMN "can_edit_member_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "frontline_pipeline_statuses" ADD COLUMN "can_move_member_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "frontline_pipelines" ADD COLUMN "is_check_user" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "frontline_pipelines" ADD COLUMN "is_check_department" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "frontline_pipelines" ADD COLUMN "is_check_branch" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "frontline_pipelines" ADD COLUMN "exclude_check_user_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "frontline_tickets" ADD COLUMN "assigned_member_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "frontline_tickets" ADD COLUMN "subscribed_user_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "frontline_tickets" ADD COLUMN "tag_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "frontline_tickets" ADD COLUMN "properties_data" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "frontline_tickets" ADD COLUMN "branch_id" text;--> statement-breakpoint
ALTER TABLE "frontline_tickets" ADD COLUMN "department_id" text;--> statement-breakpoint
ALTER TABLE "frontline_tickets" ADD COLUMN "customer_id" text;--> statement-breakpoint
ALTER TABLE "frontline_tickets" ADD COLUMN "company_id" text;--> statement-breakpoint
ALTER TABLE "frontline_tickets" ADD COLUMN "first_response_warned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "frontline_tickets" ADD COLUMN "first_response_breached_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "frontline_tickets" ADD COLUMN "resolution_warned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "frontline_tickets" ADD COLUMN "resolution_breached_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "frontline_team_members" ADD CONSTRAINT "frontline_team_members_team_fkey" FOREIGN KEY ("org_id","team_id") REFERENCES "public"."frontline_teams"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_teams" ADD CONSTRAINT "frontline_teams_parent_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."frontline_teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "frontline_ticket_properties_org_order_idx" ON "frontline_ticket_properties" USING btree ("org_id","order");--> statement-breakpoint
CREATE INDEX "frontline_team_members_org_user_idx" ON "frontline_team_members" USING btree ("org_id","user_id");--> statement-breakpoint
CREATE INDEX "frontline_teams_org_kind_name_idx" ON "frontline_teams" USING btree ("org_id","kind","name");--> statement-breakpoint
CREATE INDEX "frontline_teams_parent_idx" ON "frontline_teams" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "frontline_tags_org_type_name_key" ON "frontline_tags" USING btree ("org_id","type",lower("name"));--> statement-breakpoint
CREATE INDEX "frontline_tickets_org_customer_idx" ON "frontline_tickets" USING btree ("org_id","customer_id");--> statement-breakpoint
CREATE INDEX "frontline_tickets_org_company_idx" ON "frontline_tickets" USING btree ("org_id","company_id");--> statement-breakpoint
CREATE INDEX "frontline_tickets_tag_ids_idx" ON "frontline_tickets" USING gin ("tag_ids");--> statement-breakpoint
ALTER TABLE "frontline_pipeline_statuses" ADD CONSTRAINT "frontline_pipeline_statuses_visibility_check" CHECK ("frontline_pipeline_statuses"."visibility_type" in ('public', 'private'));--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_ticket_properties');
--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_team_members');
--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_teams');
--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_tags');
