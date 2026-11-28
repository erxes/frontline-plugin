import { requiredByConditions, shownByConditions } from '@frontline/api/conditions';
import { unanswered } from '@frontline/api/logic';
import { type Dispatch, type StateUpdater, useEffect, useState } from 'preact/hooks';
import type { MessengerApi, NewTicket, Ticket, TicketForms } from '../api.ts';
import type { Uploaded } from '../../shared/http.ts';
import { AttachButton, FileChips, useUploads } from '../../shared/uploads.tsx';
import { useText } from '../../shared/text.ts';
import { PropertyField, type PropertyValue, toggled } from './PropertyField.tsx';

/** The organisation's ticket tags, each a pill the visitor ticks. */
const TagPicker = ({
  tags,
  picked,
  onChange,
}: {
  tags: TicketForms['tags'];
  picked: string[];
  onChange: (ids: string[]) => void;
}) => {
  const { t } = useText();

  return (
    <fieldset class="fl-field fl-tags">
      <legend>{t('Tags')}</legend>
      {tags.map((tag) => (
        <label key={tag.id} class="fl-tag" style={{ '--fl-tag': tag.colorCode ?? undefined }}>
          <input
            type="checkbox"
            checked={picked.includes(tag.id)}
            onChange={(event) => onChange(toggled(picked, tag.id, event.currentTarget.checked))}
          />
          {tag.name}
        </label>
      ))}
    </fieldset>
  );
};

/** Which of the messenger's pipelines the ticket goes in, asked only when it offers several. */
const TopicSelect = ({
  forms,
  value,
  onChange,
}: {
  forms: TicketForms;
  value: string;
  onChange: (id: string) => void;
}) => {
  const { t } = useText();

  return (
    <label class="fl-field">
      <span>{t('Topic')}</span>
      <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
        {forms.pipelines.map((pipeline) => (
          <option key={pipeline.id} value={pipeline.id}>
            {pipeline.name}
          </option>
        ))}
      </select>
    </label>
  );
};

type Draft = Omit<NewTicket, 'files'>;

/**
 * Each visitor's half-written ticket and its files, by their session's token, kept while the page
 * lives so leaving the form loses none. A visitor who signs out gets a new token and a blank form.
 */
const drafts = new Map<string, { draft: Draft; files: Uploaded[] }>();

/**
 * The draft topic's properties that their show rules show, which of them need an answer, their
 * values to send, setting one, and the shown required ones still empty once the visitor tried to
 * send in this topic. A box the visitor
 * never ticked is unticked, as core keeps it.
 */
const useProperties = (
  forms: TicketForms,
  draft: Draft,
  setDraft: Dispatch<StateUpdater<Draft>>,
) => {
  const [refusedIn, setRefusedIn] = useState<string | null>(null);
  const properties = forms.pipelines.find(({ id }) => id === draft.pipelineId)?.properties ?? [];

  const values = Object.fromEntries(
    properties.map(({ id, type }) => [
      id,
      draft.propertiesData[id] ?? (type === 'boolean' ? false : null),
    ]),
  );

  const shown = shownByConditions(properties, values);

  const required = new Set(
    shown.flatMap((field) => (requiredByConditions(field, shown, values) ? [field.id] : [])),
  );

  const sent = Object.fromEntries(
    shown.flatMap(({ id }) => {
      const value = values[id];

      return value === undefined || unanswered(value) ? [] : [[id, value]];
    }),
  );

  const empty = shown.filter(({ id }) => required.has(id) && !(id in sent));
  const missing = refusedIn === draft.pipelineId ? empty.map(({ id }) => id) : [];

  const answer = (id: string, value: PropertyValue) =>
    setDraft((current) => ({
      ...current,
      propertiesData: { ...current.propertiesData, [id]: value },
    }));

  /** Whether each shown required property has a value, marking those that don't. */
  const answered = () => {
    setRefusedIn(draft.pipelineId);

    return empty.length === 0;
  };

  return { shown, required, sent, missing, answer, answered };
};

/**
 * What the visitor has filled in so far, kept when they leave the form or close the panel, and
 * sending it with their uploads' receipts.
 */
const useDraft = (api: MessengerApi, token: string, forms: TicketForms) => {
  const kept = drafts.get(token);

  const [draft, setDraft] = useState<Draft>(
    kept && forms.pipelines.some((pipeline) => pipeline.id === kept.draft.pipelineId)
      ? kept.draft
      : {
          pipelineId: forms.pipelines[0]?.id ?? '',
          name: '',
          description: '',
          tagIds: [],
          propertiesData: {},
        },
  );

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { messageOf } = useText();
  const uploads = useUploads((file) => api.upload(token, file), kept?.files);
  const properties = useProperties(forms, draft, setDraft);
  const patch = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }));

  useEffect(() => {
    drafts.set(token, { draft, files: uploads.files });
  }, [token, draft, uploads.files]);

  /**
   * Files the draft once each shown required property has a value; a property of another topic,
   * one its Logic hides, or one left empty, stays out.
   */
  const send = async () => {
    if (!properties.answered()) return null;

    setSaving(true);
    setError(null);

    try {
      const filed = await api.fileTicket(token, {
        ...draft,
        files: uploads.files.map((file) => file.receipt),
        propertiesData: properties.sent,
      });

      drafts.delete(token);

      return filed;
    } catch (failure) {
      setError(messageOf(failure));

      return null;
    } finally {
      setSaving(false);
    }
  };

  return { draft, patch, properties, uploads, error, saving, send };
};

/**
 * A new ticket: the topic it goes in, a subject, what happened, the topic's properties, tags and
 * files. Filing it hands the visitor's view of the ticket to `onFiled`.
 */
export const TicketForm = ({
  api,
  token,
  forms,
  onFiled,
}: {
  api: MessengerApi;
  token: string;
  forms: TicketForms;
  onFiled: (ticket: Ticket) => void;
}) => {
  const { draft, patch, properties, uploads, error, saving, send } = useDraft(api, token, forms);
  const { t } = useText();

  const submit = async () => {
    const ticket = await send();

    if (ticket) onFiled(ticket);
  };

  return (
    <form
      class="fl-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {forms.pipelines.length > 1 && (
        <TopicSelect
          forms={forms}
          value={draft.pipelineId}
          onChange={(pipelineId) => patch({ pipelineId })}
        />
      )}
      <label class="fl-field">
        <span>{t('Subject')} *</span>
        <input
          required
          value={draft.name}
          onInput={(event) => patch({ name: event.currentTarget.value })}
        />
      </label>
      <label class="fl-field">
        <span>{t('What happened')}</span>
        <textarea
          rows={4}
          value={draft.description}
          onInput={(event) => patch({ description: event.currentTarget.value })}
        />
      </label>
      {properties.shown.map((property) => (
        <PropertyField
          key={property.id}
          property={property}
          required={properties.required.has(property.id)}
          value={draft.propertiesData[property.id] ?? null}
          missing={properties.missing.includes(property.id)}
          onChange={(value) => properties.answer(property.id, value)}
        />
      ))}
      {forms.tags.length > 0 && (
        <TagPicker
          tags={forms.tags}
          picked={draft.tagIds}
          onChange={(tagIds) => patch({ tagIds })}
        />
      )}
      <FileChips uploads={uploads} />
      {error && (
        <p class="fl-error" role="alert">
          {error}
        </p>
      )}
      <div class="fl-actions">
        <AttachButton uploads={uploads} />
        <button type="submit" class="fl-primary" disabled={saving || uploads.uploading > 0}>
          {t(saving ? 'Sending…' : 'Send ticket')}
        </button>
      </div>
    </form>
  );
};
