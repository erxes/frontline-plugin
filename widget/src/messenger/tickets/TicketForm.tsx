import { useState } from 'preact/hooks';
import type { MessengerApi, NewTicket, Ticket, TicketForms } from '../api.ts';
import { AttachButton, FileChips, messageOf, useUploads } from '../../shared/uploads.tsx';
import { PropertyField, toggled } from './PropertyField.tsx';

/** The organisation's ticket tags, each a pill the visitor ticks. */
const TagPicker = ({
  tags,
  picked,
  onChange,
}: {
  tags: TicketForms['tags'];
  picked: string[];
  onChange: (ids: string[]) => void;
}) => (
  <fieldset class="fl-field fl-tags">
    <legend>Tags</legend>
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

/** Which of the messenger's pipelines the ticket goes in, asked only when it offers several. */
const TopicSelect = ({
  forms,
  value,
  onChange,
}: {
  forms: TicketForms;
  value: string;
  onChange: (id: string) => void;
}) => (
  <label class="fl-field">
    <span>Topic</span>
    <select value={value} onChange={(event) => onChange(event.currentTarget.value)}>
      {forms.pipelines.map((pipeline) => (
        <option key={pipeline.id} value={pipeline.id}>
          {pipeline.name}
        </option>
      ))}
    </select>
  </label>
);

type Draft = Omit<NewTicket, 'files'>;

/** What the visitor has filled in so far, and sending it with their uploads' receipts. */
const useDraft = (api: MessengerApi, token: string, forms: TicketForms) => {
  const [draft, setDraft] = useState<Draft>({
    pipelineId: forms.pipelines[0]?.id ?? '',
    name: '',
    description: '',
    tagIds: [],
    propertiesData: {},
  });

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const uploads = useUploads((file) => api.upload(token, file));
  const form = forms.pipelines.find((pipeline) => pipeline.id === draft.pipelineId);
  const patch = (change: Partial<Draft>) => setDraft((current) => ({ ...current, ...change }));

  /** Files the draft; a property of another topic, or one left empty, stays out. */
  const send = async () => {
    setSaving(true);
    setError(null);

    try {
      const shown = new Set(form?.properties.map((property) => property.id));

      return await api.fileTicket(token, {
        ...draft,
        files: uploads.files.map((file) => file.receipt),
        propertiesData: Object.fromEntries(
          Object.entries(draft.propertiesData).filter(
            ([id, value]) => shown.has(id) && value !== null,
          ),
        ),
      });
    } catch (failure) {
      setError(messageOf(failure));

      return null;
    } finally {
      setSaving(false);
    }
  };

  return { draft, patch, form, uploads, error, saving, send };
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
  const { draft, patch, form, uploads, error, saving, send } = useDraft(api, token, forms);

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
        <span>Subject *</span>
        <input
          required
          value={draft.name}
          onInput={(event) => patch({ name: event.currentTarget.value })}
        />
      </label>
      <label class="fl-field">
        <span>What happened</span>
        <textarea
          rows={4}
          value={draft.description}
          onInput={(event) => patch({ description: event.currentTarget.value })}
        />
      </label>
      {form?.properties.map((property) => (
        <PropertyField
          key={property.id}
          property={property}
          value={draft.propertiesData[property.id] ?? null}
          onChange={(value) =>
            patch({ propertiesData: { ...draft.propertiesData, [property.id]: value } })
          }
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
          {saving ? 'Sending…' : 'Send ticket'}
        </button>
      </div>
    </form>
  );
};
