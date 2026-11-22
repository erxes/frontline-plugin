import {
  IconChartArea,
  IconChartBar,
  IconChartDots,
  IconChartLine,
  IconChartPie,
  IconDownload,
  IconFileTypeCsv,
  IconFileTypeXls,
  IconFilter,
  IconTable,
} from '@tabler/icons-react';
import { memberQueries } from '@erxes/core-contract/client';
import { Badge, Button, ConditionsEditor, Popover, Select, type TConditionGroup } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useCallFields } from '@/calls/CallFields.tsx';
import { useInboxFields } from '@/inbox/InboxFilter.tsx';
import { conversationTags } from '@/inbox/queries.ts';
import { useTicketReportFields } from '@/tickets/TicketFilter.tsx';
import { ticketTags } from '@/tickets/TicketLinks.tsx';
import { usePropertyFilterFields } from '@/tickets/TicketProperties.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import type { Records } from './cards.ts';
import type { TableFile } from './figures.tsx';
import type { Look } from './look.ts';
import type { Visual } from './period.ts';

const VISUAL_ICONS = {
  area: IconChartArea,
  line: IconChartLine,
  bar: IconChartBar,
  pie: IconChartPie,
  heatmap: IconChartDots,
  table: IconTable,
} satisfies Record<Visual, unknown>;

const useVisualNames = (): Record<Visual, string> => {
  const { t } = useTranslation('frontline');

  return {
    area: t('visual-area', 'Area'),
    line: t('visual-line', 'Line'),
    bar: t('visual-bar', 'Bars'),
    pie: t('visual-pie', 'Pie'),
    heatmap: t('visual-heatmap', 'Heatmap'),
    table: t('visual-table', 'Table'),
  };
};

/** The rules a filter holds, counted to its innermost. */
const ruleCount = (group: TConditionGroup | null): number =>
  group?.rules.reduce((sum, part) => sum + ('rules' in part ? ruleCount(part) : 1), 0) ?? 0;

/** The editor of a card's filter, on the fields of the list it counts. */
const FilterEditor = ({
  records,
  value,
  onChange,
}: {
  records: Records;
  value: TConditionGroup | null;
  onChange: (next: TConditionGroup | null) => void;
}) => {
  const Fields = {
    conversations: InboxConditions,
    tickets: TicketConditions,
    calls: CallConditions,
  }[records];

  return <Fields value={value} onChange={onChange} />;
};

type ConditionsProps = {
  value: TConditionGroup | null;
  onChange: (next: TConditionGroup | null) => void;
};

const conditions = (
  useFields: () => Parameters<typeof ConditionsEditor>[0]['fields'],
  tags?: Parameters<typeof ConditionsEditor>[0]['tags'],
) =>
  function Conditions({ value, onChange }: ConditionsProps) {
    return (
      <ConditionsEditor
        value={value ?? undefined}
        onChange={(next) => onChange(next?.rules.length ? next : null)}
        fields={useFields()}
        members={memberQueries}
        tags={tags}
      />
    );
  };

const InboxConditions = conditions(useInboxFields, conversationTags);
const TicketConditions = conditions(useTicketReportFields, ticketTags);
const CallConditions = conditions(useCallFields);

/** The card's filter: a button saying how many rules it holds, opening their editor. */
export const FilterButton = ({
  records,
  look,
  change,
}: {
  records: Records;
  look: Look;
  change: (patch: Partial<Look>) => void;
}) => {
  const { t } = useTranslation('frontline');
  const count = ruleCount(look.filter);

  return (
    <Popover>
      <Popover.Trigger
        render={
          <Button variant="ghost" size="sm" aria-label={t('filter', 'Filter')}>
            <IconFilter />
            <span className="hidden 2xl:inline">{t('filter', 'Filter')}</span>
            {count > 0 && <Badge variant="secondary">{count}</Badge>}
          </Button>
        }
      />
      <Popover.Content className="w-xl" align="end">
        <FilterEditor
          records={records}
          value={look.filter}
          onChange={(filter) => change({ filter })}
        />
      </Popover.Content>
    </Popover>
  );
};

/** The chart's visual, among those its figures draw in. */
export const VisualPick = ({
  visuals,
  look,
  change,
}: {
  visuals: readonly Visual[];
  look: Look;
  change: (patch: Partial<Look>) => void;
}) => {
  const { t } = useTranslation('frontline');
  const names = useVisualNames();
  const value = visuals.includes(look.visual) ? look.visual : (visuals[0] ?? 'table');
  const Icon = VISUAL_ICONS[value];

  if (visuals.length < 2) return null;

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const visual = visuals.find((one) => one === next);

        if (visual) change({ visual });
      }}
    >
      <Select.Trigger className="h-7 w-auto" aria-label={t('chart-type', 'Chart type')}>
        <Select.Value>
          <Icon className="size-4" />
        </Select.Value>
      </Select.Trigger>
      <Select.Content>
        {visuals.map((visual) => {
          const VisualIcon = VISUAL_ICONS[visual];

          return (
            <Select.Item key={visual} value={visual}>
              <VisualIcon />
              {names[visual]}
            </Select.Item>
          );
        })}
      </Select.Content>
    </Select>
  );
};

/** The custom field a "Tickets by property" card counts by. */
export const FieldPick = ({
  look,
  change,
}: {
  look: Look;
  change: (patch: Partial<Look>) => void;
}) => {
  const { t } = useTranslation('frontline');

  const fields = usePropertyFilterFields().map((field) => ({
    id: field.path.slice('subject.customFields.'.length),
    label: field.label,
  }));

  return (
    <Select
      value={look.fieldId ?? ''}
      onValueChange={(fieldId) => change({ fieldId: fieldId || null })}
    >
      <Select.Trigger className="h-7 w-auto max-w-48" aria-label={t('property', 'Property')}>
        <Select.Value>
          {fields.find((field) => field.id === look.fieldId)?.label ??
            t('pick-property', 'Pick a property')}
        </Select.Value>
      </Select.Trigger>
      <Select.Content>
        {fields.map((field) => (
          <Select.Item key={field.id} value={field.id}>
            {field.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
};

/** The card's download: its table as a CSV or an Excel workbook. */
export const DownloadButton = ({
  onPick,
  disabled,
}: {
  onPick: (file: TableFile) => void;
  disabled?: boolean;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <ActionsMenu
      trigger={
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('download', 'Download')}
          disabled={disabled}
        >
          <IconDownload />
        </Button>
      }
      actions={[
        {
          value: 'csv',
          icon: <IconFileTypeCsv />,
          label: t('download-csv', 'Download CSV'),
          onSelect: () => onPick('csv'),
        },
        {
          value: 'xlsx',
          icon: <IconFileTypeXls />,
          label: t('download-excel', 'Download Excel'),
          onSelect: () => onPick('xlsx'),
        },
      ]}
    />
  );
};
