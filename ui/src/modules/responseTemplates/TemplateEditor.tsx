import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CardEditor, cardLook, ExpandToggle, focusEditorIn } from '@/inbox/ComposerEditor.tsx';

/**
 * A response template's content in the reply box's card and editor, so a template is written as
 * the reply it becomes: `/` formats, `:` adds emoji, and the toolbar makes it tall for a long one.
 * `children` sit at the toolbar's right, such as Save. Read only, it has no toolbar.
 */
export const TemplateEditor = ({
  id,
  initialContent,
  readonly,
  onChange,
  children,
}: {
  /** Tells this card apart on the page, to put the cursor back in it. */
  id: string;
  initialContent?: string;
  readonly?: boolean;
  onChange: (content: string) => void;
  children?: ReactNode;
}) => {
  const { t } = useTranslation('frontline');
  const [tall, setTall] = useState(false);

  return (
    <div data-template-editor={id} className={cardLook()}>
      <CardEditor
        tall={tall}
        label={t('content', 'Content')}
        placeholder={t(
          'template-placeholder',
          'Write the template. Type / to format, : for emoji.',
        )}
        initialContent={initialContent}
        readonly={readonly}
        onChange={onChange}
      />
      {!readonly && (
        <div className="flex min-w-0 items-center gap-0.5 px-2 pt-1 pb-2">
          <ExpandToggle
            tall={tall}
            onToggle={() => {
              setTall(!tall);
              focusEditorIn(`[data-template-editor="${id}"]`);
            }}
          />
          <span className="flex-1" />
          {children}
        </div>
      )}
    </div>
  );
};
