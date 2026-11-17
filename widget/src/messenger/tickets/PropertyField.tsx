import type { Property } from '../api.ts';

type FieldProps = { property: Property; value: unknown; onChange: (value: unknown) => void };

const textOf = (value: unknown) => (typeof value === 'string' ? value : '');

/** `list` with `item` in it when `on`, without it otherwise. */
export const toggled = (list: string[], item: string, on: boolean) =>
  on ? [...list, item] : list.filter((other) => other !== item);

/** A choice property: one of its options, or several. */
const Choices = ({ property, value, onChange }: FieldProps) => {
  if (property.type === 'select')
    return (
      <select
        required={property.isRequired}
        value={textOf(value)}
        onChange={(event) => onChange(event.currentTarget.value || null)}
      >
        <option value="">Pick one</option>
        {property.options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );

  const picked = Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];

  return (
    <span class="fl-options">
      {property.options.map((option) => (
        <label key={option} class="fl-check">
          <input
            type="checkbox"
            checked={picked.includes(option)}
            onChange={(event) => onChange(toggled(picked, option, event.currentTarget.checked))}
          />
          {option}
        </label>
      ))}
    </span>
  );
};

/** The input a property of `type` takes; an empty one sends null. */
const Input = ({ property, value, onChange }: FieldProps) => {
  switch (property.type) {
    case 'textarea':
      return (
        <textarea
          required={property.isRequired}
          value={textOf(value)}
          onInput={(event) => onChange(event.currentTarget.value || null)}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          required={property.isRequired}
          value={typeof value === 'number' ? value : ''}
          onInput={(event) =>
            onChange(event.currentTarget.value ? event.currentTarget.valueAsNumber : null)
          }
        />
      );
    case 'date':
      return (
        <input
          type="date"
          required={property.isRequired}
          value={textOf(value).slice(0, 10)}
          onInput={(event) => {
            const day = event.currentTarget.value;

            onChange(day ? new Date(`${day}T00:00:00Z`).toISOString() : null);
          }}
        />
      );
    case 'boolean':
      return (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
      );
    case 'select':
    case 'multiselect':
      return <Choices property={property} value={value} onChange={onChange} />;
    case 'text':
      return (
        <input
          required={property.isRequired}
          value={textOf(value)}
          onInput={(event) => onChange(event.currentTarget.value || null)}
        />
      );
  }
};

/** One of the pipeline's properties, labelled, with its description under it. */
export const PropertyField = (props: FieldProps) => (
  <label class={props.property.type === 'boolean' ? 'fl-field fl-check' : 'fl-field'}>
    <span>
      {props.property.label}
      {props.property.isRequired && ' *'}
    </span>
    <Input {...props} />
    {props.property.description && <small>{props.property.description}</small>}
  </label>
);
