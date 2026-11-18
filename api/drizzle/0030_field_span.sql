ALTER TABLE "frontline_form_fields" ALTER COLUMN "column" SET DEFAULT 2;--> statement-breakpoint
-- "column" was 1 for full width and 2 for half. It is now the span old erxes stored, 2 full and
-- 1 half. Flips every organisation's fields: the plugin owns the table, so without FORCE
-- row-level security its role sees every row until FORCE is back, in this transaction.
ALTER TABLE "frontline_form_fields" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "frontline_form_fields" SET "column" = 3 - "column";--> statement-breakpoint
ALTER TABLE "frontline_form_fields" FORCE ROW LEVEL SECURITY;
