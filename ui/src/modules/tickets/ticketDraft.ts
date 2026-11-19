import { CustomFieldsPatch } from '@erxes/core-contract';
import { textOf, useConfirm } from 'erxes-ui';
import { useEffect, useEffectEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { draftsOf, useDraft } from '~/shared/drafts.ts';
import { PRIORITIES } from '@/pipelines/queries.ts';
import { useChoices } from './queries.ts';

/**
 * The new ticket being written, kept per member in the tab until it is created or discarded. An
 * empty pipeline takes the opener's, an empty status the pipeline's first.
 */
const ticketDrafts = draftsOf(
  'ticket',
  z.object({
    pipelineId: z.string(),
    statusId: z.string(),
    name: z.string(),
    description: z.string(),
    priority: z.literal(PRIORITIES),
    assigneeId: z.string().nullable(),
    customerId: z.string().nullable(),
    /** The inbox conversation it is made from, and the name and customer that filled in. */
    conversationId: z.string().nullable(),
    opened: z.object({ name: z.string(), customerId: z.string().nullable() }).nullable(),
    startDate: z.coerce.date().nullable(),
    targetDate: z.coerce.date().nullable(),
    tagIds: z.array(z.string()),
    propertiesData: CustomFieldsPatch,
  }),
);

export type TicketDraft = z.infer<typeof ticketDrafts.schema>;

const NO_TICKET: TicketDraft = {
  pipelineId: '',
  statusId: '',
  name: '',
  description: '',
  priority: 0,
  assigneeId: null,
  customerId: null,
  conversationId: null,
  opened: null,
  startDate: null,
  targetDate: null,
  tagIds: [],
  propertiesData: {},
};

/** The signed-in member's new ticket, one per tab. */
const useTicketDraft = () => useDraft(ticketDrafts, 'new', NO_TICKET);

type Draft = ReturnType<typeof useTicketDraft>;

/** The draft's fields the member writes, without its filing, conversation and description. */
const contentOf = (draft: TicketDraft) =>
  JSON.stringify({
    ...draft,
    pipelineId: '',
    statusId: '',
    conversationId: null,
    opened: null,
    description: '',
  });

/**
 * Whether the member wrote anything into the draft beyond what its conversation filled in. A
 * description the editor emptied again holds blocks without a `"text"` in them.
 */
export const written = (draft: TicketDraft) =>
  /"text":"[^"]/.test(draft.description) ||
  contentOf(draft) !== contentOf({ ...NO_TICKET, ...draft.opened });

/** What a draft starts from: "+" on a column gives its filing, a conversation its customer and name. */
type Opener = Pick<
  TicketDraft,
  'pipelineId' | 'statusId' | 'name' | 'customerId' | 'conversationId'
>;

/** The opener in `openNew(TICKET_TYPE, defaults)`'s defaults. */
const openerOf = (defaults: Record<string, unknown>): Opener => ({
  pipelineId: textOf(defaults.pipelineId),
  statusId: textOf(defaults.statusId),
  name: textOf(defaults.name),
  customerId: textOf(defaults.customerId) || null,
  conversationId: textOf(defaults.conversationId) || null,
});

/**
 * Starts the draft from an opener that differs from it: another conversation, or another pipeline
 * or status for a draft from none. A written draft asks once to be dropped, as the old create
 * sheet did, and keeping it shows the draft where it was; a panel reopened without an opener, as
 * after a reload, just shows it. Returns how many times the draft started over, so the form
 * remounts with the new values.
 */
const useOpener = (draft: Draft, opener: Opener) => {
  const { t } = useTranslation('frontline');
  const { confirm } = useConfirm();
  const [starts, setStarts] = useState(0);

  const ask = useEffectEvent(
    (pipelineId: string, statusId: string, conversationId: string | null) => {
      const held = draft.value;

      const elsewhere =
        conversationId !== held.conversationId ||
        (conversationId === null &&
          (pipelineId !== held.pipelineId || (statusId !== '' && statusId !== held.statusId)));

      if ((!pipelineId && !conversationId) || !elsewhere) return;

      const start = () => {
        draft.save(() => ({
          ...NO_TICKET,
          ...opener,
          opened: conversationId ? { name: opener.name, customerId: opener.customerId } : null,
        }));
        setStarts((count) => count + 1);
      };

      if (!written(held)) {
        start();

        return;
      }

      void confirm({
        message: t('discard-ticket-elsewhere', 'Drop the new ticket you started elsewhere?'),
        options: { okLabel: t('discard', 'Discard') },
      }).then(start);
    },
  );

  const { pipelineId, statusId, conversationId } = opener;

  useEffect(
    () => ask(pipelineId, statusId, conversationId),
    [pipelineId, statusId, conversationId],
  );

  return starts;
};

/**
 * The new ticket's draft as its form shows it, started from `openNew(TICKET_TYPE, defaults)`
 * (`useOpener`): filed in the draft's pipeline, else the opener's, else the first one, except
 * that a ticket from a conversation waits for the member to pick. `save` pins that filing with
 * every change, so the draft's properties never follow another pipeline.
 */
export const useTicketForm = (defaults: Record<string, unknown>) => {
  const { pipelines } = useChoices();
  const draft = useTicketDraft();
  const opener = openerOf(defaults);
  const starts = useOpener(draft, opener);
  // What the conversation filled in only tells `written` apart; the ticket doesn't take it.
  const { pipelineId: picked, statusId: pickedStatus, opened, ...fields } = draft.value;
  const firstPipeline = fields.conversationId ? '' : (pipelines[0]?.id ?? '');
  const pipelineId = picked || opener.pipelineId || firstPipeline;
  const statusId = picked ? pickedStatus : opener.statusId;

  return {
    draft,
    starts,
    pipelineId,
    statusId,
    fields,
    save: (patch: Partial<TicketDraft>) =>
      draft.save((last) => ({ ...last, pipelineId, statusId, ...patch })),
    /**
     * Files the draft in another pipeline, under its first status. Its properties follow the old
     * pipeline, so they go; ones typed before any pipeline apply to every pipeline, so they stay.
     */
    pickPipeline: (next: string) =>
      draft.save((last) => ({
        ...last,
        pipelineId: next,
        statusId: '',
        propertiesData: pipelineId ? {} : last.propertiesData,
      })),
  };
};
