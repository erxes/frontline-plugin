DROP INDEX "frontline_knowledgebase_articles_org_category_created_idx";--> statement-breakpoint
DROP INDEX "frontline_response_templates_org_channel_created_idx";--> statement-breakpoint
DROP INDEX "frontline_pipelines_org_channel_created_idx";--> statement-breakpoint
DROP INDEX "frontline_tickets_org_updated_idx";--> statement-breakpoint
DROP INDEX "frontline_tickets_org_pipeline_updated_idx";--> statement-breakpoint
DROP INDEX "frontline_tickets_org_pipeline_created_idx";--> statement-breakpoint
DROP INDEX "frontline_help_centers_org_created_idx";--> statement-breakpoint
DROP INDEX "frontline_form_submissions_org_form_created_idx";--> statement-breakpoint
DROP INDEX "frontline_forms_org_created_idx";--> statement-breakpoint
DROP INDEX "frontline_surveys_org_created_idx";--> statement-breakpoint
DROP INDEX "frontline_conversations_org_last_message_idx";--> statement-breakpoint
DROP INDEX "frontline_messages_org_conversation_created_idx";--> statement-breakpoint
DROP INDEX "frontline_calls_org_started_idx";--> statement-breakpoint
CREATE INDEX "frontline_conversations_org_open_last_message_idx" ON "frontline_conversations" USING btree ("org_id","last_message_at","id") WHERE "frontline_conversations"."status" <> 'resolved';--> statement-breakpoint
CREATE INDEX "frontline_knowledgebase_articles_org_category_created_idx" ON "frontline_knowledgebase_articles" USING btree ("org_id","category_id","created_at","id");--> statement-breakpoint
CREATE INDEX "frontline_response_templates_org_channel_created_idx" ON "frontline_response_templates" USING btree ("org_id","channel_id","created_at","id");--> statement-breakpoint
CREATE INDEX "frontline_pipelines_org_channel_created_idx" ON "frontline_pipelines" USING btree ("org_id","channel_id","created_at","id");--> statement-breakpoint
CREATE INDEX "frontline_tickets_org_updated_idx" ON "frontline_tickets" USING btree ("org_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "frontline_tickets_org_pipeline_updated_idx" ON "frontline_tickets" USING btree ("org_id","pipeline_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "frontline_tickets_org_pipeline_created_idx" ON "frontline_tickets" USING btree ("org_id","pipeline_id","created_at","id");--> statement-breakpoint
CREATE INDEX "frontline_help_centers_org_created_idx" ON "frontline_help_centers" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE INDEX "frontline_form_submissions_org_form_created_idx" ON "frontline_form_submissions" USING btree ("org_id","form_id","created_at","id");--> statement-breakpoint
CREATE INDEX "frontline_forms_org_created_idx" ON "frontline_forms" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE INDEX "frontline_surveys_org_created_idx" ON "frontline_surveys" USING btree ("org_id","created_at","id");--> statement-breakpoint
CREATE INDEX "frontline_conversations_org_last_message_idx" ON "frontline_conversations" USING btree ("org_id","last_message_at","id");--> statement-breakpoint
CREATE INDEX "frontline_messages_org_conversation_created_idx" ON "frontline_messages" USING btree ("org_id","conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "frontline_calls_org_started_idx" ON "frontline_calls" USING btree ("org_id","started_at","id");