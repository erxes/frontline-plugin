import { IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Button,
  PanelSection,
  Spinner,
  Textarea,
  type TRecordSlotProps,
  useConfirm,
  useFormat,
} from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { useChange } from '~/shared/hooks.ts';
import { MemberLine } from '~/shared/Person.tsx';

/**
 * The ticket's Comments tab: what the team wrote to its customer, who reads it with the ticket in
 * the messenger, and a box to write more. The team's own notes stay in core's Activity tab.
 */
export const TicketComments = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const { confirm } = useConfirm();
  const [body, setBody] = useState('');
  const change = useChange(orpc.tickets.comments.key());
  const query = useQuery(orpc.tickets.comments.queryOptions({ input: { ticketId: contentId } }));
  const add = useMutation(orpc.tickets.addComment.mutationOptions(change));
  const remove = useMutation(orpc.tickets.removeComment.mutationOptions(change));

  const send = () => add.mutate({ ticketId: contentId, body }, { onSuccess: () => setBody('') });

  const takeBack = async (id: string) => {
    await confirm({
      message: t(
        'ticket-comment-remove-confirm',
        'Take this comment back? The customer no longer sees it.',
      ),
      options: { okLabel: t('remove', 'Remove') },
    });
    remove.mutate({ id });
  };

  if (query.isPending) return <Spinner area="lg" />;

  if (query.isError)
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {query.error.message}
      </p>
    );

  return (
    <PanelSection title={t('ticket-comments', 'Comments')}>
      <p className="px-2 text-xs text-muted-foreground">
        {t(
          'ticket-comments-hint',
          'The customer reads these with the ticket in the messenger. Notes in Activity stay with the team.',
        )}
      </p>
      <ol className="flex flex-col gap-2 py-2">
        {query.data.map((comment) => (
          <li key={comment.id} className="flex flex-col gap-1 rounded-lg bg-muted p-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <MemberLine id={comment.createdBy} size="sm" />
              <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                {format.dateTime(comment.createdAt)}
                {comment.mine && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t('ticket-comment-remove', 'Take back')}
                    onClick={() => void takeBack(comment.id)}
                  >
                    <IconTrash />
                  </Button>
                )}
              </span>
            </div>
            <p className="whitespace-pre-wrap">{comment.body}</p>
          </li>
        ))}
      </ol>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <Textarea
          aria-label={t('ticket-comment-body', 'Comment for the customer')}
          placeholder={t('ticket-comment-placeholder', 'Write to the customer')}
          value={body}
          maxLength={5000}
          onChange={(event) => setBody(event.target.value)}
        />
        <Button type="submit" className="self-end" disabled={!body.trim() || add.isPending}>
          {t('ticket-comment-send', 'Send to customer')}
        </Button>
      </form>
    </PanelSection>
  );
};
