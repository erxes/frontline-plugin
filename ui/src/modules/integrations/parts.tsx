import { IconPlus, IconX } from '@tabler/icons-react';
import { Badge, Button, Input } from 'erxes-ui';
import { type KeyboardEvent, useRef } from 'react';
import { useTranslation } from 'react-i18next';

// What the integrations page and the account and bot panels share.

/** Whether the provider last answered for the account or bot. */
export const StatusBadge = ({ status }: { status: 'healthy' | 'broken' }) => {
  const { t } = useTranslation('frontline');

  return (
    <Badge variant={status === 'healthy' ? 'success' : 'destructive'}>
      {status === 'healthy' ? t('working', 'Working') : t('broken', 'Broken')}
    </Badge>
  );
};

/** One row of a panel's list: its text, and a button that takes it out. */
export const ItemRow = ({
  label,
  hint,
  onRemove,
}: {
  label: string;
  hint?: string;
  onRemove: () => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <li className="flex items-center gap-2 px-2 py-1 text-xs">
      <span className="flex-1 truncate">
        {label}
        {hint && <span className="ml-2 text-muted-foreground">{hint}</span>}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('remove-item', 'Remove {{name}}', { name: label })}
        onClick={onRemove}
      >
        <IconX />
      </Button>
    </li>
  );
};

/**
 * A row's inputs and its Add button, cleared once the item is added; Enter in an input adds it
 * too. No form of its own, so it can sit in a form that saves more, such as connect: a required
 * input left empty takes the focus instead of blocking that form.
 */
export const AddRow = ({
  fields,
  onAdd,
}: {
  fields: { name: string; label: string; maxLength?: number; required?: boolean; type?: string }[];
  onAdd: (values: Record<string, string>) => void;
}) => {
  const { t } = useTranslation('frontline');
  const row = useRef<HTMLFieldSetElement>(null);

  const add = () => {
    const inputs = [...(row.current?.querySelectorAll('input') ?? [])];

    const empty = fields.findIndex(
      (field, index) => field.required && !inputs[index]?.value.trim(),
    );

    if (empty !== -1) return inputs[empty]?.focus();

    onAdd(
      Object.fromEntries(
        fields.map(({ name }, index) => [name, inputs[index]?.value.trim() ?? '']),
      ),
    );

    for (const input of inputs) input.value = '';
  };

  return (
    <fieldset ref={row} className="m-0 flex min-w-0 items-center gap-2 border-0 px-2 py-1">
      {fields.map((field) => (
        <Input
          key={field.name}
          type={field.type}
          aria-required={field.required}
          maxLength={field.maxLength}
          aria-label={field.label}
          placeholder={field.label}
          variant="bordered"
          text="sm"
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key !== 'Enter') return;

            event.preventDefault();
            add();
          }}
        />
      ))}
      <Button type="button" variant="secondary" onClick={add}>
        <IconPlus />
        {t('add', 'Add')}
      </Button>
    </fieldset>
  );
};
