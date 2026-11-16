import { IconForms, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Button, PageContainer, ScrollArea, Skeleton, TextField } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import { AppHeader } from '~/shared/Header.tsx';
import { ListError } from '~/shared/List.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import { FieldEditor } from './FieldEditor.tsx';
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

/** One step's card: its name, its fields in order, and adding a field at its end. */
const StepCard = ({
  form,
  fields,
  pageNumber,
}: {
  form: Form;
  fields: FormField[];
  pageNumber: number;
}) => {
  const { t } = useTranslation('frontline');
  const edit = useEditForm(form.id);
  const change = useFormChange();
  const arrange = useMutation(orpc.forms.fields.arrange.mutationOptions(change));
  const removeStep = useMutation(orpc.forms.fields.removeStep.mutationOptions(change));
  const own = fields.filter((field) => field.pageNumber === pageNumber);
  const step = form.steps[pageNumber - 1];

  const move = (index: number) => (by: -1 | 1) => {
    const field = own[index];

    if (!field || !own[index + by]) return undefined;

    const ids = own
      .toSpliced(index, 1)
      .toSpliced(index + by, 0, field)
      .map((each) => each.id);

    return () => arrange.mutate({ formId: form.id, pageNumber, ids });
  };

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
      {own.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('form-step-empty', 'No fields on this step yet.')}
        </p>
      )}
      {own.map((field, index) => (
        <FieldEditor
          key={field.id}
          field={field}
          fields={fields}
          canManage={form.canManage}
          move={move(index)}
        />
      ))}
      {form.canManage && <AddField formId={form.id} pageNumber={pageNumber} />}
    </section>
  );
};

const Builder = ({ form, fields }: { form: Form; fields: FormField[] }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditForm(form.id);
  const steps = Math.max(form.steps.length, 1);

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 p-6 lg:grid-cols-3">
      <fieldset disabled={!form.canManage} className="contents">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {Array.from({ length: steps }, (_, index) => (
            <StepCard key={index} form={form} fields={fields} pageNumber={index + 1} />
          ))}
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
      <div className="lg:sticky lg:top-0 lg:self-start">
        <FormPreview form={form} fields={fields} />
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
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-4 p-6 lg:grid-cols-3">
            <Skeleton className="h-80 lg:col-span-2" />
            <Skeleton className="h-80" />
          </div>
        )}
      </ScrollArea>
    </PageContainer>
  );
};
