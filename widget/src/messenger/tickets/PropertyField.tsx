import { openDatePicker } from '../../shared/picker.ts';
import { useText } from '../../shared/text.ts';
import type { NewTicket, Property } from '../api.ts';

/** What every input of a property carries: whether it is required, and its error once refused. */
type Aria = { 'aria-required': boolean; 'aria-invalid': boolean; 'aria-describedby'?: string };

/** A property's value, as `/tickets` takes it. */
export type PropertyValue = NewTicket['propertiesData'][string];

type FieldProps = {
  property: Property;
  value: unknown;
  aria: Aria;
  onChange: (value: PropertyValue) => void;
};

const textOf = (value: unknown) => (typeof value === 'string' ? value : '');

/** `list` with `item` in it when `on`, without it otherwise. */
export const toggled = (list: string[], item: string, on: boolean) =>
  on ? [...list, item] : list.filter((other) => other !== item);

/** A choice property: one of its options, or several. */
const Choices = ({ property, value, aria, onChange }: FieldProps) => {
  const { t } = useText();

  if (property.type === 'select')
    return (
      <select
        {...aria}
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
            {...aria}
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
const Input = ({ property, value, aria, onChange }: FieldProps) => {
  switch (property.type) {
    case 'textarea':
      return (
        <textarea
          {...aria}
          value={textOf(value)}
          onInput={(event) => onChange(event.currentTarget.value || null)}
        />
      );
    case 'number':
      return (
        <input
          {...aria}
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
          {...aria}
          type="date"
          onClick={openDatePicker}
          value={textOf(value)}
          onInput={(event) => onChange(event.currentTarget.value || null)}
        />
      );
    case 'boolean':
      return (
        <input
          {...aria}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
      );
    case 'select':
    case 'multiselect':
      return <Choices property={property} value={value} aria={aria} onChange={onChange} />;
    case 'text':
      return (
        <input
          {...aria}
          value={textOf(value)}
          onInput={(event) => onChange(event.currentTarget.value || null)}
        />
      );
  }
};

/**
 * One of the pipeline's properties, labelled, with its description under it, and a note after it
 * when the visitor left it empty though it is required, which its input names as its error.
 */
export const PropertyField = ({
  property,
  missing,
  ...props
}: Omit<FieldProps, 'aria'> & { missing: boolean }) => {
  const { t } = useText();
  const error = `${property.id}-error`;

  const aria = {
    'aria-required': property.isRequired,
    'aria-invalid': missing,
    'aria-describedby': missing ? error : undefined,
  };

  return (
    <div class="fl-field">
      <label class={property.type === 'boolean' ? 'fl-field fl-check' : 'fl-field'}>
        <span>
          {property.label}
          {property.isRequired && ' *'}
        </span>
        <Input property={property} aria={aria} {...props} />
        {property.description && <small>{property.description}</small>}
      </label>
      {missing && (
        <span id={error} class="fl-error" role="alert">
          {t('This field is required')}
        </span>
      )}
    </div>
  );
};
