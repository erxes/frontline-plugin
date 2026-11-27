import { DndContext, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Button, DropdownMenu, TextField } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { DevicePreview } from '~/shared/DevicePreview.tsx';
import { FieldEditor } from './FieldEditor.tsx';
import { stepZone, useFieldDrag } from './fieldDrag.ts';
import { CUSTOMER_TYPES, FIELD_ICONS, INPUT_TYPES, useFieldTypeNames } from './fieldTypes.ts';
import { FormScreens } from './FormScreens.tsx';
import { type Form, type FormField, useEditForm, useFormChange } from './useForms.ts';

/**
 * A menu of every field type at once, inputs beside the customer fields they fill; picking one
 * adds that field at the end of the step.
 */
const AddField = ({ formId, pageNumber }: { formId: string; pageNumber: number }) => {
  const { t } = useTranslation('frontline');
  const names = useFieldTypeNames();
  const add = useMutation(orpc.forms.fields.add.mutationOptions(useFormChange()));

  const groups = [
    { label: t('form-field-inputs', 'Inputs'), types: INPUT_TYPES },
    { label: t('form-field-customer', 'Customer fields'), types: CUSTOMER_TYPES },
  ];

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button variant="secondary" className="self-start">
            <IconPlus />
            {t('form-add-field', 'Add field')}
          </Button>
        }
      />
      <DropdownMenu.Content align="start" className="w-auto">
        <div className="grid grid-cols-2 gap-x-1">
          {groups.map((group) => (
            <DropdownMenu.Group key={group.label} aria-label={group.label}>
              <DropdownMenu.Label>{group.label}</DropdownMenu.Label>
              {group.types.map((type) => {
                const TypeIcon = FIELD_ICONS[type];

                return (
                  <DropdownMenu.Item
                    key={type}
                    onClick={() => add.mutate({ formId, type, label: names[type], pageNumber })}
                  >
                    <TypeIcon />
                    {names[type]}
                  </DropdownMenu.Item>
                );
              })}
            </DropdownMenu.Group>
          ))}
        </div>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};

/** A step's name and the line under it, each saved as typed, and removing the step. */
const StepHeader = ({ form, pageNumber }: { form: Form; pageNumber: number }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditForm(form.id);
  const removeStep = useMutation(orpc.forms.fields.removeStep.mutationOptions(useFormChange()));
  const step = form.steps[pageNumber - 1];
  const scope = `frontline-form.${form.id}.step.${pageNumber}`;

  // An old form may have no step saved yet; the first edit saves it.
  const save = (change: { name?: string; description?: string }) =>
    edit({
      steps: Array.from({ length: Math.max(form.steps.length, pageNumber) }, (_, index) => {
        const each = form.steps[index] ?? { name: '', description: '' };

        return index === pageNumber - 1 ? { ...each, ...change } : each;
      }),
    });

  return (
    <div className="flex items-start gap-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-base font-semibold">
          <TextField
            scope={scope}
            value={step?.name ?? ''}
            placeholder={t('form-step-n', 'Step {{n}}', { n: pageNumber })}
            onSave={(name) => save({ name: name.trim() })}
          />
        </span>
        <span className="text-sm text-muted-foreground">
          <TextField
            scope={`${scope}.description`}
            value={step?.description ?? ''}
            placeholder={t('form-step-description', 'A line under the step name')}
            onSave={(description) => save({ description: description.trim() })}
          />
        </span>
      </div>
      {form.canManage && form.steps.length > 1 && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('form-remove-step', 'Remove step {{n}}', { n: pageNumber })}
          onClick={() => removeStep.mutate({ formId: form.id, pageNumber })}
        >
          <IconTrash />
        </Button>
      )}
    </div>
  );
};

/**
 * One step's card: its name, its fields in the order `ids` gives, and adding a field at its end.
 * Fields drop onto it from other steps. An empty step takes them on its own drop zone, which is
 * off once it has fields, so a field held over them lands beside one instead of on the zone.
 */
const StepCard = ({
  form,
  fields,
  ids,
  pageNumber,
}: {
  form: Form;
  fields: FormField[];
  ids: string[];
  pageNumber: number;
}) => {
  const { t } = useTranslation('frontline');
  const { setNodeRef } = useDroppable({ id: stepZone(pageNumber), disabled: ids.length > 0 });
  const own = ids.flatMap((id) => fields.find((field) => field.id === id) ?? []);

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-background p-5">
      <StepHeader form={form} pageNumber={pageNumber} />
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex min-h-10 flex-col gap-2">
          {own.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t('form-step-empty', 'No fields on this step yet.')}
            </p>
          )}
          {own.map((field) => (
            <FieldEditor key={field.id} field={field} fields={fields} canManage={form.canManage} />
          ))}
        </div>
      </SortableContext>
      {form.canManage && <AddField formId={form.id} pageNumber={pageNumber} />}
    </section>
  );
};

/**
 * A form's fields, step by step, with a live preview beside them. Unlike its settings, each
 * change saves as it is made, the way core's panel fields do, so the preview always shows what
 * visitors get.
 */
export const FormBuilder = ({ form, fields }: { form: Form; fields: FormField[] }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditForm(form.id);
  const { layout, context } = useFieldDrag(form.id, fields, Math.max(form.steps.length, 1));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      <fieldset disabled={!form.canManage} className="contents">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-3">
          <DndContext {...context}>
            {layout.map((ids, index) => (
              <StepCard
                key={stepZone(index + 1)}
                form={form}
                fields={fields}
                ids={ids}
                pageNumber={index + 1}
              />
            ))}
          </DndContext>
          {form.canManage && (
            <Button
              variant="ghost"
              className="self-start"
              onClick={() =>
                edit({
                  steps: [...form.steps, { name: '', description: '' }],
                })
              }
            >
              <IconPlus />
              {t('form-add-step', 'Add step')}
            </Button>
          )}
        </div>
      </fieldset>
      <div className="min-w-0 lg:col-span-2 lg:sticky lg:top-0 lg:self-start">
        <DevicePreview>
          <FormScreens form={form} fields={fields} />
        </DevicePreview>
      </div>
    </div>
  );
};
