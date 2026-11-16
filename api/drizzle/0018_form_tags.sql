ALTER TABLE "frontline_tags" DROP CONSTRAINT "frontline_tags_type_check";--> statement-breakpoint
ALTER TABLE "frontline_forms" ADD COLUMN "tag_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
CREATE INDEX "frontline_forms_tag_ids_idx" ON "frontline_forms" USING gin ("tag_ids");--> statement-breakpoint
ALTER TABLE "frontline_tags" ADD CONSTRAINT "frontline_tags_type_check" CHECK ("frontline_tags"."type" in ('ticket', 'conversation', 'form'));