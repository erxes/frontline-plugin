import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useMutation } from '@tanstack/react-query';
import { CommandBar, RecordList, Separator, Spinner, type TRecordSlotProps } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { useListDrag } from '~/shared/drag.ts';
import { useOptimistic } from '~/shared/hooks.ts';
import { DeleteButton } from '~/shared/Records.tsx';
import { WithPipeline } from './PipelinePanel.tsx';
import { type Pipeline, type Status, useStages, useStatuses } from './queries.ts';
import { StageIcon } from './StageIcon.tsx';
import { AddStatus, StatusRow, useDeleteStatuses } from './StatusRow.tsx';

/**
 * Puts a stage's statuses in their new order at once, then saves it in one
 * call; a refusal shows and the saved order comes back.
 */
const useReorder = (pipelineId: string) => {
  const queryKey = orpc.pipelines.statuses.list.queryKey({ input: { pipelineId } });

  const reorder = useMutation(
    orpc.pipelines.statuses.reorder.mutationOptions(
      useOptimistic(
        [queryKey, orpc.pipelines.choices.key()],
        (queryClient, { type, ids }: { type: number; ids: string[] }) =>
          queryClient.setQueryData(queryKey, (statuses) =>
            statuses
              ?.map((status) =>
                status.type === type ? { ...status, order: ids.indexOf(status.id) } : status,
              )
              .toSorted((a, b) => a.type - b.type || a.order - b.order),
          ),
      ),
    ),
  );

  return (type: number, ids: string[]) => reorder.mutate({ pipelineId, type, ids });
};

/** Deletes the picked statuses from the bar under the list, for the pipeline's admins. */
const StatusesCommandBar = ({ statuses }: { statuses: Status[] }) => {
  const { t } = useTranslation('frontline');
  const selection = RecordList.useSelection();
  const { deleteStatuses, isPending } = useDeleteStatuses();
  // Rows that left the list stay picked until cleared, so read the pick through the rows shown.
  const picked = statuses.filter((status) => selection.has(status.id)).map((status) => status.id);

  return (
    <CommandBar open={picked.length > 0}>
      <CommandBar.Bar>
        <CommandBar.Value onClose={selection.clear}>
          {t('n-selected', { defaultValue: '{{count}} selected', count: picked.length })}
        </CommandBar.Value>
        <Separator.Inline />
        <DeleteButton
          disabled={isPending}
          onClick={() => void deleteStatuses(picked, selection.clear)}
        />
      </CommandBar.Bar>
    </CommandBar>
  );
};

/** The statuses under their stages, a ticket's path through them; admins drag one up or down its stage. */
const Statuses = ({ pipeline, statuses }: { pipeline: Pipeline; statuses: Status[] }) => {
  const stages = useStages();
  const reorder = useReorder(pipeline.id);

  const drag = useListDrag((id) => statuses.find((status) => status.id === id)?.name ?? '');

  // A status moves only within its stage.
  const dragEnd = ({ active, over }: DragEndEvent) => {
    const moved = statuses.find((status) => status.id === active.id);
    const target = statuses.find((status) => status.id === over?.id);

    if (!moved || !target || moved.id === target.id || moved.type !== target.type) return;

    const ids = statuses.filter((status) => status.type === moved.type).map((status) => status.id);

    reorder(moved.type, arrayMove(ids, ids.indexOf(moved.id), ids.indexOf(target.id)));
  };

  const groups = stages.map((stage) => ({
    id: String(stage.type),
    label: stage.label,
    icon: <StageIcon type={stage.type} />,
    rows: statuses.filter((status) => status.type === stage.type),
    action: pipeline.canManage ? (
      <AddStatus pipelineId={pipeline.id} type={stage.type} stage={stage.label} />
    ) : undefined,
  }));

  return (
    <RecordList.Provider listId={`frontline-pipeline-statuses.${pipeline.id}`}>
      <DndContext {...drag} onDragEnd={dragEnd}>
        <SortableContext
          items={statuses.map((status) => status.id)}
          strategy={verticalListSortingStrategy}
        >
          <RecordList
            groups={groups}
            rowId={(status) => status.id}
            rowLabel={(status) => status.name}
            renderRow={(status) => <StatusRow status={status} canManage={pipeline.canManage} />}
          />
        </SortableContext>
      </DndContext>
      {pipeline.canManage && <StatusesCommandBar statuses={statuses} />}
    </RecordList.Provider>
  );
};

const StatusesOf = ({ pipeline }: { pipeline: Pipeline }) => {
  const { data, error } = useStatuses(pipeline.id);

  if (error) return <p className="p-3 text-xs text-destructive-text">{error.message}</p>;

  if (!data) return <Spinner area="lg" />;

  return <Statuses pipeline={pipeline} statuses={data} />;
};

/**
 * The Ticket statuses tab: the stages a ticket moves through, each with its statuses in order.
 * Its channel's admins add, rename, recolour, reorder and delete them in place.
 */
export const PipelineStatuses = ({ contentId }: TRecordSlotProps) => (
  <WithPipeline id={contentId}>{(pipeline) => <StatusesOf pipeline={pipeline} />}</WithPipeline>
);
