import { IconEyeOff, IconLoader2, IconLock, IconMessage2, IconSend } from '@tabler/icons-react';
import { Button, cn, Kbd, Separator, Tabs } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { SendSurvey } from '~/modules/surveys/SurveyMessage.tsx';
import type { Attachment } from '~/shared/Files.tsx';
import type { Conversation } from './queries.ts';
import { AttachButton, AttachedFiles, type useComposerFiles } from './ComposerFiles.tsx';
import { ExpandToggle } from './ComposerEditor.tsx';
import { TemplatePicker } from './TemplatePicker.tsx';

export type Mode = 'reply' | 'note';

/**
 * The card's top strip: Reply or Internal note as tabs on its rule, and in a note, on the right,
 * who sees it. A conversation that takes notes only, such as a phone call's, offers no Reply.
 */
export const ModeBar = ({
  mode,
  notesOnly,
  onChange,
}: {
  mode: Mode;
  notesOnly: boolean;
  onChange: (mode: Mode) => void;
}) => {
  const { t } = useTranslation('frontline');
  const note = mode === 'note';

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3 border-b px-2 transition-colors',
        note && 'border-warning/40',
      )}
    >
      <Tabs value={mode} onValueChange={(value: Mode) => onChange(value)}>
        <Tabs.List variant="flush">
          {!notesOnly && (
            <Tabs.Trigger value="reply" size="sm" aria-keyshortcuts="Shift+Tab">
              <IconMessage2 />
              {t('reply', 'Reply')}
            </Tabs.Trigger>
          )}
          <Tabs.Trigger value="note" size="sm" aria-keyshortcuts={notesOnly ? undefined : 'Tab'}>
            <IconLock />
            {t('internal-note', 'Internal note')}
          </Tabs.Trigger>
        </Tabs.List>
      </Tabs>
      {note && (
        <span className="ml-auto flex min-w-0 items-center gap-1 text-xs text-warning-text">
          <IconEyeOff aria-hidden className="size-3.5 shrink-0" />
          <span className="truncate">
            {notesOnly
              ? t('notes-only-hint', 'A call takes notes only. Only your team sees them.')
              : t('note-hint', 'Only your team sees notes.')}
          </span>
        </span>
      )}
    </div>
  );
};

/** The send shortcut, as the member's keyboard labels it. */
const SHORTCUT = navigator.userAgent.includes('Mac') ? '⌘↵' : 'Ctrl↵';

/**
 * Send, or Add note in a note, so a note can't pass for a reply. It turns to a spinner while the
 * message goes or its files upload, and stays off until there is something to send.
 */
const SendButton = ({
  note,
  disabled,
  busy,
}: {
  note: boolean;
  disabled: boolean;
  busy: boolean;
}) => {
  const { t } = useTranslation('frontline');
  const Icon = note ? IconLock : IconSend;

  return (
    <Button type="submit" variant={note ? 'outline' : 'default'} disabled={disabled}>
      {busy ? (
        <IconLoader2 aria-hidden className="animate-spin motion-reduce:animate-none" />
      ) : (
        <Icon />
      )}
      {note ? t('add-note', 'Add note') : t('send', 'Send')}
    </Button>
  );
};

/**
 * The card's foot: the files attached so far, then one row of tools. Templates, attach and survey
 * on the left with the editor's size after a rule; the send shortcut and Send on the right. A
 * narrow card drops the shortcut first, so the tools and Send stay whole.
 */
export const Toolbar = ({
  conversation,
  note,
  disabled,
  busy,
  files,
  attachments,
  onAttachments,
  onTemplate,
}: {
  conversation: Conversation;
  note: boolean;
  disabled: boolean;
  busy: boolean;
  files: ReturnType<typeof useComposerFiles>;
  attachments: Attachment[];
  onAttachments: (update: (files: Attachment[]) => Attachment[]) => void;
  onTemplate: (content: string) => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <>
      <AttachedFiles
        files={files}
        attachments={attachments}
        // The draft parses its files again on each read, so a file is found by its url.
        onRemove={(file) =>
          onAttachments((current) => current.filter((other) => other.url !== file.url))
        }
      />
      <div className="flex min-w-0 items-center gap-0.5 px-2 pt-1 pb-2">
        {!note && <TemplatePicker channelId={conversation.channelId} onPick={onTemplate} />}
        <AttachButton files={files} />
        {!note && <SendSurvey conversationId={conversation.id} />}
        <Separator orientation="vertical" className="mx-1 h-4" />
        <ExpandToggle />
        <span className="flex-1" />
        <span
          aria-hidden
          className="mr-2 hidden items-center gap-1.5 text-xs text-muted-foreground @md:flex"
        >
          {/* Kbd fades its text, so it takes the full text colour to stay readable. */}
          <span className="text-foreground">
            <Kbd variant="foreground">{SHORTCUT}</Kbd>
          </span>
          {note ? t('shortcut-add-note', 'to add') : t('shortcut-send', 'to send')}
        </span>
        <SendButton note={note} disabled={disabled} busy={busy} />
      </div>
    </>
  );
};
