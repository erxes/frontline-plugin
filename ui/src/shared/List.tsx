import { IconPlus, IconSearchOff } from '@tabler/icons-react';
import { Button, Empty, Kbd, useListFilterParams, useScopedHotkeys } from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** What an empty list says: "No results" while filtered, otherwise `title` and how to start. */
export const ListEmpty = ({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) => {
  const { t } = useTranslation('frontline');
  const { filter, search: text } = useListFilterParams();
  const search = Boolean(filter ?? text);

  return (
    <Empty variant="outline" className="m-3">
      <Empty.Header>
        <Empty.Media>{search ? <IconSearchOff /> : icon}</Empty.Media>
        <Empty.Title>{search ? t('no-results-found', 'No results found') : title}</Empty.Title>
        <Empty.Description>
          {search ? t('try-different-search-term', 'Try a different search term') : description}
        </Empty.Description>
      </Empty.Header>
      {!search && action && <Empty.Content>{action}</Empty.Content>}
    </Empty>
  );
};

/** A list's create button, with C as its shortcut, for members who may create; others see none. */
export const CreateButton = ({
  allowed,
  label,
  onClick,
}: {
  allowed: boolean;
  label: string;
  onClick: () => void;
}) => {
  useScopedHotkeys('c', () => allowed && onClick(), 'app');

  if (!allowed) return null;

  return (
    <Button onClick={onClick}>
      <IconPlus />
      {label}
      <Kbd>C</Kbd>
    </Button>
  );
};
