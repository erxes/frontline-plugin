CREATE TABLE "frontline_contact_merges" (
	"org_id" text NOT NULL,
	"kind" text NOT NULL,
	"merged_id" text NOT NULL,
	"kept_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "frontline_contact_merges_pkey" PRIMARY KEY("org_id","kind","merged_id"),
	CONSTRAINT "frontline_contact_merges_kind_check" CHECK ("frontline_contact_merges"."kind" in ('customer', 'company'))
);
--> statement-breakpoint
CREATE INDEX "frontline_contact_merges_org_kept_idx" ON "frontline_contact_merges" USING btree ("org_id","kind","kept_id");--> statement-breakpoint
SELECT core_enable_tenant_rls('frontline_contact_merges');--> statement-breakpoint
-- A row written with a merged customer or company id names the kept one instead. The shared lock
-- waits for a merge of that id in flight (`modules/contacts/merges.ts` takes it exclusively), so
-- a conversation or link written while core's merge is applied can't keep the deleted id.
-- TG_ARGV: the kind (`customer` or `company`) and the column.
CREATE FUNCTION frontline_follow_merge() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_kind text := TG_ARGV[0];
  v_column text := TG_ARGV[1];
  v_id text := to_jsonb(NEW) ->> v_column;
  v_kept text;
BEGIN
  IF v_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock_shared(hashtextextended(NEW.org_id || ':' || v_kind || ':' || v_id, 0));

  SELECT m.kept_id INTO v_kept FROM frontline_contact_merges m
    WHERE m.org_id = NEW.org_id AND m.kind = v_kind AND m.merged_id = v_id;

  IF v_kept IS NULL THEN
    RETURN NEW;
  END IF;

  RETURN jsonb_populate_record(NEW, jsonb_build_object(v_column, v_kept));
END;
$$;--> statement-breakpoint
CREATE TRIGGER frontline_conversations_follow_merge BEFORE INSERT OR UPDATE OF customer_id ON frontline_conversations FOR EACH ROW EXECUTE FUNCTION frontline_follow_merge('customer', 'customer_id');--> statement-breakpoint
CREATE TRIGGER frontline_messages_follow_merge BEFORE INSERT OR UPDATE OF customer_id ON frontline_messages FOR EACH ROW EXECUTE FUNCTION frontline_follow_merge('customer', 'customer_id');--> statement-breakpoint
CREATE TRIGGER frontline_customer_links_follow_merge BEFORE INSERT OR UPDATE OF customer_id ON frontline_customer_links FOR EACH ROW EXECUTE FUNCTION frontline_follow_merge('customer', 'customer_id');--> statement-breakpoint
CREATE TRIGGER frontline_tickets_follow_customer_merge BEFORE INSERT OR UPDATE OF customer_id ON frontline_tickets FOR EACH ROW EXECUTE FUNCTION frontline_follow_merge('customer', 'customer_id');--> statement-breakpoint
CREATE TRIGGER frontline_tickets_follow_company_merge BEFORE INSERT OR UPDATE OF company_id ON frontline_tickets FOR EACH ROW EXECUTE FUNCTION frontline_follow_merge('company', 'company_id');--> statement-breakpoint
CREATE TRIGGER frontline_calls_follow_merge BEFORE INSERT OR UPDATE OF customer_id ON frontline_calls FOR EACH ROW EXECUTE FUNCTION frontline_follow_merge('customer', 'customer_id');--> statement-breakpoint
CREATE TRIGGER frontline_form_submissions_follow_merge BEFORE INSERT OR UPDATE OF customer_id ON frontline_form_submissions FOR EACH ROW EXECUTE FUNCTION frontline_follow_merge('customer', 'customer_id');--> statement-breakpoint
CREATE TRIGGER frontline_visitors_follow_merge BEFORE INSERT OR UPDATE OF customer_id ON frontline_visitors FOR EACH ROW EXECUTE FUNCTION frontline_follow_merge('customer', 'customer_id');--> statement-breakpoint
CREATE TRIGGER frontline_message_reactions_follow_merge BEFORE INSERT OR UPDATE OF customer_id ON frontline_message_reactions FOR EACH ROW EXECUTE FUNCTION frontline_follow_merge('customer', 'customer_id');--> statement-breakpoint
CREATE TRIGGER frontline_knowledgebase_article_reactions_follow_merge BEFORE INSERT OR UPDATE OF customer_id ON frontline_knowledgebase_article_reactions FOR EACH ROW EXECUTE FUNCTION frontline_follow_merge('customer', 'customer_id');--> statement-breakpoint
CREATE TRIGGER frontline_survey_votes_follow_customer_merge BEFORE INSERT OR UPDATE OF customer_id ON frontline_survey_votes FOR EACH ROW EXECUTE FUNCTION frontline_follow_merge('customer', 'customer_id');--> statement-breakpoint
CREATE TRIGGER frontline_survey_votes_follow_voter_merge BEFORE INSERT OR UPDATE OF voter_id ON frontline_survey_votes FOR EACH ROW EXECUTE FUNCTION frontline_follow_merge('customer', 'voter_id');
