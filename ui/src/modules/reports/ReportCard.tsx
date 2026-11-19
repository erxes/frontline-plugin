import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';
import { IconArrowsHorizontal, IconDeviceFloppy, IconDots, IconTrash } from '@tabler/icons-react';
import { Button, DragHandle, localTimeZone, Skeleton, TextField, toast } from 'erxes-ui';
import { type ReactNode, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { RetryButton } from '~/shared/List.tsx';
import { ActionsMenu, useConfirmDelete } from '~/shared/Records.tsx';
import { DownloadButton, FieldPick, FilterButton, VisualPick } from './CardControls.tsx';
import { PeriodPick } from './PeriodPick.tsx';
import { CardRecords } from './CardRecords.tsx';
import type { CardBody, CardInput, CardSpec } from './cards.ts';
import { FiguresView, saveTable, useFiguresTable, VISUALS } from './figures.tsx';
import {
  type Look,
  type SavedChart,
  useLook,
  useRemoveChart,
  useSaveChart,
  useUpdateChart,
} from './look.ts';
import { minuteEnd, rangeOf, type Visual } from './period.ts';
import { listFilter, useExportRecords } from './records.ts';
import { everyFewSeconds } from './Tile.tsx';

/** Where a card sits on its page, and its handle's drag props. */
export type Placement = {
  wide: boolean;
  onWide: (wide: boolean) => void;
  handle: { attributes: DraggableAttributes; listeners: DraggableSyntheticListeners };
};

/** The card's name: a saved chart's, edited in place for everyone, or the card's own. */
const CardTitle = ({ spec, chart }: { spec: CardSpec; chart?: SavedChart }) => {
  const { t } = useTranslation('frontline');
  const update = useUpdateChart();

  if (!chart) return <h3 className="truncate text-sm font-semibold">{t(...spec.title)}</h3>;

  return (
    <TextField
      scope={`frontline-report-charts.${chart.id}.name`}
      value={chart.name}
      placeholder={t('chart-name', 'Chart name')}
      onSave={(name) => {
        const next = name.trim();

        if (next && next !== chart.name) update.mutate({ id: chart.id, name: next });
      }}
    />
  );
};

/** The card's menu: save it as a chart everyone sees, its width, and removing a saved one. */
const CardMenu = ({
  spec,
  chart,
  look,
  placement,
}: {
  spec: CardSpec;
  chart?: SavedChart;
  look: Look;
  placement: Placement;
}) => {
  const { t } = useTranslation('frontline');
  const save = useSaveChart();
  const remove = useRemoveChart();
  const confirmDelete = useConfirmDelete();
  const name = chart?.name ?? t(...spec.title);

  const actions = [
    ...(chart
      ? []
      : [
          {
            value: 'save',
            icon: <IconDeviceFloppy />,
            label: t('save-chart', 'Save as a chart'),
            onSelect: () =>
              save.mutate(
                { ...look, name, section: spec.section, kind: spec.kind },
                { onSuccess: () => toast({ title: t('chart-saved', 'Chart saved') }) },
              ),
          },
        ]),
    {
      value: 'width',
      icon: <IconArrowsHorizontal />,
      label: placement.wide ? t('half-width', 'Half width') : t('full-width', 'Full width'),
      onSelect: () => placement.onWide(!placement.wide),
    },
    ...(chart
      ? [
          {
            value: 'remove',
            icon: <IconTrash />,
            label: t('remove-chart', 'Remove chart'),
            onSelect: () =>
              void confirmDelete(
                t('remove-chart-confirm', 'Remove “{{name}}” for everyone?', { name }),
              ).then(() => remove.mutate({ id: chart.id })),
          },
        ]
      : []),
  ];

  return (
    <ActionsMenu
      trigger={
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('chart-actions', '{{name}} actions', { name })}
        >
          <IconDots />
        </Button>
      }
      actions={actions}
    />
  );
};

/** The card's frame: its handle, name and controls in the header, `children` under it. */
const CardFrame = ({
  spec,
  chart,
  look,
  change,
  placement,
  visuals,
  download,
  children,
}: {
  spec: CardSpec;
  chart?: SavedChart;
  look: Look;
  change: (patch: Partial<Look>) => void;
  placement: Placement;
  visuals: readonly Visual[];
  download: ReactNode;
  children: ReactNode;
}) => {
  const { t } = useTranslation('frontline');
  const name = chart?.name ?? t(...spec.title);

  return (
    <>
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <DragHandle
          aria-label={t('move-chart', 'Move {{name}}', { name })}
          {...placement.handle.attributes}
          {...placement.handle.listeners}
        />
        <div className="min-w-0 flex-1">
          <CardTitle spec={spec} chart={chart} />
        </div>
        <div className="flex shrink-0 items-center justify-end gap-1">
          {spec.property && <FieldPick look={look} change={change} />}
          <PeriodPick look={look} change={change} />
          <FilterButton records={spec.records} look={look} change={change} />
          <VisualPick visuals={visuals} look={look} change={change} />
          {download}
          <CardMenu spec={spec} chart={chart} look={look} placement={placement} />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
        <div className="my-auto has-[table]:my-0">{children}</div>
      </div>
    </>
  );
};

/** What the card asks its report or list for: its period's bounds, the browser's zone, its filter. */
const useInput = (look: Look): CardInput => {
  const now = useSyncExternalStore(everyFewSeconds, minuteEnd);

  return {
    ...rangeOf(look.period, now, look),
    timeZone: localTimeZone() ?? 'UTC',
    filter: look.filter ? JSON.stringify(look.filter) : undefined,
    fieldId: look.fieldId,
  };
};

type ChartSpec = Exclude<CardSpec, { draws: 'list' }>;

type CardProps<Spec> = { spec: Spec; chart?: SavedChart; placement: Placement };

/** A chart's report drawn as its look says, and downloaded as the table of its numbers. */
const Chart = ({
  spec,
  chart,
  placement,
  look,
  change,
  body,
}: CardProps<ChartSpec> & {
  look: Look;
  change: (patch: Partial<Look>) => void;
  body: CardBody;
}) => {
  const { t } = useTranslation('frontline');
  const table = useFiguresTable(body.figures);
  const name = chart?.name ?? t(...spec.title);

  return (
    <CardFrame
      spec={spec}
      chart={chart}
      look={look}
      change={change}
      placement={placement}
      visuals={VISUALS[spec.draws]}
      download={
        <DownloadButton
          disabled={!body.figures}
          onPick={(file) => {
            const { heads, rows } = table();

            void saveTable(file, name, heads, rows);
          }}
        />
      }
    >
      {spec.property && !look.fieldId ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t('pick-property-hint', 'Pick the property to count tickets by.')}
        </p>
      ) : body.error ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-sm text-destructive">{body.error.message}</p>
          <RetryButton error={body.error} retry={body.refetch} />
        </div>
      ) : body.figures ? (
        <FiguresView figures={body.figures} visual={look.visual} empty={t(...spec.empty)} />
      ) : (
        <Skeleton className="h-48" />
      )}
    </CardFrame>
  );
};

/** A chart card: its report over its own period and filter. */
const ChartCard = ({ spec, chart, placement }: CardProps<ChartSpec>) => {
  const { look, change } = useLook(spec, chart);
  const input = useInput(look);

  return (
    <spec.Body input={input} filter={look.filter}>
      {(body) => (
        <Chart
          spec={spec}
          chart={chart}
          placement={placement}
          look={look}
          change={change}
          body={body}
        />
      )}
    </spec.Body>
  );
};

/** The Facebook page's list keeps to Facebook and Instagram conversations. */
const META_RULES = [{ path: 'subject.kind', op: 'in' as const, value: ['facebook', 'instagram'] }];

/** A list card: the records its filter keeps in its period, downloaded in full. */
const ListCard = ({ spec, chart, placement }: CardProps<CardSpec>) => {
  const { t } = useTranslation('frontline');
  const { look, change } = useLook(spec, chart);
  const input = useInput(look);
  const exportRecords = useExportRecords(spec.records);
  const [exporting, setExporting] = useState(false);
  const name = chart?.name ?? t(...spec.title);

  const filter = listFilter(
    spec.records,
    look.filter,
    input,
    spec.section === 'meta' ? META_RULES : [],
  );

  return (
    <CardFrame
      spec={spec}
      chart={chart}
      look={look}
      change={change}
      placement={placement}
      visuals={[]}
      download={
        <DownloadButton
          disabled={exporting}
          onPick={(file) => {
            setExporting(true);
            toast({ title: t('exporting', 'Preparing the download…') });
            exportRecords(filter)
              .then(({ heads, rows }) => saveTable(file, name, heads, rows))
              .catch((error: unknown) =>
                toast({
                  variant: 'destructive',
                  title: error instanceof Error ? error.message : String(error),
                }),
              )
              .finally(() => setExporting(false));
          }}
        />
      }
    >
      <CardRecords records={spec.records} filter={filter} empty={t(...spec.empty)} />
    </CardFrame>
  );
};

/** A card of a report page: a chart or a list, as its spec says. */
export const ReportCard = ({ spec, chart, placement }: CardProps<CardSpec>) =>
  spec.draws === 'list' ? (
    <ListCard spec={spec} chart={chart} placement={placement} />
  ) : (
    <ChartCard spec={spec} chart={chart} placement={placement} />
  );
