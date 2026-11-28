-- Tickets and conversations as Data Extensions objects (the manifest's `objects`,
-- src/fields.ts): members add fields to them in core, the record keeps the values in
-- `properties_data` by field id, and core reads them here as `custom_fields`, with the
-- record's own columns for formulas and rollups. They read as their owner, this plugin's
-- role, so the tables' row level security keeps each organisation's. Choices read as the UI
-- shows them, as in 0018_customer_relations.sql.

CREATE VIEW "frontline_ticket_fields" AS
SELECT
  t."org_id",
  t."id",
  t."number",
  t."name",
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
  t."start_date",
  t."target_date",
  t."resolved_at",
  t."properties_data" AS "custom_fields"
FROM "frontline_tickets" t
JOIN "frontline_pipeline_statuses" s ON s."org_id" = t."org_id" AND s."id" = t."status_id"
JOIN "frontline_pipelines" p ON p."org_id" = t."org_id" AND p."id" = t."pipeline_id";
--> statement-breakpoint
CREATE VIEW "frontline_conversation_fields" AS
SELECT
  c."org_id",
  c."id",
  ch."name" AS "channel",
  i."name" AS "integration",
  CASE c."status" WHEN 'new' THEN 'New' WHEN 'open' THEN 'Open' WHEN 'resolved' THEN 'Resolved' END AS "status",
  c."assignee_id" AS "assignee",
  c."message_count" AS "messages",
  c."last_message_at",
  c."created_at",
  c."properties_data" AS "custom_fields"
FROM "frontline_conversations" c
JOIN "frontline_integrations" i ON i."org_id" = c."org_id" AND i."id" = c."integration_id"
JOIN "frontline_channels" ch ON ch."org_id" = c."org_id" AND ch."id" = c."channel_id";
--> statement-breakpoint
GRANT SELECT ON "frontline_ticket_fields", "frontline_conversation_fields" TO erxes_core_reader;
