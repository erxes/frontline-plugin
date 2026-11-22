import { IconChevronRight } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { channelPath } from '~/shared/channelScope.ts';
import { KindIcon } from '~/shared/kinds.tsx';
import { integrationsQuery } from '~/shared/reference.ts';
import { CHANNEL_KINDS, useKindHints, useKindTitles } from './kindText.ts';

/**
 * Every kind of integration that brings a channel conversations, a card each as old erxes listed
 * them: its mark on a tile, its name and what it brings, and how many the channel has. A card
 * opens the kind inside the channel, where one is added.
 */
export const IntegrationCatalog = ({ channelId }: { channelId: string }) => {
  const { t } = useTranslation('frontline');
  const titles = useKindTitles();
  const hints = useKindHints();

  const ours = (useQuery(integrationsQuery).data ?? []).filter(
    (integration) => integration.channelId === channelId,
  );

  return (
    <ul
      aria-label={t('kinds-of-integration', 'Kinds of integration')}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      {CHANNEL_KINDS.map((kind) => {
        const count = ours.filter((integration) => integration.kind === kind).length;

        return (
          <li key={kind}>
            <Link
              to={channelPath(channelId, 'settings', `integrations/${kind}`)}
              className="group flex h-full flex-col gap-3 rounded-lg border bg-background p-4 transition-colors hover:border-ring/60 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
                  <KindIcon kind={kind} className="size-6" />
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{titles[kind] ?? kind}</span>
                  <span className="text-xs text-muted-foreground">{hints[kind]}</span>
                </span>
              </span>
              <span className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
                {count > 0
                  ? t('kind-connected', {
                      defaultValue_one: '{{count}} in this channel',
                      defaultValue_other: '{{count}} in this channel',
                      count,
                    })
                  : t('kind-none', 'None yet')}
                <IconChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
};
