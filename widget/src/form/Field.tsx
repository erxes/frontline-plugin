import { useEffect } from 'preact/hooks';
import { AttachButton, FileChips, useUploads } from '../shared/uploads.tsx';
import type { Answer, Field, FormApi } from './api.ts';

type InputProps = { field: Field; value: Answer | undefined; onChange: (value: Answer) => void };

const textOf = (value: Answer | undefined) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

/** Sets the answer to one field; the form keeps one, so effects can depend on it. */
export type SetAnswer = (fieldId: string, value: Answer) => void;

/** Files the visitor uploads to the form; the answer is their receipts. */
const FileInput = ({
  api,
  fieldId,
  setAnswer,
}: {
  api: FormApi;
  fieldId: string;
  setAnswer: SetAnswer;
}) => {
  const uploads = useUploads(api.upload);

  useEffect(() => {
    setAnswer(
      fieldId,
      uploads.files.map((file) => file.receipt),
    );
  }, [uploads.files, fieldId, setAnswer]);

  return (
    <div class="fl-files">
      <FileChips uploads={uploads} />
      <AttachButton uploads={uploads} />
    </div>
  );
};

/** Options to pick: radios for one, check boxes for several. */
const Choices = ({ field, value, onChange }: InputProps) => {
  const several = field.type === 'check';
  const picked = Array.isArray(value) ? value : [];

  return (
    <span class="fl-options">
      {field.options.map((option) => (
        <label key={option} class="fl-check">
          <input
            type={several ? 'checkbox' : 'radio'}
            name={field.id}
            checked={several ? picked.includes(option) : value === option}
            onChange={(event) => {
              const { checked } = event.currentTarget;

              onChange(
                several
                  ? checked
                    ? [...picked, option]
                    : picked.filter((item) => item !== option)
                  : option,
              );
            }}
          />
          {option}
        </label>
      ))}
    </span>
  );
};

/** A one-line input for a text, date, email or phone field; Preact types each `type` apart. */
const TextInput = ({ field, value, onChange }: InputProps) => {
  const props = {
    id: field.id,
    required: field.isRequired,
    placeholder: field.placeholder ?? '',
    value: textOf(value),
    onInput: (event: { currentTarget: HTMLInputElement }) => onChange(event.currentTarget.value),
  };

  switch (field.type) {
    case 'date':
    case 'core:customer:birthDate':
      return <input {...props} type="date" />;
    case 'core:customer:email':
      return <input {...props} type="email" />;
    case 'core:customer:phone':
      return <input {...props} type="tel" />;
    default:
      return <input {...props} type="text" />;
  }
};

/** Whether the visitor types the field's answer into a list's search input. */
export const searches = (field: Field) =>
  field.allowSearch && ['select', 'select:countries', 'core:customer:sex'].includes(field.type);

/**
 * A long list's input: the visitor types and the browser offers the options that match. Text
 * that matches one but for case becomes it; the step refuses any other text (`FormView.tsx`).
 */
const SearchSelect = ({ field, value, onChange }: InputProps) => (
  <>
    <input
      id={field.id}
      list={`${field.id}-options`}
      required={field.isRequired}
      autocomplete="off"
      placeholder={field.placeholder || 'Type to search'}
      value={textOf(value)}
      onInput={(event) => {
        const typed = event.currentTarget.value;

        onChange(
          field.options.find((option) => option.toLowerCase() === typed.toLowerCase()) ?? typed,
        );
      }}
    />
    <datalist id={`${field.id}-options`}>
      {field.options.map((option) => (
        <option key={option} value={option} />
      ))}
    </datalist>
  </>
);

/** The input a field of its type takes. */
const Input = ({ field, value, onChange }: InputProps) => {
  const common = { id: field.id, required: field.isRequired, placeholder: field.placeholder ?? '' };

  switch (field.type) {
    case 'textarea':
    case 'core:customer:description':
      return (
        <textarea
          {...common}
          rows={4}
          value={textOf(value)}
          onInput={(event) => onChange(event.currentTarget.value)}
        />
      );
    case 'number':
      return (
        <input
          {...common}
          type="number"
          value={textOf(value)}
          onInput={(event) => onChange(event.currentTarget.valueAsNumber)}
        />
      );
    case 'boolean':
      return (
        <input
          id={field.id}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
      );
    case 'select':
    case 'select:countries':
    case 'core:customer:sex':
      return field.allowSearch ? (
        <SearchSelect field={field} value={value} onChange={onChange} />
      ) : (
        <select
          id={field.id}
          required={field.isRequired}
          value={textOf(value)}
          onChange={(event) => onChange(event.currentTarget.value)}
        >
          <option value="">{field.placeholder || 'Pick one'}</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case 'radio':
    case 'check':
      return <Choices field={field} value={value} onChange={onChange} />;
    default:
      return <TextInput field={field} value={value} onChange={onChange} />;
  }
};

/** One field: its label, input, description and what the visitor must fix in it. */
export const FieldRow = ({
  api,
  field,
  value,
  error,
  setAnswer,
}: {
  api: FormApi;
  field: Field;
  value: Answer | undefined;
  error: string | undefined;
  setAnswer: SetAnswer;
}) => {
  const files = field.type === 'file' || field.type === 'core:customer:avatar';
  const group = files || field.type === 'radio' || field.type === 'check';
  const Wrapper = group ? 'fieldset' : 'div';

  return (
    <Wrapper class={field.column === 1 ? 'fl-field fl-half' : 'fl-field'}>
      {group ? (
        <legend>
          {field.label}
          {field.isRequired && ' *'}
        </legend>
      ) : (
        <label for={field.id}>
          {field.label}
          {field.isRequired && ' *'}
        </label>
      )}
      {files ? (
        <FileInput api={api} fieldId={field.id} setAnswer={setAnswer} />
      ) : (
        <Input field={field} value={value} onChange={(answer) => setAnswer(field.id, answer)} />
      )}
      {field.description && <small>{field.description}</small>}
      {error && (
        <p class="fl-error" role="alert">
          {error}
        </p>
      )}
    </Wrapper>
  );
};
