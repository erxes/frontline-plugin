import { IconChartBar } from '@tabler/icons-react';
import { cn, PageContainer, ScrollArea, Skeleton } from 'erxes-ui';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { DASHBOARD_WIDGETS } from '~/dashboardWidgets.ts';
import { PLUGIN } from '~/plugin.ts';
import { AppHeader } from '~/shared/Header.tsx';

/** The tiles' groups, each holding the tiles whose name starts with its prefix. */
const GROUPS = [
  ['ticket', 'Tickets', 'tickets'],
  ['conversation', 'Conversations', 'conversations'],
  ['meta', 'Facebook and Instagram', 'facebook-and-instagram'],
  ['call', 'Calls', 'calls'],
] as const;

type Widget = (typeof DASHBOARD_WIDGETS)[number];

/** One tile in a frame like the one core's home dashboard draws, as tall as it sizes it there. */
const Tile = ({ widget }: { widget: Widget }) => {
  const { t } = useTranslation('frontline');
  const wide = widget.size?.w === 12;
  const Body = widget.component;

  return (
    <section
      className={cn(
        'col-span-12 flex flex-col overflow-hidden rounded-xl border bg-background shadow-xs',
        wide ? 'h-52' : 'h-94 lg:col-span-6',
      )}
    >
      <h3 className="flex h-11 shrink-0 items-center border-b px-4 text-sm font-semibold">
        {t(widget.title)}
      </h3>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <Suspense fallback={<Skeleton className="size-full" />}>
          <Body />
        </Suspense>
      </div>
    </section>
  );
};

/**
 * Every report tile on one page, by what it counts: the same tiles core's home dashboard offers,
 * each keeping the period picked for it there.
 */
export const ReportsPage = () => {
  const { t } = useTranslation('frontline');

  return (
    <PageContainer>
      <AppHeader
        icon={IconChartBar}
        app={{ label: t('reports', 'Reports'), to: `/${PLUGIN}/reports` }}
      />
      <ScrollArea>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-6">
          {GROUPS.map(([prefix, text, key]) => (
            // A plain wrapper, so each tile is the only section around its title.
            <div key={prefix} className="flex flex-col gap-3">
              <h2 className="text-base font-semibold">{t(key, text)}</h2>
              <div className="grid grid-cols-12 gap-4">
                {DASHBOARD_WIDGETS.filter((widget) => widget.name.startsWith(prefix)).map(
                  (widget) => (
                    <Tile key={widget.name} widget={widget} />
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </PageContainer>
  );
};
