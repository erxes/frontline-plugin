ALTER TABLE "frontline_pipelines" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "frontline_pipelines" ADD COLUMN "member_ids" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "frontline_pipelines" ADD CONSTRAINT "frontline_pipelines_visibility_check" CHECK ("frontline_pipelines"."visibility" in ('public', 'private'));