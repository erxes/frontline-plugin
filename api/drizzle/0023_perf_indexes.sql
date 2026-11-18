ALTER TABLE "frontline_pipelines" ADD COLUMN "last_number" bigint;--> statement-breakpoint
ALTER TABLE "frontline_pipelines" ADD COLUMN "last_number_prefix" text;--> statement-breakpoint
ALTER TABLE "frontline_conversations" ADD COLUMN "mentioned_user_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX "frontline_knowledgebase_articles_search_trgm_idx" ON "frontline_knowledgebase_articles" USING gin ("title" gin_trgm_ops,"summary" gin_trgm_ops,"content" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "frontline_tickets_org_pipeline_updated_idx" ON "frontline_tickets" USING btree ("org_id","pipeline_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "frontline_tickets_org_pipeline_created_idx" ON "frontline_tickets" USING btree ("org_id","pipeline_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "frontline_tickets_org_first_response_due_idx" ON "frontline_tickets" USING btree ("org_id","first_response_due_at") WHERE "frontline_tickets"."state" = 'active' and "frontline_tickets"."first_responded_at" is null and "frontline_tickets"."first_response_breached_at" is null;--> statement-breakpoint
CREATE INDEX "frontline_tickets_org_resolution_due_idx" ON "frontline_tickets" USING btree ("org_id","resolution_due_at") WHERE "frontline_tickets"."state" = 'active' and "frontline_tickets"."resolved_at" is null and "frontline_tickets"."resolution_breached_at" is null;--> statement-breakpoint
CREATE INDEX "frontline_tickets_search_trgm_idx" ON "frontline_tickets" USING gin ("name" gin_trgm_ops,"number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "frontline_form_answers_value_trgm_idx" ON "frontline_form_answers" USING gin (("value"::text) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "frontline_conversations_org_channel_open_idx" ON "frontline_conversations" USING btree ("org_id","channel_id") WHERE "frontline_conversations"."status" <> 'resolved';--> statement-breakpoint
CREATE INDEX "frontline_conversations_org_created_idx" ON "frontline_conversations" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "frontline_conversations_mentioned_user_ids_idx" ON "frontline_conversations" USING gin ("mentioned_user_ids");--> statement-breakpoint
CREATE INDEX "frontline_conversations_content_trgm_idx" ON "frontline_conversations" USING gin ("content" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "frontline_messages_org_created_idx" ON "frontline_messages" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "frontline_calls_customer_phone_trgm_idx" ON "frontline_calls" USING gin ("customer_phone" gin_trgm_ops);--> statement-breakpoint
-- Backfills across every organisation. The plugin owns these tables, so without FORCE
-- row-level security its role sees every row until FORCE is back, in this transaction.
ALTER TABLE "frontline_conversations" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "frontline_messages" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "frontline_pipelines" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "frontline_tickets" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "frontline_conversations" c SET "mentioned_user_ids" = m."ids"
FROM (
  SELECT "conversation_id", array_agg(DISTINCT u."mentioned" ORDER BY u."mentioned") AS "ids"
  FROM "frontline_messages", unnest("mentioned_user_ids") AS u("mentioned")
  GROUP BY "conversation_id"
) m
WHERE m."conversation_id" = c."id";--> statement-breakpoint
UPDATE "frontline_pipelines" p SET
  "last_number_prefix" = n."prefix",
  "last_number" = (
    SELECT max(substring(t."number" FROM length(n."prefix") + 1)::bigint)
    FROM "frontline_tickets" t
    WHERE t."pipeline_id" = p."id"
      AND starts_with(t."number", n."prefix")
      AND substring(t."number" FROM length(n."prefix") + 1) ~ '^[0-9]{1,15}$'
  )
FROM (
  SELECT "id", replace(replace(replace(coalesce("number_config", ''),
    '{year}', to_char(now() AT TIME ZONE 'UTC', 'YYYY')),
    '{month}', to_char(now() AT TIME ZONE 'UTC', 'MM')),
    '{day}', to_char(now() AT TIME ZONE 'UTC', 'DD')) AS "prefix"
  FROM "frontline_pipelines"
  WHERE "number_size" IS NOT NULL
) n
WHERE n."id" = p."id";--> statement-breakpoint
ALTER TABLE "frontline_conversations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "frontline_messages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "frontline_pipelines" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "frontline_tickets" FORCE ROW LEVEL SECURITY;