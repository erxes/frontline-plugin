import { IconBraces } from '@tabler/icons-react';
import { Button, Input, Skeleton, Textarea } from 'erxes-ui';
import type { SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { draftsOf, FormActions } from '../shared/Drafts.tsx';
import { ActionsMenu } from '../shared/Records.tsx';
import { Field } from '../shared/SidePanel.tsx';
import {
  type Pipeline,
  useCanManage,
  usePipeline,
  usePipelineRoute,
  usePipelineUpdate,
} from './queries.ts';

type Draft = {
  name: string;
  description: string;
  numberConfig: string;
  numberSize: string;
  nameConfig: string;
};

type Token = { token: string; label: string };

const useGeneralDraft = draftsOf<Draft>();

const draftOf = (pipeline: Pipeline): Draft => ({
  name: pipeline.name,
  description: pipeline.description ?? '',
  numberConfig: pipeline.numberConfig ?? '',
  numberSize: pipeline.numberSize?.toString() ?? '',
  nameConfig: pipeline.nameConfig ?? '',
});

const twoDigits = (value: number) => value.toString().padStart(2, '0');

/** What a ticket number made today looks like: the prefix with its dates filled, then the digits. */
const numberPreview = (config: string, size: string) => {
  const digits = Number(size);

  if (!Number.isInteger(digits) || digits < 1 || digits > 8) return null;

  const today = new Date();

  const prefix = config
    .replaceAll('{year}', today.getFullYear().toString())
    .replaceAll('{month}', twoDigits(today.getMonth() + 1))
    .replaceAll('{day}', twoDigits(today.getDate()));

  return { prefix, sequence: '0'.repeat(digits) };
};

/** The placeholders and separators a ticket's number and name are made of. */
const useTokens = () => {
  const { t } = useTranslation('frontline');

  return {
    number: [
      { token: '{year}', label: t('year', 'Year') },
      { token: '{month}', label: t('month', 'Month') },
      { token: '{day}', label: t('day', 'Day') },
      { token: '-', label: t('dash', 'Dash') },
      { token: '_', label: t('underscore', 'Underscore') },
      { token: '/', label: t('slash', 'Slash') },
    ],
    name: [
      { token: '{customer.firstName}', label: t('customers-first-name', "Customer's first name") },
      { token: '{customer.lastName}', label: t('customers-last-name', "Customer's last name") },
      { token: '{customer.email}', label: t('customers-email', "Customer's email") },
      { token: '{customer.phone}', label: t('customers-phone', "Customer's phone") },
      { token: '{company.name}', label: t('company-name', 'Company name') },
    ],
  };
};

/** A format's text field, with a menu that appends a placeholder or separator to it. */
const FormatInput = ({
  id,
  placeholder,
  value,
  onChange,
  tokens,
  editable,
}: {
  id: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  tokens: Token[];
  editable: boolean;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <>
      <Input
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {editable && (
        <ActionsMenu
          trigger={
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={t('insert-attribute', 'Insert attribute')}
            >
              <IconBraces />
            </Button>
          }
          actions={tokens.map(({ token, label }) => ({
            value: token,
            icon: null,
            label,
            onSelect: () => onChange(value + token),
          }))}
        />
      )}
    </>
  );
};

type FieldsProps = {
  value: Draft;
  onChange: (patch: Partial<Draft>) => void;
  editable: boolean;
};

/** The ticket number's prefix and digits, and what a number made today looks like. */
const TicketNumber = ({ value, onChange, editable }: FieldsProps) => {
  const { t } = useTranslation('frontline');
  const preview = numberPreview(value.numberConfig, value.numberSize);

  return (
    <Field
      id="pipeline-number"
      label={t('ticket-number', 'Ticket number')}
      hint={t(
        'ticket-number-hint',
        'A prefix, then a sequence of 1 to 8 digits. Without digits, tickets get no number.',
      )}
    >
      <div className="flex gap-2">
        <FormatInput
          id="pipeline-number"
          placeholder="{year}-"
          value={value.numberConfig}
          onChange={(numberConfig) => onChange({ numberConfig })}
          tokens={useTokens().number}
          editable={editable}
        />
        <Input
          type="number"
          min={1}
          max={8}
          placeholder="1-8"
          aria-label={t('ticket-number-digits', 'Digits')}
          className="w-min"
          value={value.numberSize}
          onChange={(event) => onChange({ numberSize: event.target.value })}
        />
      </div>
      <p aria-live="polite" className="flex gap-3 rounded-md bg-muted px-3 py-2 text-sm">
        <span className="text-muted-foreground">{t('preview', 'Preview')}</span>
        {preview ? (
          <span className="font-mono">
            <span className="text-muted-foreground">{preview.prefix}</span>
            {preview.sequence}
          </span>
        ) : (
          <span className="text-muted-foreground">{t('none', 'None')}</span>
        )}
      </p>
    </Field>
  );
};

const Fields = ({ value, onChange, editable }: FieldsProps) => {
  const { t } = useTranslation('frontline');

  return (
    <fieldset disabled={!editable} className="flex flex-col gap-4">
      <Field id="pipeline-name" label={t('pipeline-name', 'Pipeline name')}>
        <Input
          id="pipeline-name"
          required
          value={value.name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </Field>
      <Field id="pipeline-description" label={t('description', 'Description')}>
        <Textarea
          id="pipeline-description"
          value={value.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </Field>
      <TicketNumber value={value} onChange={onChange} editable={editable} />
      <Field id="pipeline-ticket-name" label={t('ticket-name', 'Ticket name')}>
        <div className="flex gap-2">
          <FormatInput
            id="pipeline-ticket-name"
            placeholder="{customer.firstName}"
            value={value.nameConfig}
            onChange={(nameConfig) => onChange({ nameConfig })}
            tokens={useTokens().name}
            editable={editable}
          />
        </div>
      </Field>
    </fieldset>
  );
};

/** The fields, saved in place; leaving the page keeps the draft. */
const GeneralForm = ({ pipeline, canManage }: { pipeline: Pipeline; canManage: boolean }) => {
  const { t } = useTranslation('frontline');
  const draft = useGeneralDraft(pipeline.id, draftOf(pipeline));
  const update = usePipelineUpdate(draft.clear);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const { numberSize, ...fields } = draft.value;

    update.mutate({
      id: pipeline.id,
      ...fields,
      numberSize: numberSize ? Number(numberSize) : null,
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 md:max-w-2xl">
      <Fields value={draft.value} onChange={draft.change} editable={canManage} />
      {canManage && (
        <FormActions
          dirty={draft.dirty}
          onDiscard={draft.clear}
          disabled={update.isPending}
          submit={update.isPending ? t('saving', 'Saving…') : t('save', 'Save')}
        />
      )}
    </form>
  );
};

/** The pipeline's name, description and how its tickets are numbered and named. */
export const PipelineGeneralPage = () => {
  const { channelId, pipelineId } = usePipelineRoute();
  const canManage = useCanManage(channelId);
  const { data } = usePipeline(pipelineId);

  if (!data) return <Skeleton className="h-60 md:max-w-2xl" />;

  return <GeneralForm key={data.id} pipeline={data} canManage={canManage} />;
};
