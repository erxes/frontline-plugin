CREATE TABLE "frontline_transfer_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "frontline_transfer_requests_org_created_idx" ON "frontline_transfer_requests" USING btree ("org_id","created_at");--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_transfer_requests');