import {
  IconAlignLeft,
  IconArrowBarToRight,
  IconCalendarPlus,
  IconCalendarUp,
  IconCircles,
  IconDots,
  IconLetterCase,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  PanelField,
  PanelSection,
  Skeleton,
  Spinner,
  TextField,
  type TRecordSlotProps,
  useFormat,
} from 'erxes-ui';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChannel } from '@/channels/useChannels.ts';
import { orpc } from '~/orpc.ts';
import { ActionsMenu } from '~/shared/Records.tsx';
import { MoveToChannelDialog } from '~/shared/MoveToChannel.tsx';
import { TicketFields } from './PipelineTickets.tsx';
import {
  type Pipeline,
  useDeletePipelines,
  useEditPipeline,
  usePipeline,
  usePipelineChange,
} from './queries.ts';
import { InfoRow } from '~/shared/Panel.tsx';
import { MemberLine } from '~/shared/MemberLine.tsx';

/**
 * The pipeline's menu, behind `trigger`: move it to another channel the member is an admin of,
 * or delete it. Members who can't change it get no menu.
 */
export const PipelineMenu = ({
  pipeline,
  trigger,
}: {
  pipeline: Pipeline;
  trigger: ComponentProps<typeof ActionsMenu>['trigger'];
}) => {
  const { t } = useTranslation('frontline');
  const { deletePipelines } = useDeletePipelines();
  const move = useMutation(orpc.pipelines.update.mutationOptions(usePipelineChange()));
  const [moving, setMoving] = useState(false);

  if (!pipeline.canManage) return null;

  return (
    <>
      <ActionsMenu
        trigger={trigger}
        actions={[
          {
            value: 'move',
            icon: <IconArrowBarToRight />,
            label: t('move-to-channel', 'Move to channel'),
            onSelect: () => setMoving(true),
          },
          {
            value: 'delete',
            icon: <IconTrash />,
            label: t('delete', 'Delete'),
            onSelect: () => void deletePipelines([pipeline.id]),
          },
        ]}
      />
      {moving && (
        <MoveToChannelDialog
          name={pipeline.name}
          channelId={pipeline.channelId}
          onMove={(channelId) => move.mutateAsync({ id: pipeline.id, channelId })}
          onClose={() => setMoving(false)}
        />
      )}
    </>
  );
};

/** A slot's pipeline: a spinner while it loads, the refusal when the API gives one. */
export const WithPipeline = ({
  id,
  children,
}: {
  id: string;
  children: (pipeline: Pipeline) => ReactNode;
}) => {
  const pipeline = usePipeline(id);

  if (pipeline.isPending) return <Spinner area="lg" />;

  if (pipeline.isError) {
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {pipeline.error.message}
      </p>
    );
  }

  return children(pipeline.data);
};

/** The panel header's title: the pipeline's name. */
export const PipelineTitle = ({ contentId }: TRecordSlotProps) => {
  const pipeline = usePipeline(contentId);

  if (pipeline.isPending) return <Skeleton className="h-4 w-32" />;

  return <span className="truncate">{pipeline.data?.name ?? pipeline.error?.message}</span>;
};

/** The header's menu, for its channel's admins. */
export const PipelineActions = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const { data } = usePipeline(contentId);

  if (!data) return null;

  return (
    <PipelineMenu
      pipeline={data}
      trigger={
        <Button variant="ghost" size="icon" aria-label={t('pipeline-menu', 'Pipeline actions')}>
          <IconDots />
        </Button>
      }
    />
  );
};

/** The pipeline's name and description, edited in place, and where and when it was made. */
const PipelineFields = ({ pipeline }: { pipeline: Pipeline }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const edit = useEditPipeline(pipeline.id);
  const channel = useChannel(pipeline.channelId);
  const scope = `frontline-pipeline.${pipeline.id}`;

  return (
    <PanelSection title={t('pipeline', 'Pipeline')}>
      <fieldset
        disabled={!pipeline.canManage}
        className="contents [&_button:disabled]:cursor-default [&_button:disabled]:opacity-100"
      >
        <PanelField icon={IconLetterCase} label={t('name', 'Name')}>
          <TextField
            scope={`${scope}.name`}
            value={pipeline.name}
            placeholder={t('name', 'Name')}
            onSave={(name) => {
              const next = name.trim();

              if (next && next !== pipeline.name) edit({ name: next });
            }}
          />
        </PanelField>
        <PanelField icon={IconAlignLeft} label={t('description', 'Description')}>
          <TextField
            scope={`${scope}.description`}
            value={pipeline.description ?? ''}
            placeholder={t('description', 'Description')}
            onSave={(description) => edit({ description })}
          />
        </PanelField>
      </fieldset>
      <PanelField icon={IconCircles} label={t('channel', 'Channel')} cell={false}>
        <span className="truncate px-2 text-xs">{channel.data?.name}</span>
      </PanelField>
      <InfoRow icon={IconUser} label={t('created-by', 'Created by')}>
        <MemberLine id={pipeline.createdBy} />
      </InfoRow>
      <InfoRow icon={IconCalendarPlus} label={t('created-at', 'Created at')}>
        {format.dateTime(pipeline.createdAt)}
      </InfoRow>
      <InfoRow icon={IconCalendarUp} label={t('updated-at', 'Updated at')}>
        {format.dateTime(pipeline.updatedAt)}
      </InfoRow>
    </PanelSection>
  );
};

/** The Detail tab: the pipeline's fields, then how its tickets are numbered and named. */
export const PipelineDetail = ({ contentId }: TRecordSlotProps) => (
  <WithPipeline id={contentId}>
    {(pipeline) => (
      <>
        <PipelineFields pipeline={pipeline} />
        <TicketFields pipeline={pipeline} />
      </>
    )}
  </WithPipeline>
);
