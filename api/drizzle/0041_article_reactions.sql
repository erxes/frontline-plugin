CREATE TABLE "frontline_knowledgebase_article_reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"article_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"choice" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "frontline_knowledgebase_article_reactions" ADD CONSTRAINT "frontline_knowledgebase_article_reactions_article_fkey" FOREIGN KEY ("article_id") REFERENCES "public"."frontline_knowledgebase_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "frontline_knowledgebase_article_reactions_org_article_customer_idx" ON "frontline_knowledgebase_article_reactions" USING btree ("org_id","article_id","customer_id");--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_knowledgebase_article_reactions');