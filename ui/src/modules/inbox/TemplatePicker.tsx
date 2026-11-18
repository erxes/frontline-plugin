import { IconTemplate } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Button, editorText, EntityPicker, IconTip, Popover } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { templatesQuery } from '~/shared/reference.ts';

/**
 * The channel's response templates in a popover over the composer, searchable by name; the one
 * picked goes into the reply. `/` in the editor reaches the same templates from the keyboard.
 */
export const TemplatePicker = ({
  channelId,
  onPick,
}: {
  channelId: string;
  onPick: (content: string) => void;
}) => {
  const { t } = useTranslation('frontline');
  const [open, setOpen] = useState(false);
  const templates = useQuery(templatesQuery(channelId));
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
