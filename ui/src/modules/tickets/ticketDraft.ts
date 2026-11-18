import { CustomFieldsPatch } from '@erxes/core-contract';
import { useConfirm } from 'erxes-ui';
import { useEffect, useEffectEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { draftsOf, useDraft } from '~/shared/drafts.ts';

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
    priority: z.number(),
    assigneeId: z.string().nullable(),
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
  startDate: null,
  targetDate: null,
  tagIds: [],
  propertiesData: {},
};

/** The signed-in member's new ticket, one per tab. */
export const useTicketDraft = () => useDraft(ticketDrafts, 'new', NO_TICKET);

type Draft = ReturnType<typeof useTicketDraft>;

/**
 * Whether the member wrote anything into the draft. Its filing doesn't count, and a description
 * the editor emptied again holds blocks without a `"text"` in them.
 */
export const written = (draft: TicketDraft) =>
  /"text":"[^"]/.test(draft.description) ||
  JSON.stringify({ ...draft, pipelineId: '', statusId: '', description: '' }) !==
    JSON.stringify(NO_TICKET);

/**
 * Opened from another pipeline or status than a written draft is in, such as "+" on a column,
 * asks once to drop the draft and start there, as the old create sheet did. Keeping it shows the
 * draft where it was; a panel reopened without an opener, as after a reload, just shows it.
 */
export const useOpener = (draft: Draft, pipelineId: string, statusId: string) => {
  const { t } = useTranslation('frontline');
  const { confirm } = useConfirm();

  const ask = useEffectEvent((opener: Pick<TicketDraft, 'pipelineId' | 'statusId'>) => {
    const held = draft.value;

    const elsewhere =
      opener.pipelineId !== held.pipelineId ||
      (opener.statusId !== '' && opener.statusId !== held.statusId);

    if (opener.pipelineId && written(held) && elsewhere)
      void confirm({
        message: t('discard-ticket-elsewhere', 'Drop the new ticket you started elsewhere?'),
        options: { okLabel: t('discard', 'Discard') },
      }).then(() => draft.save(() => ({ ...NO_TICKET, ...opener })));
  });

  useEffect(() => ask({ pipelineId, statusId }), [pipelineId, statusId]);
};
