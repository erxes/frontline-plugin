import { Button, Card } from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** One card of a settings page: a title, a line on what it's for, and its fields in a grid. */
export const SettingsCard = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <Card>
    <Card.Header>
      <Card.Title>{title}</Card.Title>
      <Card.Description>{description}</Card.Description>
    </Card.Header>
    <Card.Content>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </Card.Content>
  </Card>
);

/** The bar at the foot of a settings page's one form: Discard, on once it changed, and Save. */
export const SaveBar = ({
  dirty,
  saving,
  onDiscard,
}: {
  dirty: boolean;
  saving: boolean;
  onDiscard: () => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background/95 py-3 backdrop-blur">
      <Button type="button" variant="ghost" disabled={!dirty} onClick={onDiscard}>
        {t('discard', 'Discard')}
      </Button>
      <Button type="submit" disabled={saving}>
        {saving ? t('saving', 'Saving…') : t('save', 'Save')}
      </Button>
    </div>
  );
};
