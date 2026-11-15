import { IconPlus, IconSearchOff } from '@tabler/icons-react';
import {
  Button,
  Combobox,
  Command,
  Empty,
  Filter,
  Kbd,
  PageSubHeader,
  useListFilterParams,
  useScopedHotkeys,
} from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { SEARCH_KEY } from './hooks.ts';

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

/** The bar above a list: a search filter, `children` such as more filters, and how many records match. */
export const SearchSubHeader = ({
  id,
  count,
  children,
}: {
  id: string;
  count: number | undefined;
  children?: ReactNode;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <Filter id={id}>
      <PageSubHeader>
        <Filter.Bar>
          <Filter.Popover scope={id}>
            <Filter.Trigger />
            <Combobox.Content>
              <Filter.View>
                <Command>
                  <Filter.CommandInput placeholder={t('filter', 'Filter...')} variant="secondary" />
                  <Command.List>
                    <Filter.SearchValueTrigger />
                  </Command.List>
                </Command>
              </Filter.View>
            </Combobox.Content>
          </Filter.Popover>
          <Filter.Dialog>
            <Filter.View filterKey={SEARCH_KEY} inDialog>
              <Filter.DialogStringView filterKey={SEARCH_KEY} />
            </Filter.View>
          </Filter.Dialog>
          <Filter.SearchValueBarItem />
          {children}
          {count !== undefined && (
            <span className="text-muted-foreground text-sm font-medium whitespace-nowrap">
              {t('n-records-found', {
                defaultValue_one: '{{count}} record found',
                defaultValue_other: '{{count}} records found',
                count,
              })}
            </span>
          )}
        </Filter.Bar>
      </PageSubHeader>
    </Filter>
  );
};
