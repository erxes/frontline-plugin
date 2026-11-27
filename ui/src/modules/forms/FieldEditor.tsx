import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconChevronDown, IconChevronRight, IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  cn,
  Collapsible,
  DragHandle,
  Label,
  Select,
  Switch,
  TextField,
  useConfirm,
} from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { FieldSettings } from './FieldSettings.tsx';
import { convertibleTo, FIELD_ICONS, takesValidator, useFieldTypeNames } from './fieldTypes.ts';
import { type FormField, useFormChange } from './useForms.ts';

/**
 * The field's type, changed in place to one whose answers read alike; its label, settings and
 * answers stay. A validator goes when the new type takes none.
 */
const TypeSelect = ({ field }: { field: FormField }) => {
  const { t } = useTranslation('frontline');
  const names = useFieldTypeNames();
  const update = useMutation(orpc.forms.fields.update.mutationOptions(useFormChange()));
  const types = convertibleTo(field.type);

  return (
    <Select
      value={field.type}
      disabled={types.length < 2}
      onValueChange={(next) => {
        const type = types.find((each) => each === next);

        if (!type || type === field.type) return;

        update.mutate({
          id: field.id,
          type,
          ...(takesValidator({ type }) ? {} : { validator: null }),
        });
      }}
    >
      <Select.Trigger
        className="w-36 shrink-0"
        aria-label={t('field-type', 'Type of {{label}}', { label: field.label })}
      >
        <Select.Value />
      </Select.Trigger>
      <Select.Content>
        {types.map((type) => {
          const TypeIcon = FIELD_ICONS[type];

          return (
            <Select.Item key={type} value={type}>
              <span className="flex items-center gap-2 truncate">
                <TypeIcon />
                {names[type]}
              </span>
            </Select.Item>
          );
        })}
      </Select.Content>
    </Select>
  );
};

/** The end of a field's row: its type, whether it's required, and removing it. */
const FieldRowEnd = ({ field, canManage }: { field: FormField; canManage: boolean }) => {
  const { t } = useTranslation('frontline');
  const change = useFormChange();
  const update = useMutation(orpc.forms.fields.update.mutationOptions(change));
  const remove = useMutation(orpc.forms.fields.remove.mutationOptions(change));
  const { confirm } = useConfirm();
  const requiredId = `frontline-field-${field.id}-required`;

  // Removing a field also drops the show and hide rules other fields have on it.
  const confirmRemove = () =>
    void confirm({
      message: t('field-remove-confirm', 'Remove {{label}} and the rules that use it?', {
        label: field.label || t('field-untitled', 'Untitled field'),
      }),
      options: { okLabel: t('remove', 'Remove'), variants: { ok: 'destructive' } },
    }).then(() => remove.mutate({ ids: [field.id] }));

  return (
    <>
      <TypeSelect field={field} />
      <div className="flex shrink-0 items-center gap-2 px-1">
        <Switch
          id={requiredId}
          aria-label={t('field-required', 'Required')}
          checked={field.isRequired}
          onCheckedChange={(isRequired) => update.mutate({ id: field.id, isRequired })}
        />
        {/* A narrow row leaves the label its room; the switch keeps its name. */}
        <Label htmlFor={requiredId} className="hidden @xl:inline">
          {t('field-required', 'Required')}
        </Label>
      </div>
      {canManage && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('field-remove', 'Remove {{label}}', { label: field.label })}
          onClick={confirmRemove}
        >
          <IconTrash />
        </Button>
      )}
    </>
  );
};

/**
 * One field of the builder, edited in place and dragged by its handle, within its step or to
 * another: its label, type and whether it's required in the row, the rest folded under it. Each
 * change saves as it's made.
 */
export const FieldEditor = ({
  field,
  fields,
  canManage,
}: {
  field: FormField;
  fields: FormField[];
  canManage: boolean;
}) => {
  const { t } = useTranslation('frontline');
  const [open, setOpen] = useState(false);
  const update = useMutation(orpc.forms.fields.update.mutationOptions(useFormChange()));

  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: field.id,
    disabled: !canManage,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        '--sortable-transform': CSS.Translate.toString(transform),
        '--sortable-transition': transition,
      }}
      className={cn(
        'sortable rounded-lg border bg-background',
        isDragging && 'relative z-10 shadow-lg',
      )}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="@container flex items-center gap-1 p-1.5">
          {canManage && (
            <DragHandle
              aria-label={t('field-move', 'Move {{label}}', { label: field.label })}
              {...attributes}
              {...listeners}
            />
          )}
          <Collapsible.Trigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('field-settings', 'Settings of {{label}}', { label: field.label })}
              />
            }
          >
            {open ? <IconChevronDown /> : <IconChevronRight />}
          </Collapsible.Trigger>
          <span className="min-w-0 flex-1">
            <TextField
              scope={`frontline-field.${field.id}.label`}
              value={field.label ?? ''}
              placeholder={t('field-label', 'Label')}
              onSave={(label) => update.mutate({ id: field.id, label: label.trim() })}
            />
          </span>
          <FieldRowEnd field={field} canManage={canManage} />
        </div>
        <Collapsible.Panel>
          <FieldSettings field={field} fields={fields} />
        </Collapsible.Panel>
      </Collapsible>
    </div>
  );
};
