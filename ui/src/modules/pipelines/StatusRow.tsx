import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  type Icon,
  IconCircle,
  IconCircleCheck,
  IconCircleDashed,
  IconCircleDashedCheck,
  IconCircleDot,
  IconCircleX,
  IconDots,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Button, cn, ColorPicker, DragHandle, Input, Popover, TextField } from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { textOf } from '~/shared/hooks.ts';
import { ActionsMenu, useConfirmDelete } from '~/shared/Records.tsx';
import { type Status, usePipelineChange } from './queries.ts';

declare module 'react' {
  interface CSSProperties {
    '--sortable-transform'?: string;
    '--sortable-transition'?: string;
  }
}

/** Each stage's icon, by `type`. */
const STAGE_ICONS: Record<number, Icon> = {
  1: IconCircle,
  2: IconCircleDot,
  3: IconCircleDashed,
  4: IconCircleCheck,
  5: IconCircleDashedCheck,
  6: IconCircleX,
};

/** The stage's icon. */
export const StageIcon = ({ type }: { type: number }) => {
  const StageGlyph = STAGE_ICONS[type] ?? IconCircle;

  return <StageGlyph aria-hidden className="size-4 shrink-0 text-muted-foreground" />;
};

/** Asks for "delete" to be typed, then deletes the statuses, all of them or none. */
export const useDeleteStatuses = () => {
  const { t } = useTranslation('frontline');
  const confirm = useConfirmDelete();
  const remove = useMutation(orpc.pipelines.statuses.remove.mutationOptions(usePipelineChange()));

  const deleteStatuses = async (ids: string[], done?: () => void) => {
    await confirm(
      t('delete-statuses-confirm', {
        defaultValue_one: 'Delete this status?',
        defaultValue_other: 'Delete {{count}} statuses?',
        count: ids.length,
      }),
    );
    remove.mutate({ ids }, { onSuccess: done });
  };

  return { deleteStatuses, isPending: remove.isPending };
};

/** The header's "+": names a new status, added last in the stage with the default colour. */
export const AddStatus = ({
  pipelineId,
  type,
  stage,
}: {
  pipelineId: string;
  type: number;
  stage: string;
}) => {
  const { t } = useTranslation('frontline');
  const change = usePipelineChange();
  const [open, setOpen] = useState(false);

  const create = useMutation(
    orpc.pipelines.statuses.create.mutationOptions({
      ...change,
      onSuccess: async () => {
        setOpen(false);
        await change.onSuccess();
      },
    }),
  );

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate({
      pipelineId,
      type,
      name: textOf(new FormData(event.currentTarget).get('name')),
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('add-status-to', 'Add a status to {{stage}}', { stage })}
          />
        }
      >
        <IconPlus />
      </Popover.Trigger>
      <Popover.Content align="end" className="w-72">
        <form onSubmit={submit} className="flex gap-2 p-2">
          <Input
            name="name"
            required
            aria-label={t('status-name', 'Status name')}
            placeholder={t('status-name', 'Status name')}
          />
          <Button type="submit" disabled={create.isPending}>
            {t('add', 'Add')}
          </Button>
        </form>
      </Popover.Content>
    </Popover>
  );
};

/**
 * A status's row in its stage: the drag handle that moves it, its colour, name and description
 * edited in place, and its menu. A member who can't change the pipeline only reads it.
 */
export const StatusRow = ({ status, canManage }: { status: Status; canManage: boolean }) => {
  const { t } = useTranslation('frontline');
  const { deleteStatuses } = useDeleteStatuses();
  const update = useMutation(orpc.pipelines.statuses.update.mutationOptions(usePipelineChange()));
  const scope = `frontline-status.${status.id}`;

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
    <fieldset
      ref={setNodeRef}
      style={cssVariables}
      disabled={!canManage}
      className={cn(
        'sortable flex min-w-0 flex-1 items-center gap-1 bg-inherit [&_button:disabled]:cursor-default [&_button:disabled]:opacity-100',
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
      <ColorPicker
        aria-label={t('status-color', 'Colour of {{name}}', { name: status.name })}
        value={status.color}
        onValueChange={(color) => update.mutate({ id: status.id, color })}
        className="w-12 flex-none"
      />
      <span className="min-w-0 flex-1">
        <TextField
          scope={`${scope}.name`}
          value={status.name}
          placeholder={t('name', 'Name')}
          onSave={(name) => {
            const next = name.trim();

            if (next && next !== status.name) update.mutate({ id: status.id, name: next });
          }}
        />
      </span>
      <span className="min-w-0 flex-1 text-muted-foreground">
        <TextField
          scope={`${scope}.description`}
          value={status.description ?? ''}
          placeholder={t('description', 'Description')}
          onSave={(description) => update.mutate({ id: status.id, description })}
        />
      </span>
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
              value: 'delete',
              icon: <IconTrash />,
              label: t('delete', 'Delete'),
              onSelect: () => void deleteStatuses([status.id]),
            },
          ]}
        />
      )}
    </fieldset>
  );
};
