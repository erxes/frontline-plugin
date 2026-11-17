import { IconLock, IconMessage2, IconPaperclip, IconSend, IconTemplate } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  cn,
  Editor,
  editorText,
  EntityPicker,
  IconTip,
  Kbd,
  Popover,
  Tabs,
} from 'erxes-ui';
import { type SubmitEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SendSurvey } from '~/modules/surveys/SurveyMessage.tsx';
import { orpc } from '~/orpc.ts';
import { type Attachment, FileList, FilePicker } from '~/shared/Files.tsx';
import { type Conversation, useSendMessage, useSendTyping } from './queries.ts';
import { useSlashItems } from './slashItems.tsx';
import { useSendShortcut } from './useSendShortcut.ts';

const MODES = ['reply', 'note'] as const;

type Mode = (typeof MODES)[number];

/** The send shortcut, as the member's keyboard labels it. */
const SHORTCUT = navigator.userAgent.includes('Mac') ? '⌘↵' : 'Ctrl↵';

/** Text as HTML, for a template added after what is written. */
const paragraph = (text: string) =>
  `<p>${text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p>`;

/**
 * The channel's response templates in a popover over the composer, searchable by name; the one
 * picked goes into the reply. `/` in the editor reaches the same templates from the keyboard.
 */
const TemplatePicker = ({
  channelId,
  onPick,
}: {
  channelId: string;
  onPick: (content: string) => void;
}) => {
  const { t } = useTranslation('frontline');
  const [open, setOpen] = useState(false);
  const templates = useQuery(orpc.responseTemplates.list.queryOptions({ input: { channelId } }));
  const label = t('response-templates', 'Response templates');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <IconTip label={label}>
        <Popover.Trigger
          render={
            <Button type="button" variant="ghost" tone="muted" size="icon" aria-label={label}>
              <IconTemplate />
            </Button>
          }
        />
      </IconTip>
      <Popover.Content side="top" align="start" className="w-80">
        <EntityPicker
          items={templates.data?.templates ?? []}
          itemKey={(template) => ({ id: template.id, label: template.name })}
          renderItem={(template) => (
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{template.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {editorText(template.content)}
              </span>
            </span>
          )}
          value={[]}
          onValueChange={([id]) => {
            const template = templates.data?.templates.find((item) => item.id === id);

            if (template) onPick(template.content);
            setOpen(false);
          }}
          loading={templates.isPending}
          error={templates.error}
          searchPlaceholder={t('search-templates', 'Search templates')}
        />
      </Popover.Content>
    </Popover>
  );
};

/**
 * The composer's foot, in the old inbox's order: the files attached so far, then templates,
 * attach and survey as icons on the left, the send shortcut and Send, or Add note in a note.
 */
const Actions = ({
  conversation,
  note,
  disabled,
  attachments,
  onAttachments,
  onTemplate,
}: {
  conversation: Conversation;
  note: boolean;
  disabled: boolean;
  attachments: Attachment[];
  onAttachments: (update: (files: Attachment[]) => Attachment[]) => void;
  onTemplate: (content: string) => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <>
      {attachments.length > 0 && (
        <div className="px-3">
          <FileList
            files={attachments}
            onRemove={(file) => onAttachments((files) => files.filter((other) => other !== file))}
          />
        </div>
      )}
      <div className="flex items-center gap-1 p-2">
        {!note && <TemplatePicker channelId={conversation.channelId} onPick={onTemplate} />}
        <FilePicker
          icon={<IconPaperclip />}
          label={t('attach-file', 'Attach file')}
          onUploaded={(file) => onAttachments((files) => [...files, file])}
        />
        {!note && <SendSurvey conversationId={conversation.id} />}
        <span className="flex-1" />
        <Kbd aria-hidden>{SHORTCUT}</Kbd>
        <Button type="submit" variant={note ? 'outline' : 'default'} disabled={disabled}>
          {note ? <IconLock /> : <IconSend />}
          {note ? t('add-note', 'Add note') : t('send', 'Send')}
        </Button>
      </div>
    </>
  );
};

/** Reply or Internal note, and in a note, who sees it. */
const ModeTabs = ({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) => {
  const { t } = useTranslation('frontline');

  return (
    <div className="flex items-center gap-3 p-2">
      <Tabs value={mode} onValueChange={(value: Mode) => onChange(value)}>
        <Tabs.List variant="segment">
          <Tabs.Trigger value="reply">
            <IconMessage2 />
            {t('reply', 'Reply')}
          </Tabs.Trigger>
          <Tabs.Trigger value="note">
            <IconLock />
            {t('internal-note', 'Internal note')}
          </Tabs.Trigger>
        </Tabs.List>
      </Tabs>
      {mode === 'note' && (
        <span className="truncate text-xs text-warning-text">
          {t('note-hint', 'Only your team sees notes.')}
        </span>
      )}
    </div>
  );
};

/** The editor, as tall as what is written up to a limit, named and hinted for its mode. */
const ReplyEditor = ({
  note,
  initialContent,
  channelId,
  onChange,
}: {
  note: boolean;
  initialContent: string;
  channelId: string;
  onChange: (html: string) => void;
}) => {
  const { t } = useTranslation('frontline');
  const slashItems = useSlashItems({ channelId, note });

  return (
    <div className="px-2">
      <Editor
        label={note ? t('internal-note', 'Internal note') : t('reply', 'Reply')}
        placeholder={
          note
            ? t('note-placeholder', 'Write a note. Type / to mention a teammate.')
            : t('reply-placeholder', 'Write a reply. Type / for templates.')
        }
        initialContent={initialContent}
        isHTML
        variant="default"
        sideMenu={false}
        slashMenuOnTop
        additionalSlashMenuItems={slashItems}
        className="h-auto max-h-40 min-h-16"
        onChange={onChange}
      />
    </div>
  );
};

/**
 * Puts the cursor in the composer's editor, on the next frame, once a new one has mounted, and
 * the ref for the composer's form that it searches.
 */
const useEditorFocus = () => {
  const form = useRef<HTMLFormElement | null>(null);

  const focus = () =>
    requestAnimationFrame(() =>
      form.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus(),
    );

  const attach = (node: HTMLFormElement | null) => {
    form.current = node;
  };

  return { attach, focus };
};

/**
 * The reply box, a compact card under the thread like the old inbox's: a reply goes to the
 * customer, an internal note stays with the team and can mention teammates. A note turns the
 * whole card yellow and its button reads Add note, so it can't pass for a reply. `/` opens the
 * formatting, the channel's response templates and, in a note, the teammates. Files attach
 * through core's upload. Ctrl or ⌘ with Enter sends it, and the cursor stays in the box.
 */
export const Composer = ({ conversation }: { conversation: Conversation }) => {
  const [mode, setMode] = useState<Mode>('reply');
  const [html, setHtml] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // Each change from outside the editor (a send, a template) starts a new one with the content.
  const [version, setVersion] = useState(0);
  const { attach, focus: focusEditor } = useEditorFocus();
  const send = useSendMessage();
  const sendTyping = useSendTyping(conversation.id);
  const note = mode === 'note';
  const empty = !editorText(html) && attachments.length === 0;

  const restart = (content: string) => {
    setHtml(content);
    setVersion((count) => count + 1);
    focusEditor();
  };

  const submit = (event?: SubmitEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (empty || send.isPending) return;

    send.mutate(
      { conversationId: conversation.id, html, attachments, internal: note },
      {
        onSuccess: () => {
          setAttachments([]);
          restart('');
        },
      },
    );
  };

  const shortcut = useSendShortcut({ send: submit });

  return (
    <div className="mx-auto w-full max-w-2xl shrink-0 p-3">
      <form
        ref={(node) => {
          attach(node);
          shortcut(node);
        }}
        onSubmit={submit}
        className={cn(
          'flex flex-col rounded-lg border bg-background shadow-xs',
          note && 'border-warning bg-warning/10',
        )}
      >
        <ModeTabs
          mode={mode}
          onChange={(value) => {
            setMode(value);
            focusEditor();
          }}
        />
        <ReplyEditor
          // A new editor per mode names itself for it, and one after each send starts empty.
          key={`${mode}-${version}`}
          note={note}
          initialContent={html}
          channelId={conversation.channelId}
          onChange={(value) => {
            setHtml(value);

            // A note stays with the team, so the visitor doesn't see it being written.
            if (!note) sendTyping();
          }}
        />
        <Actions
          conversation={conversation}
          note={note}
          disabled={send.isPending || empty}
          attachments={attachments}
          onAttachments={setAttachments}
          onTemplate={(content) =>
            restart(editorText(html) ? html + paragraph(editorText(content)) : content)
          }
        />
      </form>
    </div>
  );
};
