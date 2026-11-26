import { IconArrowForwardUp, IconExternalLink, IconPlus, IconX } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Select, Textarea, toast, useOpenRecord } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { nameOf, TicketChips } from '@/inbox/ConversationTickets.tsx';
import { CONVERSATION_TYPE, TICKET_TYPE } from '~/plugin.ts';
import { choicesQuery } from '~/shared/reference.ts';

const failed = (error: Error) => toast({ variant: 'destructive', title: error.message });

/** Hands the call on to another of the PBX's extensions. */
export const Transfer = ({ accountId, onDone }: { accountId: string; onDone: () => void }) => {
  const { t } = useTranslation('frontline');
  const [extension, setExtension] = useState('');
  const extensions = useQuery(orpc.calls.phone.extensions.queryOptions({ input: { accountId } }));

  const transfer = useMutation(
    orpc.calls.phone.transfer.mutationOptions({ onSuccess: onDone, onError: failed }),
  );

  const extensionName = (value: string) =>
    extensions.data?.find((row) => row.extension === value)?.name || value;

  return (
    <div className="flex gap-1">
      <Select value={extension} onValueChange={(next) => next && setExtension(next)}>
        <Select.Trigger variant="bordered" aria-label={t('transfer-to', 'Transfer to')}>
          <Select.Value placeholder={t('transfer-to', 'Transfer to')}>
            {(value: string) => `${value} ${extensionName(value)}`}
          </Select.Value>
        </Select.Trigger>
        <Select.Content>
          {extensions.data?.map((row) => (
            <Select.Item key={row.extension} value={row.extension}>
              {row.extension} {row.name}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
      <Button
        disabled={!extension || transfer.isPending}
        onClick={() => transfer.mutate({ accountId, extension })}
      >
        <IconArrowForwardUp />
        {t('transfer', 'Transfer')}
      </Button>
    </div>
  );
};

/** Each conversation's unsaved note, so leaving the Phone page mid-call keeps it. */
const drafts = new Map<string, string>();

/** The call's tickets, then Create ticket, drafted in core's panel; nothing without a pipeline. */
const CallTickets = ({
  conversationId,
  customerId,
  name,
}: {
  conversationId: string;
  customerId: string;
  name: string;
}) => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const pipelines = useQuery(choicesQuery).data?.pipelines ?? [];

  if (pipelines.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <TicketChips conversationId={conversationId} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => openNew(TICKET_TYPE, { conversationId, customerId, name })}
      >
        <IconPlus />
        {t('create-ticket', 'Create ticket')}
      </Button>
    </div>
  );
};

/**
 * An internal note on the call's conversation, while the call lasts and after it, until the
 * member closes it, with the call's tickets and a new one named from the note.
 */
export const CallNote = ({
  conversationId,
  customerId,
  customerPhone,
  onClose,
}: {
  conversationId: string;
  customerId: string;
  customerPhone: string;
  onClose: () => void;
}) => {
  const { t } = useTranslation('frontline');
  const { open } = useOpenRecord();
  const [content, setContent] = useState(() => drafts.get(conversationId) ?? '');

  const write = (next: string) => {
    drafts.set(conversationId, next);
    setContent(next);
  };

  const save = useMutation(
    orpc.conversations.messages.create.mutationOptions({
      onSuccess: () => {
        drafts.delete(conversationId);
        setContent('');
        toast({ title: t('note-saved', 'Note saved on the call') });
      },
      onError: failed,
    }),
  );

  return (
    <form
      className="flex flex-col gap-2 border-t pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ conversationId, content: content.trim(), internal: true });
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{t('call-note', 'Call note')}</span>
        <div className="flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('open-conversation', 'Open the conversation')}
            onClick={() => open({ contentType: CONVERSATION_TYPE, contentId: conversationId })}
          >
            <IconExternalLink />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('close-note', 'Close the note')}
            onClick={onClose}
          >
            <IconX />
          </Button>
        </div>
      </div>
      <Textarea
        value={content}
        rows={3}
        aria-label={t('call-note', 'Call note')}
        placeholder={t('call-note-placeholder', 'What the caller needs')}
        onChange={(event) => write(event.target.value)}
      />
      <Button type="submit" variant="secondary" disabled={!content.trim() || save.isPending}>
        {t('save-note', 'Save note')}
      </Button>
      <CallTickets
        conversationId={conversationId}
        customerId={customerId}
        name={nameOf(content) || t('call-from', 'Call from {{number}}', { number: customerPhone })}
      />
    </form>
  );
};
