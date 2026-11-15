import { Select } from 'erxes-ui';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useChannels } from '../channels/useChannels.ts';
import {
  PRIORITIES,
  type Priority,
  usePipelines,
  usePriorityName,
  useStatuses,
} from '../pipelines/queries.ts';
import { StatusIcon } from '../pipelines/StatusIcon.tsx';

/** Picks "all" on a filter, which reads as no value. */
export const ALL = 'all';

type Variant = ComponentProps<typeof Select.Trigger>['variant'];

/** A select of `options`; `all` adds a first row that clears it. */
const Picker = ({
  label,
  value,
  onChange,
  options,
  all,
  variant = 'bordered',
  className,
  disabled,
  children,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: { value: string; label: ReactNode }[];
  all?: string;
  variant?: Variant;
  className?: string;
  disabled?: boolean;
  children?: ReactNode;
}) => (
  <Select
    value={value ?? (all ? ALL : '')}
    onValueChange={(next) => onChange(next === ALL ? null : next)}
    disabled={disabled}
  >
    <Select.Trigger variant={variant} aria-label={label} className={className}>
      {children ?? <Select.Value placeholder={label} />}
    </Select.Trigger>
    <Select.Content>
      {all && <Select.Item value={ALL}>{all}</Select.Item>}
      {options.map((option) => (
        <Select.Item key={option.value} value={option.value}>
          {option.label}
        </Select.Item>
      ))}
    </Select.Content>
  </Select>
);

type PickerProps = Omit<ComponentProps<typeof Picker>, 'options' | 'label'> & { label?: string };

/** The channels the member belongs to. */
export const ChannelSelect = (props: PickerProps) => {
  const { t } = useTranslation('frontline');
  const channels = useChannels().data?.channels ?? [];

  return (
    <Picker
      label={t('channel', 'Channel')}
      options={channels.map((channel) => ({ value: channel.id, label: channel.name }))}
      {...props}
    />
  );
};

/** A channel's pipelines; none until a channel is picked. */
export const PipelineSelect = ({ channelId, ...props }: PickerProps & { channelId: string }) => {
  const { t } = useTranslation('frontline');
  const { pipelines } = usePipelines(channelId);

  return (
    <Picker
      label={t('pipeline', 'Pipeline')}
      options={pipelines.map((pipeline) => ({ value: pipeline.id, label: pipeline.name }))}
      disabled={!channelId}
      {...props}
    />
  );
};

/** A pipeline's statuses by stage, each with its stage's icon. */
export const StatusSelect = ({ pipelineId, ...props }: PickerProps & { pipelineId: string }) => {
  const { t } = useTranslation('frontline');
  const statuses = useStatuses(pipelineId).data ?? [];

  return (
    <Picker
      label={t('status', 'Status')}
      options={statuses.map((status) => ({
        value: status.id,
        label: (
          <span className="flex items-center gap-2">
            <StatusIcon type={status.type} color={status.color} />
            {status.name}
          </span>
        ),
      }))}
      disabled={!pipelineId}
      {...props}
    />
  );
};

/** The five priorities, from none to critical. */
export const PrioritySelect = ({
  value,
  onChange,
  ...props
}: Omit<PickerProps, 'value' | 'onChange'> & {
  value: number | null;
  onChange: (priority: Priority | null) => void;
}) => {
  const { t } = useTranslation('frontline');
  const nameOf = usePriorityName();

  return (
    <Picker
      label={t('priority', 'Priority')}
      value={value === null ? null : String(value)}
      onChange={(next) =>
        onChange(PRIORITIES.find((priority) => String(priority) === next) ?? null)
      }
      options={PRIORITIES.map((priority) => ({ value: String(priority), label: nameOf(priority) }))}
      {...props}
    />
  );
};
