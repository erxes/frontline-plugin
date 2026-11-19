import { useText } from '../../shared/text.ts';
import type { Property } from '../api.ts';

type FieldProps = { property: Property; value: unknown; onChange: (value: unknown) => void };

const textOf = (value: unknown) => (typeof value === 'string' ? value : '');

/** `list` with `item` in it when `on`, without it otherwise. */
export const toggled = (list: string[], item: string, on: boolean) =>
  on ? [...list, item] : list.filter((other) => other !== item);

/** A choice property: one of its options, or several. */
const Choices = ({ property, value, onChange }: FieldProps) => {
  const { t } = useText();

  if (property.type === 'select')
    return (
      <select
        value={textOf(value)}
        onChange={(event) => onChange(event.currentTarget.value || null)}
      >
        <option value="">{t('Pick one')}</option>
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

/** The input a property of `type` takes; an empty one sends null, a date `YYYY-MM-DD`. */
const Input = ({ property, value, onChange }: FieldProps) => {
  switch (property.type) {
    case 'textarea':
      return (
        <textarea
          value={textOf(value)}
          onInput={(event) => onChange(event.currentTarget.value || null)}
        />
      );
    case 'number':
      return (
        <input
          type="number"
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
          value={textOf(value)}
          onInput={(event) => onChange(event.currentTarget.value || null)}
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
          value={textOf(value)}
          onInput={(event) => onChange(event.currentTarget.value || null)}
        />
      );
  }
};

/** One of the pipeline's properties, labelled, with its description under it. */
export const PropertyField = (props: FieldProps) => (
  <label class={props.property.type === 'boolean' ? 'fl-field fl-check' : 'fl-field'}>
    <span>{props.property.label}</span>
    <Input {...props} />
    {props.property.description && <small>{props.property.description}</small>}
  </label>
);
