import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { IconDots, IconEdit, IconPlus, IconTrash } from '@tabler/icons-react';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, cn, DragHandle, Skeleton } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '../orpc.ts';
import { ActionsMenu, useConfirmDelete } from '../shared/Records.tsx';
import { StatusIcon } from './StatusIcon.tsx';
import { StatusPanel } from './StatusPanel.tsx';
import {
  type Status,
  useCanManage,
  usePipelineChange,
  usePipelineRoute,
  useStages,
  useStatusPanel,
  useStatuses,
} from './queries.ts';

declare module 'react' {
  interface CSSProperties {
    '--sortable-transform'?: string;
    '--sortable-transition'?: string;
  }
}

/** Asks for "delete" to be typed, then deletes the status. */
const useDeleteStatus = () => {
  const { t } = useTranslation('frontline');
  const confirm = useConfirmDelete();
  const remove = useMutation(orpc.pipelines.statuses.remove.mutationOptions(usePipelineChange()));

  return async (status: Status) => {
    await confirm(t('confirm-delete-status', 'Delete the status {{name}}?', { name: status.name }));
    remove.mutate({ id: status.id });
  };
};

const StatusRow = ({ status, canManage }: { status: Status; canManage: boolean }) => {
  const { t } = useTranslation('frontline');
  const { open } = useStatusPanel();
  const deleteStatus = useDeleteStatus();

  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: status.id,
    disabled: !canManage,
  });

  // erxes-ui's `sortable` utility reads the drag from these two variables.
  const cssVariables = {
    '--sortable-transform': CSS.Translate.toString(transform),
    '--sortable-transition': transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={cssVariables}
      className={cn(
        'sortable flex min-h-11 items-center gap-2 rounded-md border bg-background px-2 py-1.5',
        isDragging && 'relative z-10 shadow-md',
      )}
    >
      {canManage && (
        <DragHandle
          aria-label={t('reorder-status', 'Reorder {{name}}', { name: status.name })}
          {...attributes}
          {...listeners}
        />
      )}
      <StatusIcon type={status.type} color={status.color} />
      <button
        type="button"
        disabled={!canManage}
        onClick={() => open(status.id)}
        className="flex min-w-0 flex-1 flex-col text-left"
      >
        <span className="truncate text-sm">{status.name}</span>
        {status.description && (
          <span className="truncate text-xs text-muted-foreground">{status.description}</span>
        )}
      </button>
      {canManage && (
        <ActionsMenu
          trigger={
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('status-actions', 'Actions for {{name}}', { name: status.name })}
            >
              <IconDots />
            </Button>
          }
          actions={[
            {
              value: 'edit',
              icon: <IconEdit />,
              label: t('edit', 'Edit'),
              onSelect: () => open(status.id),
            },
            {
              value: 'delete',
              icon: <IconTrash />,
              label: t('delete', 'Delete'),
              onSelect: () => void deleteStatus(status),
            },
          ]}
        />
      )}
    </li>
  );
};

/**
 * Puts a stage's statuses in their new order at once, then saves it in one
 * call; a refusal shows and the saved order comes back.
 */
const useReorder = (pipelineId: string) => {
  const queryClient = useQueryClient();
  const change = usePipelineChange();
  const queryKey = orpc.pipelines.statuses.list.queryKey({ input: { pipelineId } });

  const reorder = useMutation(
    orpc.pipelines.statuses.reorder.mutationOptions({
      onError: change.onError,
      onSettled: change.onSuccess,
    }),
  );

  return (type: number, ids: string[]) => {
    queryClient.setQueryData(queryKey, (statuses) =>
      statuses
        ?.map((status) =>
          status.type === type ? { ...status, order: ids.indexOf(status.id) } : status,
        )
        .toSorted((a, b) => a.type - b.type || a.order - b.order),
    );
    reorder.mutate({ pipelineId, type, ids });
  };
};

const Stage = ({
  type,
  label,
  statuses,
  canManage,
  onReorder,
}: {
  type: number;
  label: string;
  statuses: Status[];
  canManage: boolean;
  onReorder: (type: number, ids: string[]) => void;
}) => {
  const { t } = useTranslation('frontline');
  const { open } = useStatusPanel();
  const ids = statuses.map((status) => status.id);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;

    onReorder(type, arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  return (
    <section aria-labelledby={`stage-${type}`} className="flex flex-col gap-2">
      <header className="flex items-center gap-2">
        <StatusIcon type={type} />
        <h2 id={`stage-${type}`} className="text-sm font-semibold text-muted-foreground">
          {label}
        </h2>
        <span className="text-xs text-muted-foreground">{statuses.length}</span>
        {canManage && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            aria-label={t('add-status-to', 'Add a status to {{stage}}', { stage: label })}
            onClick={() => open(`new~${type}`)}
          >
            <IconPlus />
          </Button>
        )}
      </header>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={dragEnd}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-1">
            {statuses.map((status) => (
              <StatusRow key={status.id} status={status} canManage={canManage} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </section>
  );
};

/** A pipeline's statuses, by stage; its channel's admins add, edit, reorder and delete them. */
export const PipelineStatusesPage = () => {
  const { channelId, pipelineId } = usePipelineRoute();
  const canManage = useCanManage(channelId);
  const stages = useStages();
  const { data: statuses, error } = useStatuses(pipelineId);
  const reorder = useReorder(pipelineId);

  if (error) return <p className="text-sm text-destructive-text">{error.message}</p>;

  if (!statuses) return <Skeleton className="h-60 md:max-w-2xl" />;

  return (
    <div className="flex flex-col gap-4 md:max-w-2xl">
      {stages.map((stage) => (
        <Stage
          key={stage.type}
          type={stage.type}
          label={stage.label}
          statuses={statuses.filter((status) => status.type === stage.type)}
          canManage={canManage}
          onReorder={reorder}
        />
      ))}
      <StatusPanel pipelineId={pipelineId} statuses={statuses} />
    </div>
  );
};
