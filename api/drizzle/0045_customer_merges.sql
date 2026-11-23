CREATE TABLE "frontline_customer_merges" (
	"org_id" text NOT NULL,
	"merged_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_customer_merges_pkey" PRIMARY KEY("org_id","merged_id")
);
--> statement-breakpoint
CREATE INDEX "frontline_customer_merges_org_customer_idx" ON "frontline_customer_merges" USING btree ("org_id","customer_id");--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_customer_merges');