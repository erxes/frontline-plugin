CREATE TABLE "frontline_ticket_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"ticket_id" text NOT NULL,
	"body" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "frontline_ticket_comments" ADD CONSTRAINT "frontline_ticket_comments_ticket_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."frontline_tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "frontline_ticket_comments_org_ticket_created_idx" ON "frontline_ticket_comments" USING btree ("org_id","ticket_id","created_at");--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_ticket_comments');