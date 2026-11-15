import { Card, Form, Input, Select, Switch, Textarea } from 'erxes-ui';
import type { ReactNode } from 'react';
import { type FieldPathByValue, useFormContext } from 'react-hook-form';
import type { MessengerForm } from './queries.ts';

/** One card of the settings page: a title, a line on what it's for, and its fields in a grid. */
export const SettingsCard = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <Card>
    <Card.Header>
      <Card.Title>{title}</Card.Title>
      <Card.Description>{description}</Card.Description>
    </Card.Header>
    <Card.Content>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </Card.Content>
  </Card>
);

/** A text setting; `long` makes it a full-width text box. */
export const TextRow = ({
  name,
  label,
  long = false,
}: {
  name: FieldPathByValue<MessengerForm, string>;
  label: string;
  long?: boolean;
}) => {
  const { control } = useFormContext<MessengerForm>();

  return (
    <Form.Field
      control={control}
      name={name}
      render={({ field }) => (
        <Form.Item className={long ? 'sm:col-span-2' : undefined}>
          <Form.Label>{label}</Form.Label>
          <Form.Control>{long ? <Textarea {...field} /> : <Input {...field} />}</Form.Control>
          <Form.Message />
        </Form.Item>
      )}
    />
  );
};

/** An on/off setting, with its label and a hint beside the switch. */
export const SwitchRow = ({
  name,
  label,
  hint,
}: {
  name: FieldPathByValue<MessengerForm, boolean>;
  label: string;
  hint: string;
}) => {
  const { control } = useFormContext<MessengerForm>();

  return (
    <Form.Field
      control={control}
      name={name}
      render={({ field }) => (
        <Form.Item>
          <div className="flex items-start gap-3">
            <Form.Control>
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </Form.Control>
            <div className="flex flex-col gap-1">
              <Form.Label>{label}</Form.Label>
              <Form.Description>{hint}</Form.Description>
            </div>
          </div>
        </Form.Item>
      )}
    />
  );
};

/** A setting picked from a short fixed list. */
export const ChoiceRow = ({
  name,
  label,
  options,
}: {
  name: FieldPathByValue<MessengerForm, string>;
  label: string;
  options: { value: string; label: string }[];
}) => {
  const { control } = useFormContext<MessengerForm>();

  return (
    <Form.Field
      control={control}
      name={name}
      render={({ field }) => (
        <Form.Item>
          <Form.Label>{label}</Form.Label>
          <Select value={field.value} onValueChange={(next) => next && field.onChange(next)}>
            <Form.Control>
              <Select.Trigger aria-label={label}>
                <Select.Value>
                  {options.find((option) => option.value === field.value)?.label}
                </Select.Value>
              </Select.Trigger>
            </Form.Control>
            <Select.Content>
              {options.map((option) => (
                <Select.Item key={option.value} value={option.value}>
                  {option.label}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
          <Form.Message />
        </Form.Item>
      )}
    />
  );
};
