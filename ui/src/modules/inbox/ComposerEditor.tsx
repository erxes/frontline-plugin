import { IconArrowsDiagonal, IconArrowsDiagonalMinimize2 } from '@tabler/icons-react';
import { Button, cn, Editor, IconTip, Kbd } from 'erxes-ui';
import { atom, useAtomValue } from 'jotai';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { useSlashItems } from './slashItems.tsx';

/** Puts the cursor in the editor inside `root`, on the next frame, once a new one has mounted. */
export const focusEditorIn = (root: string) =>
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>(`${root} [contenteditable="true"]`)?.focus(),
  );

/** Puts the cursor in the composer's editor. */
export const focusComposer = () => focusEditorIn('[data-composer]');

/** Whether the member has made the reply editor tall for a long message, for this visit. */
export const editorTall = atom(false);

/**
 * A writing card: a raised panel that rings while the member writes in it; a note turns it
 * yellow, rule and ring with it. The reply box and a response template's editor look alike.
 */
export const cardLook = (note = false) =>
  cn(
    '@container flex flex-col rounded-xl border bg-background shadow-sm transition-colors',
    !note && 'focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/15',
    note && 'border-warning/60 bg-warning/10 focus-within:ring-2 focus-within:ring-warning/20',
  );

/** In a writing card's toolbar: makes the editor tall for a long text, and back. */
export const ExpandToggle = ({ tall, onToggle }: { tall: boolean; onToggle: () => void }) => {
  const { t } = useTranslation('frontline');

  const label = tall
    ? t('shrink-editor', 'Shrink the editor')
    : t('expand-editor', 'Expand the editor');

  return (
    <span className="shrink-0">
      <IconTip label={label}>
        <Button
          type="button"
          variant="ghost"
          tone="muted"
          size="icon"
          aria-label={label}
          aria-pressed={tall}
          onClick={onToggle}
        >
          {tall ? <IconArrowsDiagonalMinimize2 /> : <IconArrowsDiagonal />}
        </Button>
      </IconTip>
    </span>
  );
};

/** The submit shortcut, as the member's keyboard labels it. */
const SHORTCUT = navigator.userAgent.includes('Mac') ? '⌘↵' : 'Ctrl↵';

/** Beside a writing card's button: the shortcut that presses it (`⌘↵ to send`), once it fits. */
export const ShortcutHint = ({ action }: { action: string }) => (
  <span
    aria-hidden
    className="mr-2 hidden items-center gap-1.5 text-xs text-muted-foreground @md:flex"
  >
    {/* Kbd fades its text, so it takes the full text colour to stay readable. */}
    <span className="text-foreground">
      <Kbd variant="foreground">{SHORTCUT}</Kbd>
    </span>
    {action}
  </span>
);

/**
 * A writing card's editor, as tall as what is written up to a limit and taller while expanded,
 * with no drag handle; `/` formats and `:` adds emoji. Text reads at the thread's size.
 */
export const CardEditor = ({
  tall,
  ...props
}: { tall: boolean } & Omit<ComponentProps<typeof Editor>, 'variant' | 'sideMenu'>) => (
  <div className="px-2 pt-1 text-sm">
    <Editor
      {...props}
      variant="default"
      sideMenu={false}
      className={cn('h-auto', tall ? 'max-h-120 min-h-64' : 'max-h-64 min-h-20')}
    />
  </div>
);

/** The reply box's editor, named and hinted for its mode; `/` also lists templates or teammates. */
export const ReplyEditor = ({
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
    <CardEditor
      tall={useAtomValue(editorTall)}
      label={note ? t('internal-note', 'Internal note') : t('reply', 'Reply')}
      placeholder={
        note
          ? t('note-placeholder', 'Write a note. Type / to mention a teammate, : for emoji.')
          : t('reply-placeholder', 'Write a reply. Type / for templates, : for emoji.')
      }
      initialContent={initialContent}
      isHTML
      slashMenuOnTop
      additionalSlashMenuItems={slashItems}
      onChange={onChange}
    />
  );
};
