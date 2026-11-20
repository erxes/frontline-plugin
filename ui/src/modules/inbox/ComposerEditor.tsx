import { IconArrowsDiagonal, IconArrowsDiagonalMinimize2 } from '@tabler/icons-react';
import { Button, cn, Editor, IconTip } from 'erxes-ui';
import { atom, useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { useSlashItems } from './slashItems.tsx';

/** Puts the cursor in the composer's editor, on the next frame, once a new one has mounted. */
export const focusComposer = () =>
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>('[data-composer] [contenteditable="true"]')?.focus(),
  );

/** Whether the member has made the editor tall for a long message, for this visit. */
const editorTall = atom(false);

/** In the composer's toolbar: makes the editor tall for a long message, and back. */
export const ExpandToggle = () => {
  const { t } = useTranslation('frontline');
  const [tall, setTall] = useAtom(editorTall);

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
          onClick={() => {
            setTall(!tall);
            focusComposer();
          }}
        >
          {tall ? <IconArrowsDiagonalMinimize2 /> : <IconArrowsDiagonal />}
        </Button>
      </IconTip>
    </span>
  );
};

/**
 * The editor, as tall as what is written up to a limit, named and hinted for its mode; taller
 * while the member has expanded it.
 */
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
  const tall = useAtomValue(editorTall);

  return (
    // The editor takes its size from here, so what is written reads as the thread's messages do.
    <div className="px-2 pt-1 text-sm">
      <Editor
        label={note ? t('internal-note', 'Internal note') : t('reply', 'Reply')}
        placeholder={
          note
            ? t('note-placeholder', 'Write a note. Type / to mention a teammate, : for emoji.')
            : t('reply-placeholder', 'Write a reply. Type / for templates, : for emoji.')
        }
        initialContent={initialContent}
        isHTML
        variant="default"
        sideMenu={false}
        slashMenuOnTop
        additionalSlashMenuItems={slashItems}
        className={cn('h-auto', tall ? 'max-h-120 min-h-64' : 'max-h-56 min-h-16')}
        onChange={onChange}
      />
    </div>
  );
};
