-- Customers' conversations, tickets and form submissions, as core's customer
-- filter reads them (the manifest's `relations`, src/relations.ts):
-- "conversations ≥ 1 where source is Facebook Messenger", "a ticket open over
-- 7 days", "submitted the Contact us form". One row per record; `record_id` is
-- the core customer. They read as their owner, this plugin's role, so the
-- tables' row level security keeps each to the organisation core is filtering.
-- Choices read as the UI shows them; a kind the UI doesn't know keeps its name.

CREATE VIEW "frontline_customer_conversations" AS
SELECT
  c."org_id",
  c."customer_id" AS "record_id",
  ch."name" AS "channel",
  CASE i."kind"
    WHEN 'messenger' THEN 'Messenger'
    WHEN 'facebook' THEN 'Facebook Messenger'
    WHEN 'instagram' THEN 'Instagram'
    WHEN 'telegram' THEN 'Telegram'
    WHEN 'discord' THEN 'Discord'
    WHEN 'mail' THEN 'Email'
    WHEN 'call' THEN 'Phone'
    WHEN 'callpro' THEN 'CallPro'
    ELSE i."kind"
  END AS "source",
  i."name" AS "integration",
  CASE c."status" WHEN 'new' THEN 'New' WHEN 'open' THEN 'Open' WHEN 'resolved' THEN 'Resolved' END AS "status",
  c."assignee_id" AS "assignee",
  c."message_count" AS "messages",
  c."customer_responded_last" AND c."status" <> 'resolved' AS "awaiting_reply",
  c."last_message_at",
  c."created_at"
FROM "frontline_conversations" c
JOIN "frontline_integrations" i ON i."org_id" = c."org_id" AND i."id" = c."integration_id"
JOIN "frontline_channels" ch ON ch."org_id" = c."org_id" AND ch."id" = c."channel_id";
--> statement-breakpoint
CREATE VIEW "frontline_customer_tickets" AS
SELECT
  t."org_id",
  t."customer_id" AS "record_id",
  CASE s."type"
    WHEN 1 THEN 'New'
    WHEN 2 THEN 'Open'
    WHEN 3 THEN 'In progress'
    WHEN 4 THEN 'Resolved'
    WHEN 5 THEN 'Closed'
    WHEN 6 THEN 'Cancelled'
  END AS "stage",
  s."name" AS "status",
  p."name" AS "pipeline",
  CASE t."priority"
    WHEN 0 THEN 'No priority'
    WHEN 1 THEN 'Minor'
    WHEN 2 THEN 'Medium'
    WHEN 3 THEN 'High'
    WHEN 4 THEN 'Critical'
  END AS "priority",
  t."assignee_id" AS "assignee",
  t."created_at",
  t."resolved_at"
FROM "frontline_tickets" t
JOIN "frontline_pipeline_statuses" s ON s."org_id" = t."org_id" AND s."id" = t."status_id"
JOIN "frontline_pipelines" p ON p."org_id" = t."org_id" AND p."id" = t."pipeline_id"
WHERE t."customer_id" IS NOT NULL AND t."state" = 'active';
--> statement-breakpoint
CREATE VIEW "frontline_customer_form_submissions" AS
SELECT
  fs."org_id",
  fs."customer_id" AS "record_id",
  f."name" AS "form",
  fs."created_at" AS "submitted_at"
FROM "frontline_form_submissions" fs
JOIN "frontline_forms" f ON f."org_id" = fs."org_id" AND f."id" = fs."form_id"
WHERE fs."customer_id" IS NOT NULL;
--> statement-breakpoint
-- Core reads them as erxes_core_reader, its role for plugins' views.
GRANT SELECT ON "frontline_customer_conversations", "frontline_customer_tickets",
  "frontline_customer_form_submissions" TO erxes_core_reader;
