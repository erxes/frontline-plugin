import { DndContext, useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { IconForms, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Button, PageContainer, ScrollArea, Skeleton, TextField } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import { DevicePreview } from '~/shared/DevicePreview.tsx';
import { AppHeader } from '~/shared/Header.tsx';
import { ListError } from '~/shared/List.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import { FieldEditor } from './FieldEditor.tsx';
import { stepZone, useFieldDrag } from './fieldDrag.ts';
import { FIELD_ICONS, FIELD_TYPES, useFieldTypeNames } from './fieldTypes.ts';
import { FormPreview } from './FormPreview.tsx';
import {
  FORMS_PATH,
  type Form,
  type FormField,
  useEditForm,
  useForm,
  useFormChange,
  useFormFields,
} from './useForms.ts';

/** Forms, then the form, then `label`, as core's breadcrumb draws it. */
export const FormHeader = ({ form, label }: { form?: Form; label: string }) => {
  const { t } = useTranslation('frontline');

  return (
    <AppHeader
      icon={IconForms}
      app={{ label: t('forms', 'Forms'), to: FORMS_PATH }}
      levels={[
        { label: form?.name ?? '…', to: `${FORMS_PATH}/${encodeURIComponent(form?.id ?? '')}` },
        { label },
      ]}
    />
  );
};

/** A menu of field types; picking one adds that field at the end of the step. */
const AddField = ({ formId, pageNumber }: { formId: string; pageNumber: number }) => {
  const { t } = useTranslation('frontline');
  const types = useFieldTypeNames();
  const add = useMutation(orpc.forms.fields.add.mutationOptions(useFormChange()));

  return (
    <ActionsMenu
      trigger={
        <Button variant="secondary" className="self-start">
          <IconPlus />
          {t('form-add-field', 'Add field')}
        </Button>
      }
      actions={FIELD_TYPES.map((type) => {
        const TypeIcon = FIELD_ICONS[type];

        return {
          value: type,
          icon: <TypeIcon />,
          label: types[type],
          onSelect: () => add.mutate({ formId, type, label: types[type], pageNumber }),
        };
      })}
    />
  );
};

/**
 * One step's card: its name, its fields in the order `ids` gives, and adding a field at its end.
 * Fields drop onto it from other steps, an empty one too.
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
  const edit = useEditForm(form.id);
  const removeStep = useMutation(orpc.forms.fields.removeStep.mutationOptions(useFormChange()));
  const { setNodeRef } = useDroppable({ id: stepZone(pageNumber) });
  const own = ids.flatMap((id) => fields.find((field) => field.id === id) ?? []);
  const step = form.steps[pageNumber - 1];

  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-background p-5">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-base font-semibold">
          <TextField
            scope={`frontline-form.${form.id}.step.${pageNumber}`}
            value={step?.name ?? ''}
            placeholder={t('form-step-n', 'Step {{n}}', { n: pageNumber })}
            onSave={(name) =>
              edit({
                steps: form.steps.map((each, index) =>
                  index === pageNumber - 1 ? { ...each, name: name.trim() } : each,
                ),
              })
            }
          />
        </span>
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

const Builder = ({ form, fields }: { form: Form; fields: FormField[] }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditForm(form.id);
  const { layout, context } = useFieldDrag(form.id, fields, Math.max(form.steps.length, 1));

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 p-6 lg:flex">
      <fieldset disabled={!form.canManage} className="contents">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
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
                  steps: [
                    ...form.steps,
                    {
                      name: t('form-step-n', 'Step {{n}}', { n: form.steps.length + 1 }),
                      description: '',
                    },
                  ],
                })
              }
            >
              <IconPlus />
              {t('form-add-step', 'Add step')}
            </Button>
          )}
        </div>
      </fieldset>
      <div className="min-w-0 flex-1 lg:sticky lg:top-0 lg:self-start">
        <DevicePreview>
          <FormPreview form={form} fields={fields} />
        </DevicePreview>
      </div>
    </div>
  );
};

/**
 * A form's fields, step by step, with a live preview beside them. Unlike a settings page, each
 * change saves as it is made, the way core's panel fields do, so the preview always shows what
 * visitors get.
 */
export const FormBuilderPage = () => {
  const { t } = useTranslation('frontline');
  const id = useParams().id ?? '';
  const form = useForm(id);
  const fields = useFormFields(id);
  const error = form.error ?? fields.error;

  return (
    <PageContainer>
      <FormHeader form={form.data} label={t('form-builder', 'Builder')} />
      <ScrollArea>
        {error ? (
          <ListError error={error} />
        ) : form.data && fields.data ? (
          <Builder form={form.data} fields={fields.data} />
        ) : (
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 p-6 lg:flex">
            <Skeleton className="h-80 flex-1" />
            <Skeleton className="h-80 flex-1" />
          </div>
        )}
      </ScrollArea>
    </PageContainer>
  );
};
