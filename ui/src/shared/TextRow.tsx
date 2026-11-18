import type { Icon } from '@tabler/icons-react';
import { Input, PanelFormRow, Textarea } from 'erxes-ui';
import { type FocusEvent, type ReactNode, useId } from 'react';

/**
 * A draft's text field in core's side panel: the row and the input the form reads by `name`,
 * a text box with `multiline`. The row's label names the input (`htmlFor`), so a click on the
 * label focuses it.
 */
export const TextRow = ({
  label,
  icon,
  name,
  required,
  error,
  placeholder,
  defaultValue,
  maxLength,
  multiline,
  type,
  hint,
  onBlur,
}: {
  label: string;
  icon: Icon;
  name: string;
  required?: boolean;
  error?: string;
  placeholder?: string;
  defaultValue?: string;
  maxLength?: number;
  multiline?: boolean;
  /** A one-line input's type, such as `password` for a secret the screen hides. */
  type?: 'email' | 'number' | 'password';
  /** What the field takes, or where to find it, under the control. */
  hint?: ReactNode;
  onBlur?: (value: string) => void;
}) => {
  const id = useId();

  const field = {
    id,
    name,
    required,
    placeholder,
    defaultValue,
    maxLength,
    onBlur:
      onBlur &&
      ((event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        onBlur(event.currentTarget.value)),
  };

  return (
    <PanelFormRow
      label={label}
      icon={icon}
      required={required}
      error={error}
      hint={hint}
      htmlFor={id}
    >
      {multiline ? (
        <Textarea {...field} />
      ) : (
        <Input {...field} type={type} variant="bordered" text="sm" />
      )}
    </PanelFormRow>
  );
};
