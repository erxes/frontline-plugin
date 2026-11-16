import { IconLock, IconSend } from '@tabler/icons-react';
import { Button, cn, Label, Switch, Textarea } from 'erxes-ui';
import { type SubmitEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSendMessage } from './queries.ts';

/**
 * The reply box under the thread: a reply goes to the customer, an internal note stays with the
 * team. Ctrl or ⌘ with Enter sends it.
 */
export const Composer = ({ conversationId }: { conversationId: string }) => {
  const { t } = useTranslation('frontline');
  const [content, setContent] = useState('');
  const [internal, setInternal] = useState(false);
  const send = useSendMessage();
  const noteId = useId();

  const submit = (event?: SubmitEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (!content.trim()) return;

    send.mutate({ conversationId, content, internal }, { onSuccess: () => setContent('') });
  };

  return (
    <form
      onSubmit={submit}
      className={cn('flex flex-col gap-2 border-t p-3', internal && 'bg-warning-surface')}
    >
      <Textarea
        aria-label={internal ? t('internal-note', 'Internal note') : t('reply', 'Reply')}
        placeholder={
          internal
            ? t('note-placeholder', 'Write a note only your team sees')
            : t('reply-placeholder', 'Write a reply')
        }
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit();
        }}
        className="min-h-20"
      />
      <div className="flex items-center gap-2">
        <Switch id={noteId} checked={internal} onCheckedChange={setInternal} />
        <IconLock className="size-4 text-muted-foreground" aria-hidden />
        <Label htmlFor={noteId}>{t('internal-note', 'Internal note')}</Label>
        <span className="flex-1" />
        <Button type="submit" disabled={send.isPending || !content.trim()}>
          <IconSend />
          {internal ? t('add-note', 'Add note') : t('send', 'Send')}
        </Button>
      </div>
    </form>
  );
};
