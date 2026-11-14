CREATE TABLE "frontline_knowledgebase_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"category_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"content" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"is_private" boolean DEFAULT false NOT NULL,
	"reaction_choices" text[] DEFAULT '{}' NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"image" jsonb,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pdf_attachment" jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_knowledgebase_articles_status_check" CHECK ("frontline_knowledgebase_articles"."status" in ('draft', 'publish', 'scheduled', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "frontline_knowledgebase_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"topic_id" text NOT NULL,
	"parent_id" text,
	"title" text NOT NULL,
	"description" text,
	"code" text,
	"icon" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_knowledgebase_categories_org_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "frontline_knowledgebase_topics" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"code" text,
	"color" text,
	"background_image" text,
	"language_code" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_knowledgebase_topics_org_id_key" UNIQUE("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "frontline_knowledgebase_articles" ADD CONSTRAINT "frontline_knowledgebase_articles_category_fkey" FOREIGN KEY ("org_id","category_id") REFERENCES "public"."frontline_knowledgebase_categories"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_knowledgebase_categories" ADD CONSTRAINT "frontline_knowledgebase_categories_topic_fkey" FOREIGN KEY ("org_id","topic_id") REFERENCES "public"."frontline_knowledgebase_topics"("org_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "frontline_knowledgebase_categories" ADD CONSTRAINT "frontline_knowledgebase_categories_parent_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."frontline_knowledgebase_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "frontline_knowledgebase_articles_org_category_created_idx" ON "frontline_knowledgebase_articles" USING btree ("org_id","category_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "frontline_knowledgebase_articles_org_scheduled_idx" ON "frontline_knowledgebase_articles" USING btree ("org_id","scheduled_at") WHERE "frontline_knowledgebase_articles"."status" = 'scheduled';--> statement-breakpoint
CREATE UNIQUE INDEX "frontline_knowledgebase_categories_org_code_key" ON "frontline_knowledgebase_categories" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "frontline_knowledgebase_categories_org_topic_idx" ON "frontline_knowledgebase_categories" USING btree ("org_id","topic_id");--> statement-breakpoint
CREATE INDEX "frontline_knowledgebase_categories_parent_idx" ON "frontline_knowledgebase_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "frontline_knowledgebase_topics_org_code_key" ON "frontline_knowledgebase_topics" USING btree ("org_id","code");--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_knowledgebase_topics');--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_knowledgebase_categories');--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_knowledgebase_articles');